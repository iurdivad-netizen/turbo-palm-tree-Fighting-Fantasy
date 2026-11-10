#!/usr/bin/env node
/**
 * Simulates many playthroughs of an adventure using the REAL game logic from index.html
 * (loaded in headless Chromium), driven by simple bot players, and writes the raw results as JSON.
 *
 * Usage:  node simulate_playthroughs.js [book.json] [games-per-policy] [out.json] [seed]
 *   defaults: CURSE_OF_HOLLOWS_END.json 1000 simulation-results.json 20240601
 *
 * Policies
 *   random  - picks uniformly among the available actions (a lower bound: a player who never plans)
 *   explorer- a thorough human: visits new sections first, avoids the final door until it holds the Silver Key
 *             and her true name (or gets impatient), then plays like 'guided'
 *   guided  - walks toward the items the final confrontation needs (Silver Key, her true name, a magical
 *             weapon), then to the final door; 15% of its choices are random, so it also explores
 * Both bots flee when STAMINA is low and drink/eat healing items when hurt.
 *
 * Requires: playwright (npm i playwright) - the Chromium bundled with it is used.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const bookFile = process.argv[2] || 'CURSE_OF_HOLLOWS_END.json';
const games = parseInt(process.argv[3] || '1000', 10);
const outFile = process.argv[4] || 'simulation-results.json';
const seed = parseInt(process.argv[5] || '20240601', 10);

// ---------------------------------------------------------------------------------------------
// This function runs INSIDE the page, where GameState, canMakeChoice, fightRound ... exist.
// ---------------------------------------------------------------------------------------------
function runInPage(book, policy, N, seed, opts) {
  const MAX_STEPS = opts.maxSteps;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(seed);
  Math.random = rng;                       // dice and bot decisions are reproducible
  window.alert = () => {};
  window.confirm = () => true;
  window.render = () => {};                // no DOM work needed
  GameState.schedule = fn => fn();         // no delays between a result and the next section

  const sec = new Map(book.sections.map(s => [s.id, s]));
  const TERMINAL = { 400: 'victory', 999: 'defeat', 4: 'instant-death', 39: 'instant-death', 65: 'instant-death' };
  const WEAPON_SOURCES = book.sections.filter(s => (s.addItems || []).some(i => (i.properties || []).includes('magical'))).map(s => s.id);
  const KEY_SOURCES = book.sections.filter(s => (s.addItems || []).some(i => i.id === 'silver-key')).map(s => s.id);
  const NAME_SOURCES = book.sections.filter(s => (s.addItems || []).some(i => i.id === 'true-name')).map(s => s.id);

  // ----- graph (ignoring conditions) for the guided bot -----
  function successors(s) {
    const out = [];
    (s.choices || []).forEach(c => out.push(c.targetSection));
    const tl = s.testLuck || {};
    if (tl.successSection) out.push(tl.successSection);
    if (tl.failureSection) out.push(tl.failureSection);
    ((s.diceRoll || {}).outcomes || []).forEach(o => o.targetSection && out.push(o.targetSection));
    const cc = s.combat ? (Array.isArray(s.combat) ? s.combat : [s.combat]) : [];
    cc.forEach(e => { if (e.onVictorySection) out.push(e.onVictorySection); if (e.fleeSection) out.push(e.fleeSection); });
    return out.filter(t => sec.has(t) && !TERMINAL[t] || t === 400);
  }
  const preds = new Map();
  book.sections.forEach(s => successors(s).forEach(t => { if (!preds.has(t)) preds.set(t, []); preds.get(t).push(s.id); }));
  const distCache = new Map();
  function distancesTo(targets, noCache) {
    const key = targets.join(',');
    if (!noCache && distCache.has(key)) return distCache.get(key);
    const dist = new Map(); const q = [];
    targets.forEach(t => { dist.set(t, 0); q.push(t); });
    while (q.length) { const x = q.shift(); (preds.get(x) || []).forEach(p => { if (!dist.has(p)) { dist.set(p, dist.get(x) + 1); q.push(p); } }); }
    if (!noCache) distCache.set(key, dist); return dist;
  }

  const has = id => GameState.hasItem(id);
  const hasMagical = () => GameState.inventory.some(i => i.type === 'weapon' && (i.properties || []).includes('magical'));
  function targetSet() {
    if (!has('silver-key')) return KEY_SOURCES;
    if (!has('true-name')) return NAME_SOURCES;
    if (!hasMagical()) return WEAPON_SOURCES;
    return [395];
  }

  // ----- helpers mirroring what the page shows the player -----
  function visibleChoices(s) {
    if (!(s.choices && s.choices.length && (!s.combat || GameState.combatDone) && choicesUnlocked(s))) return [];
    const out = [];
    s.choices.forEach((c, i) => {
      if (c.once && GameState.usedOnce.has(s.id)) return;
      if (c.conditions && hasNegativeCondition(c.conditions) && !canMakeChoice({ conditions: stripPositive(c.conditions) })) return;
      if (canMakeChoice(c)) out.push({ t: 'choice', i, c });
    });
    return out;
  }
  function actionsFor(s) {
    const a = [];
    if (rollPending(s, 'diceRoll')) a.push({ t: 'dice' });
    if (rollPending(s, 'testLuck')) a.push({ t: 'luck' });
    return a.concat(visibleChoices(s));
  }
  function actionTargets(s, act) {
    if (act.t === 'choice') return [act.c.targetSection];
    if (act.t === 'luck') return [s.testLuck.successSection, s.testLuck.failureSection].filter(Boolean);
    return ((s.diceRoll || {}).outcomes || []).map(o => o.targetSection).filter(Boolean);
  }

  function healIfHurt(threshold) {
    for (let guard = 0; guard < 12; guard++) {
      const st = GameState.stats; if (!st || st.stamina > st.initialStamina * threshold) return;
      const missing = st.initialStamina - st.stamina;
      const food = GameState.inventory.find(i => i.type === 'food' && /stamina/.test(i.restore || ''));
      const potion = GameState.inventory.find(i => i.type === 'potion' && /\+\d+\s*stamina/.test(i.restore || ''));
      const gain = it => parseInt((it.restore.match(/\+(\d+)/) || [0, 0])[1]);
      let pick = null;
      if (potion && missing >= gain(potion)) pick = potion; else if (food && missing >= gain(food)) pick = food;
      else if (potion && st.stamina <= 6) pick = potion; else if (food && st.stamina <= 8) pick = food;
      if (!pick) return;
      GameState.useItem(pick.uid);
      stats.itemsUsed++;
    }
  }

  function nearest(s, acts, dist) {
    let best = [], bestD = Infinity;
    acts.forEach(a => {
      const d = Math.min(...actionTargets(s, a).map(t => dist.has(t) ? dist.get(t) : Infinity), Infinity);
      if (d < bestD) { bestD = d; best = [a]; } else if (d === bestD) best.push(a);
    });
    return best[Math.floor(rng() * best.length)];
  }
  function pickAction(s, acts, visited, steps) {
    const randomPick = list => list[Math.floor(rng() * list.length)];
    if (policy === 'random') return randomPick(acts);
    if (rng() < opts.exploreRate) return randomPick(acts);
    const ready = has('silver-key') && has('true-name');
    if (policy === 'explorer' && steps < opts.explorerPatience && !ready) {
      const avoid = t => t === 395 || t === 362;
      let pool = acts.filter(a => !actionTargets(s, a).some(avoid)); if (!pool.length) pool = acts;
      const fresh = pool.filter(a => actionTargets(s, a).some(t => !visited.has(t)));
      if (fresh.length) return randomPick(fresh);
      const unvisited = book.sections.map(x => x.id).filter(id => !visited.has(id) && !TERMINAL[id] && id !== 0 && id !== 395 && id !== 362);
      if (unvisited.length) return nearest(s, pool, distancesTo(unvisited, true));
      return randomPick(pool);
    }
    if (policy === 'explorer' && steps >= opts.explorerPatience && !ready) return nearest(s, acts, distancesTo([395]));
    return nearest(s, acts, distancesTo(targetSet()));
  }

  // ----- aggregate counters -----
  const agg = {
    policy, games: N, maxSteps: MAX_STEPS,
    outcomes: {}, endSections: {}, deathCauses: {}, deathSections: {}, stuckSections: {},
    steps: [], uniqueSections: [], finalStamina: [], finalSkill: [], finalLuck: [], gold: [],
    visitGames: {}, firstVisits: {},
    combat: {}, hazards: {}, luckTests: { total: 0, success: 0 }, dice: { total: 0 },
    gate: { ritualAttempts: 0, withKeyAndName: 0, missingKey: 0, missingName: 0, ritualLucky: 0, finalFightEntered: 0, finalFightWon: 0, finalFightLost: 0, finalFightNoMagic: 0, finalFightWithMagic: 0 },
    itemsFound: {}, itemGamesWithKey: 0, itemGamesWithName: 0, itemGamesWithMagic: 0,
    damage: {}, victoryRuns: [], stats: null
  };
  const stats = { itemsUsed: 0 };
  const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

  for (let g = 0; g < N; g++) {
    GameState.loadBook(book);
    GameState.startGame();
    stats.itemsUsed = 0;
    const visited = new Set([GameState.currentSection]);
    let steps = 0, outcome = null, cause = null, lastCombat = null, hpLow = 20, finalFightSeen = false;
    const seenItems = new Set();
    let lastSection = GameState.currentSection;
    let prevSec = null;
    inc(agg.visitGames, lastSection, 0);
    const seenThisGame = new Set([lastSection]);
    const trace = g < 3 ? [] : null;

    while (steps < MAX_STEPS) {
      steps++;
      if (GameState.isGameOver) { outcome = 'death'; cause = cause || ('hazard @' + GameState.currentSection); inc(agg.deathSections, GameState.currentSection); break; }
      const id = GameState.currentSection; const s = sec.get(id);
      if (!seenThisGame.has(id)) { seenThisGame.add(id); }
      if (id !== lastSection) { lastSection = id; }
      if (TERMINAL[id]) { outcome = TERMINAL[id]; inc(agg.deathVia = agg.deathVia || {}, (prevSec === null ? 'start' : prevSec) + ' > ' + id); if (outcome !== 'victory') { cause = cause || ('section ' + id); inc(agg.deathSections, id); } break; }
      hpLow = Math.min(hpLow, GameState.stats.stamina);

      // ---- combat ----
      if (s.combat && !GameState.combatDone && !GameState.inCombat) {
        healIfHurt(opts.preFightHeal);
        const combats = Array.isArray(s.combat) ? s.combat : [s.combat];
        const key = id + ' ' + combats.map(c => c.enemyName).join(' + ');
        const rec = agg.combat[key] || (agg.combat[key] = { section: id, enemies: combats.map(c => c.enemyName).join(' + '), fights: 0, won: 0, lost: 0, fled: 0, stamLost: 0, rounds: 0 });
        if (id === 394) { agg.gate.finalFightEntered++; finalFightSeen = true; hasMagical() ? agg.gate.finalFightWithMagic++ : agg.gate.finalFightNoMagic++; }
        rec.fights++;
        const sta0 = GameState.stats.stamina;
        startCombat(combats[0].enemyStamina);
        let guard = 0, fled = false;
        while (GameState.inCombat && !GameState.isGameOver && guard++ < 600) {
          if (GameState.stats.stamina <= 6) healIfHurt(1);
          const cur = combats[GameState.currentCombatIndex] || combats[0];
          if (canFleeNow(cur) && GameState.stats.stamina <= opts.fleeAt && GameState.stats.luck > 0) {
            const before = GameState.currentSection; fleeCombat(cur.fleeSection);
            if (GameState.currentSection !== before) { fled = true; break; }
            // an unlucky escape attempt costs the round: the enemy still attacks, so fight on
          }
          fightRound(); rec.rounds++;
        }
        rec.stamLost += Math.max(0, sta0 - GameState.stats.stamina);
        if (fled) rec.fled++;
        else if (GameState.isGameOver || GameState.stats.stamina <= 0 || GameState.currentSection === 999) { rec.lost++; lastCombat = key; cause = 'combat: ' + combats.map(c => c.enemyName).join(' + ') + ' @' + id; if (id === 394) agg.gate.finalFightLost++; }
        else { rec.won++; if (id === 394) agg.gate.finalFightWon++; }
        continue;
      }

      healIfHurt(opts.healAt);
      const acts = actionsFor(s);
      if (!acts.length) { outcome = 'stuck'; inc(agg.stuckSections, id); (agg.stuckInfo = agg.stuckInfo || []).push({ id, inCombat: GameState.inCombat, combatDone: GameState.combatDone, idx: GameState.currentCombatIndex, stamina: GameState.stats.stamina, enemyStamina: GameState.enemyCurrentStamina, gameOver: GameState.isGameOver }); break; }

      if (id === 395) {
        if (!agg.gate._seen) agg.gate._seen = new Set();
      }
      const act = pickAction(s, acts, visited, steps);
      if (trace) trace.push(id + ':' + act.t + (act.t === 'choice' ? '>' + act.c.targetSection : '') + ' sta' + GameState.stats.stamina + ' sk' + GameState.stats.skill + ' lu' + GameState.stats.luck);
      const before = GameState.currentSection;
      const staBefore = GameState.stats.stamina;
      if (act.t === 'dice') { agg.dice.total++; handleDiceRoll(id); }
      else if (act.t === 'luck') {
        agg.luckTests.total++;
        if (id === 395) { agg.gate.ritualAttempts++; }
        handleLuckTest(id);
        const dest = GameState.currentSection;
        const ok = dest === s.testLuck.successSection && s.testLuck.successSection !== s.testLuck.failureSection ? true : (s.testLuck.successSection === s.testLuck.failureSection ? null : false);
        if (ok === true) agg.luckTests.success++;
        if (id === 395 && ok === true) agg.gate.ritualLucky++;
        const hz = agg.hazards[id] || (agg.hazards[id] = { section: id, tests: 0, success: 0, kind: 'luck' }); hz.tests++; if (ok === true) hz.success++;
      } else {
        if (id === 395) { /* choice instead of the ritual = missing key or name */ }
        handleChoice(act.c.targetSection, act.i);
      }
      // gate bookkeeping on first arrival at 395
      if (GameState.currentSection === 395 && before !== 395) {
        const k = has('silver-key'), n = has('true-name');
        if (!agg.gate._count) agg.gate._count = 0;
        agg.gate.arrivals = (agg.gate.arrivals || 0) + 1;
        if (k && n) agg.gate.withKeyAndName++; else { agg.gate.missingEither = (agg.gate.missingEither || 0) + 1; if (!k) agg.gate.missingKey++; if (!n) agg.gate.missingName++; }
      }
      {
        const where = act.t === 'choice' ? GameState.currentSection : before;   // hazards of a roll belong to the section rolled in
        const d = agg.damage[where] || (agg.damage[where] = { n: 0, net: 0, lost: 0, deaths: 0 });
        const delta = GameState.stats.stamina - staBefore;
        d.n++; d.net += delta; if (delta < 0) d.lost += -delta; if (GameState.isGameOver) d.deaths++;
      }
      prevSec = before;
      GameState.inventory.forEach(i => { if (!seenItems.has(i.id)) { seenItems.add(i.id); inc(agg.itemsFound, i.name); } });
      if (before === GameState.currentSection && !GameState.isGameOver && act.t === 'choice') { /* effect-only loop (e.g. same section) */ }
      if (GameState.currentSection !== before || true) { visited.add(GameState.currentSection); }
    }

    if (!outcome) { outcome = 'timeout'; }
    if (trace) (agg.traces = agg.traces || []).push({ outcome, cause, end: GameState.currentSection, path: trace });
    inc(agg.outcomes, outcome);
    inc(agg.endSections, GameState.currentSection);
    if (outcome === 'death' || outcome === 'defeat' || outcome === 'instant-death') inc(agg.deathCauses, cause || 'unknown');
    seenThisGame.forEach(id => inc(agg.visitGames, id));
    agg.steps.push(steps); agg.uniqueSections.push(visited.size);
    const st = GameState.stats; agg.finalStamina.push(st.stamina); agg.finalSkill.push(st.skill); agg.finalLuck.push(st.luck); agg.gold.push(st.gold || 0);
    if (seenItems.has('silver-key')) agg.itemGamesWithKey++;
    if (seenItems.has('true-name')) agg.itemGamesWithName++;
    if (GameState.inventory.some(i => (i.properties || []).includes('magical')) || [...seenItems].some(n => /longsword|mace|blessed/i.test(n))) agg.itemGamesWithMagic++;
    if (outcome === 'victory') agg.victoryRuns.push({ steps, sections: visited.size, stamina: st.stamina, skill: st.skill, lowest: hpLow, itemsUsed: stats.itemsUsed });
  }
  delete agg.gate._seen; delete agg.gate._count;
  return agg;
}

// ---------------------------------------------------------------------------------------------
(async () => {
  const book = JSON.parse(fs.readFileSync(path.resolve(bookFile), 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  await page.goto('file://' + path.resolve('index.html'));
  const opts = { maxSteps: 3000, exploreRate: 0.15, explorerPatience: 700, fleeAt: 5, healAt: 0.45, preFightHeal: 0.6 };
  const t0 = Date.now();
  const results = { book: { title: book.title, sections: book.sections.length, file: bookFile }, seed, games, opts, policies: {} };
  for (const policy of ['random', 'explorer', 'guided']) {
    const t = Date.now();
    results.policies[policy] = await page.evaluate(`(${runInPage.toString()})(${JSON.stringify(book)}, ${JSON.stringify(policy)}, ${games}, ${seed}, ${JSON.stringify(opts)})`);
    console.log(`${policy}: ${games} games in ${((Date.now() - t) / 1000).toFixed(1)}s`, JSON.stringify(results.policies[policy].outcomes));
  }
  results.pageErrors = errors.slice(0, 5);
  results.runtimeSeconds = (Date.now() - t0) / 1000;
  fs.writeFileSync(outFile, JSON.stringify(results));
  console.log(`wrote ${outFile}; page errors: ${errors.length}`);
  await browser.close();
})();
