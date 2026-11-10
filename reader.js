// The reader. All rules live in engine.js; this file shows the game and sends it what the player does.
// Books are played in format v2 (older books are upgraded when they are loaded).
'use strict';

let game = null;            // the running game (Engine.create); null until a book is loaded
let notices = [];           // what the last action said ("Lucky! (rolled 5) ...")
let rolls = [];             // the dice thrown by the last action: [{ request, dice, fresh }]
let packOpen = false;       // phones: the pack drawer
let shownSection = null;    // to move focus and scroll to the top when the section changes
let autoFightOn = false, autoFightTimer = null;
const prefs = loadPrefs();

// ---- small helpers -----------------------------------------------------------------------------------
function loadPrefs() {
    const base = { autoRoll: false, textSize: 1, markSeen: true };
    try { return Object.assign(base, JSON.parse(localStorage.getItem('ff_prefs') || '{}')); } catch (e) { return base; }
}
function savePrefs() { try { localStorage.setItem('ff_prefs', JSON.stringify(prefs)); } catch (e) { /* private window */ } }
function applyTextSize() { document.documentElement.className = `ts-${Math.min(3, Math.max(0, prefs.textSize))}`; }

// Escape text coming from books before it goes into innerHTML
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
const paragraphs = text => String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
const $ = sel => document.querySelector(sel);

let renderQueued = false;
function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    Promise.resolve().then(() => { renderQueued = false; render(); });
}

// ---- what the player does --------------------------------------------------------------------------------
function begin() { notices = []; rolls = []; }
function createGame(book) {
    return Engine.create({
        book, rng: Math.random, autoRoll: prefs.autoRoll, autoAdvance: false,
        onEvent: e => {
            if (e.type === 'message') notices.push(e.text);
            else if (e.type === 'rolled') rolls.push({ request: e.request, dice: e.dice, fresh: true });
            else if (e.type === 'change') scheduleRender();
        }
    });
}

const ui = {
    loadBook(book) {
        stopAutoFight(); begin(); shownSection = null;
        game = book ? createGame(book) : null;
        render();
    },
    start() { stopAutoFight(); begin(); game.start(); },
    restart() { stopAutoFight(); begin(); packOpen = false; game.reset(); },
    choose(id) { stopAutoFight(); begin(); game.chooseOption(id); },
    roll() { begin(); game.doRoll(); },
    fight() { begin(); game.startCombat(); },
    round() { begin(); game.fightRound(); },
    flee() { stopAutoFight(); begin(); game.flee(); },
    rollPending() { game.resolveRoll(); },
    advance() { stopAutoFight(); begin(); game.advanceNow(); },
    use(uid) { begin(); game.useItem(uid); },
    drop(uid) { game.dropItem(uid); },
    toggleAutoRoll(on) { prefs.autoRoll = !!on; savePrefs(); if (game && !autoFightOn) game.setAutoRoll(prefs.autoRoll); },
    toggleMarkSeen(on) { prefs.markSeen = !!on; savePrefs(); render(); },
    setSize(delta) { prefs.textSize = Math.min(3, Math.max(0, prefs.textSize + delta)); savePrefs(); applyTextSize(); },
    togglePack() { packOpen = !packOpen; render(); },
    toggleAutoFight() { autoFightOn ? (stopAutoFight(), render()) : startAutoFight(); },
    save() {
        if (!game || !game.stats || game.pending) return;
        const saves = readSaves();
        saves.push({ id: `save_${Date.now()}`, timestamp: Date.now(), bookId: game.book.id, bookTitle: game.book.title, section: game.currentSection, game: game.serialize() });
        writeSaves(saves);
        begin(); notices = ['Game saved.'];
        render();
    },
    loadSave(id) {
        const entry = id === 'auto' ? readAuto(game.book.id) : readSaves().find(s => s.id === id);
        if (!entry || !game) return;
        stopAutoFight(); begin(); shownSection = null;
        game.restore(entry.game);
        notices = ['Game loaded.'];
    },
    deleteSave(id) { writeSaves(readSaves().filter(s => s.id !== id)); render(); }
};

// ---- fights that run by themselves ----------------------------------------------------------------------------
function startAutoFight() {
    if (!game || !game.inCombat || game.pending) return;
    autoFightOn = true;
    game.setAutoRoll(true);                       // the dice roll themselves while it runs
    autoFightTick();
    render();
}
function stopAutoFight() {
    clearTimeout(autoFightTimer);
    if (autoFightOn && game) game.setAutoRoll(prefs.autoRoll);
    autoFightOn = false;
}
function autoFightTick() {
    if (!autoFightOn) return;
    if (!game || !game.inCombat || game.isGameOver || game.pending) { stopAutoFight(); render(); return; }
    const enemy = game.currentEnemy();
    if (game.canFleeNow(enemy) && game.stats.stamina <= 6) {       // a real decision: let the player take it
        stopAutoFight(); begin(); notices = ['Auto-fight paused: your STAMINA is low and you may flee.']; render(); return;
    }
    begin();
    game.fightRound();
    autoFightTimer = setTimeout(autoFightTick, 700);
}

// ---- saves ---------------------------------------------------------------------------------------------------------
function readSaves() { try { return JSON.parse(localStorage.getItem('ff_saves') || '[]').filter(s => s && s.game); } catch (e) { return []; } }
function writeSaves(list) { try { localStorage.setItem('ff_saves', JSON.stringify(list)); } catch (e) { /* storage full or blocked */ } }
function readAuto(bookId) { try { return JSON.parse(localStorage.getItem('ff_auto_' + bookId)); } catch (e) { return null; } }
function autosave() {
    if (!game || !game.started || game.isGameOver || game.pending) return;
    try { localStorage.setItem('ff_auto_' + game.book.id, JSON.stringify({ timestamp: Date.now(), section: game.currentSection, game: game.serialize() })); } catch (e) { /* ignore */ }
}
const when = ts => new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

// ---- dice ------------------------------------------------------------------------------------------------------------
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
function dieFace(v, extra) {
    const cells = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('');
    return `<span class="die ${extra || ''}" role="img" aria-label="${v}">${cells}</span>`;
}

function renderTray() {
    let html = '';
    const req = game.pendingRoll;
    if (req) {
        const n = req.dice === '2d6' ? 2 : 1;
        html += `<div class="rollrow ask" role="group" aria-label="Dice">
            <div class="dice" aria-hidden="true">${Array.from({ length: n }, () => '<span class="die big blank">?</span>').join('')}</div>
            <div class="what">${esc(req.label || 'Roll the dice')}<small>Roll ${n === 2 ? 'two dice' : 'one die'}</small></div>
            <button class="btn btn-primary" id="roll-now" onclick="ui.rollPending()">Roll <span class="sr-only">the dice</span></button>
        </div>`;
    }
    for (const r of rolls) {
        const sum = r.dice.reduce((a, b) => a + b, 0);
        html += `<div class="rollrow">
            <div class="dice">${r.dice.map(v => dieFace(v, r.fresh ? 'tumble' : '')).join('')}</div>
            <div class="what">${esc(r.request.label || 'Roll')}</div>
            <div class="sum" aria-label="total ${sum}">${r.dice.length > 1 ? '= ' : ''}${sum}</div>
        </div>`;
    }
    return html ? `<div class="tray">${html}</div>` : '';
}

// ---- screens --------------------------------------------------------------------------------------------------------
function render() {
    const app = $('#app');
    if (!game || !game.started) {
        app.innerHTML = renderLanding();
        attachImportListeners();
        return;
    }
    autosave();
    app.innerHTML = renderGame();
    afterRender();
    rolls.forEach(r => { r.fresh = false; });
}

function afterRender() {
    const changed = shownSection !== game.currentSection;
    shownSection = game.currentSection;
    if (changed) {
        window.scrollTo(0, 0);
        const h = $('#page-title');
        if (h) h.focus({ preventScroll: true });
    }
    const ask = $('#roll-now');
    if (ask) ask.focus({ preventScroll: false });
}

function renderLanding() {
    if (!game) {
        return `
            <a class="skip" href="#story">Skip to the content</a>
            <main id="story" class="app">
            <div class="hero">
                <h1>⚔️ Fighting Fantasy</h1>
                <p>An interactive gamebook reader. Choose an adventure, or import your own.</p>
            </div>
            <div class="card">
                <div class="bookrow">
                    <button class="btn btn-primary" onclick="loadBookFile('CURSE_OF_HOLLOWS_END.v2.json')">The Curse of Hollow's End</button>
                    <button class="btn" onclick="loadBookFile('example-adventure.v2.json')">Example adventure</button>
                </div>
                <details>
                    <summary>Import a book from a file</summary>
                    <label class="upload" id="upload-area" style="display: block; margin-top: 0.75rem;">
                        <input type="file" id="file-input" accept=".json,.txt,.md,.pdf">
                        <div style="font-size: 2.5rem;">📁</div>
                        <div>Drop a file here or click to browse</div>
                        <div class="subtitle" style="color: var(--muted); font-size: 0.9rem;">JSON, text, Markdown or PDF</div>
                    </label>
                </details>
                <div id="error-message" role="alert"></div>
            </div>
            </main>`;
    }
    const book = game.book;
    const intro = game.section(0);
    const auto = readAuto(book.id);
    const saves = readSaves().filter(s => s.bookId === book.id);
    return `
        <a class="skip" href="#story">Skip to the content</a>
        <main id="story" class="app">
            <div class="card intro" style="margin-top: 1.5rem;">
                <h1 style="font: 700 1.8rem var(--serif); margin: 0 0 0.25rem; text-align: center;">${esc(book.title)}</h1>
                ${book.author ? `<p style="text-align: center; color: var(--muted); margin: 0;">By ${esc(book.author)}</p>` : ''}
                ${book.description ? `<p style="text-align: center;">${esc(book.description)}</p>` : ''}
                ${intro ? `<div class="text">${paragraphs(intro.text).map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
                <div class="stats-preview"><span>SKILL ${book.initialStats.skill}</span><span>STAMINA ${book.initialStats.stamina}</span><span>LUCK ${book.initialStats.luck}</span></div>
                <div class="actions">
                    <button class="btn btn-primary" onclick="ui.start()">Start Adventure</button>
                    ${auto ? `<button class="btn" onclick="ui.loadSave('auto')">Continue (${esc(when(auto.timestamp))}, section ${auto.section})</button>` : ''}
                    <button class="btn" onclick="ui.loadBook(null)">Choose a different book</button>
                </div>
                ${saves.length ? `<h3 style="margin-top: 1.25rem;">Saved games</h3><ul class="savelist">${saves.map(s => `
                    <li><span>${esc(when(s.timestamp))} · section ${s.section}</span>
                    <span><button class="btn btn-small" onclick="ui.loadSave('${esc(s.id)}')">Load</button>
                    <button class="btn btn-small" onclick="ui.deleteSave('${esc(s.id)}')" aria-label="Delete the save from ${esc(when(s.timestamp))}">Delete</button></span></li>`).join('')}</ul>` : ''}
            </div>
        </main>`;
}

function renderGame() {
    const section = game.section();
    return `
    <div class="app ${packOpen ? 'pack-open' : ''}">
        <header>
        <a class="skip" href="#story">Skip to the story</a>
        <div class="topbar">
            <h1>${esc(game.book.title)}</h1>
            <div class="controls">
                <label class="toggle" title="Shade the paths you have already taken"><input type="checkbox" id="mark-seen" ${prefs.markSeen ? 'checked' : ''} onchange="ui.toggleMarkSeen(this.checked)"> Mark explored</label>
                <label class="toggle" title="Roll the dice for me"><input type="checkbox" ${prefs.autoRoll ? 'checked' : ''} onchange="ui.toggleAutoRoll(this.checked)"> Auto-roll dice</label>
                <span class="sizer" role="group" aria-label="Text size">
                    <button class="btn btn-small" onclick="ui.setSize(-1)" aria-label="Smaller text">A−</button>
                    <button class="btn btn-small" onclick="ui.setSize(1)" aria-label="Larger text">A+</button>
                </span>
                <button class="btn btn-small" onclick="ui.save()">Save</button>
                <button class="btn btn-small" onclick="if (confirm('Restart the adventure?')) ui.restart()">Restart</button>
            </div>
        </div>
        ${renderStatStrip()}
        </header>
        <div class="layout">
            <main id="story" class="story">
                ${notices.length ? `<div class="notice" role="status" aria-live="polite">${notices.map(n => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
                ${renderTray()}
                ${game.isGameOver ? renderGameOver() : (section ? renderPage(section) : `<div class="card">Section ${esc(game.currentSection)} was not found in this book.</div>`)}
            </main>
            <aside class="side" id="side" aria-label="Character and pack">
                <button class="btn btn-small closer" onclick="ui.togglePack()">Close ✕</button>
                ${renderStats()}
                ${renderPack()}
                ${renderJourney()}
            </aside>
        </div>
    </div>`;
}

function renderGameOver() {
    return `<div class="card page">
        <div class="page-head"><h2 id="page-title" tabindex="-1">You have died</h2></div>
        <div class="ending defeat">💀 Your adventure ends here</div>
        <p style="text-align: center; color: var(--muted);">Your STAMINA reached 0 after ${game.visited.size} sections.</p>
        <div class="ending-actions"><button class="btn btn-primary" onclick="ui.restart()">Try again</button></div>
    </div>`;
}

// ---- one page of the book ------------------------------------------------------------------------------------------------
function optionButton(state, inline) {
    const o = state.option;
    const locked = !state.enabled;
    const waiting = !!game.pending;                  // dice are being asked for: nothing else can be done yet
    const hint = locked ? `<span class="lock-hint"> (${esc(Engine.describeConditions(o.conditions || {}))})</span>` : '';
    const seen = prefs.markSeen && game.visited.has(o.target);     // already been there: shaded, ticked and said aloud
    const mark = seen ? '<span class="seen-mark" aria-hidden="true">✓ </span><span class="sr-only">(already visited) </span>' : '';
    return `<button class="${inline ? 'opt-inline' : 'opt'}${seen ? ' seen' : ''}" data-opt="${esc(o.id)}" ${locked || waiting ? 'disabled' : ''}>${mark}${esc(o.label)}${hint}</button>`;
}

function rollWidget(section) {
    if (!game.rollPending(section) || game.pending) return '';
    const r = section.roll;
    const label = r.label || (r.kind === 'luck' ? 'Test your Luck' : 'Roll one die');
    const go = r.kind === 'luck' ? '🍀 Test your Luck' : '🎲 Roll the die';
    return `<div class="roll-box"><strong>${esc(label)}</strong><button class="btn btn-primary" onclick="ui.roll()">${go}</button></div>`;
}

// "{{opt:ID}}" becomes that option's button where the book put it, "{{roll}}" the dice; options the text does not mention follow it
function renderText(section) {
    const states = new Map(game.optionStates(section).map(s => [s.option.id, s]));
    const used = new Set();
    let rollPlaced = false;
    const TOKEN = /\{\{(opt:([a-z0-9-]+)|roll)\}\}/g;
    const html = paragraphs(section.text).map(p => {
        if (/^(\{\{opt:[a-z0-9-]+\}\}\s*)+$/.test(p)) {                          // a menu: one option per line
            const ids = [...p.matchAll(/\{\{opt:([a-z0-9-]+)\}\}/g)].map(m => m[1]);
            ids.forEach(id => used.add(id));
            const buttons = ids.map(id => states.get(id)).filter(Boolean).map(s => optionButton(s, false));
            return buttons.length ? `<div class="opt-list ${buttons.length > 8 ? 'many' : ''}">${buttons.join('')}</div>` : '';
        }
        let out = '', last = 0, visible = false, any = false;
        for (const m of p.matchAll(TOKEN)) {
            out += esc(p.slice(last, m.index));
            last = m.index + m[0].length;
            any = true;
            if (m[1] === 'roll') { rollPlaced = true; const w = rollWidget(section); if (w) { out += `</p>${w}<p>`; visible = true; } }
            else { used.add(m[2]); const s = states.get(m[2]); if (s) { out += optionButton(s, true); visible = true; } }
        }
        out += esc(p.slice(last));
        if (any && !visible && !p.replace(TOKEN, '').trim()) return '';
        return `<p>${out}</p>`.replace(/<p>\s*<\/p>/g, '');
    }).join('');
    const rest = [...states.values()].filter(s => !used.has(s.option.id));
    const extraRoll = rollPlaced ? '' : rollWidget(section);
    return `<div class="text">${html}</div>${extraRoll}${rest.length ? `<div class="opt-list ${rest.length > 8 ? 'many' : ''}">${rest.map(s => optionButton(s, false)).join('')}</div>` : ''}`;
}

// the converter often used a section's first sentence as its title; do not show it twice
function showSubtitle(section) {
    if (!section.title) return false;
    const norm = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
    return !norm(paragraphs(section.text)[0] || '').startsWith(norm(section.title).slice(0, 40));
}

function renderPage(section) {
    let html = `<article class="card page">
        <div class="page-head"><h2 id="page-title" tabindex="-1">Section ${esc(section.id)}</h2>${showSubtitle(section) ? `<span class="subtitle">${esc(section.title)}</span>` : ''}</div>
        ${renderText(section)}`;
    if (section.ending) {
        const t = section.ending.type;
        html += `<div class="ending ${t}">${t === 'victory' ? '🎉 Victory!' : t === 'defeat' ? '💀 The End' : 'The End'}</div>
                 <div class="ending-actions"><button class="btn btn-primary" onclick="ui.restart()">Play again</button></div>`;
    }
    if (section.combat) {
        if (game.inCombat) html += renderCombat();
        else if (game.advance || game.combatDone) html += renderCombatResult();
        else html += renderCombatStart(section);
    }
    return html + `</article>`;
}

// ---- combat -------------------------------------------------------------------------------------------------------------------
const enemyLine = c => `${esc(c.enemyName)} · SKILL ${c.enemySkill} · STAMINA ${c.enemyStamina}`;
function rulesList(c) {
    const notes = Engine.combatNotes(c);
    return notes.length ? `<ul class="rules">${notes.map(n => `<li>⚠️ ${esc(n)}</li>`).join('')}</ul>` : '';
}

function renderCombatStart(section) {
    const list = Engine.enemiesOf(section);
    const first = list[game.currentCombatIndex] || list[0];
    return `<div class="combat">
        <h3>⚔️ Combat ahead</h3>
        ${list.length > 1 ? `<p style="text-align: center; margin: 0;">You must fight them one after another, in this order:</p>` : ''}
        ${list.map((c, i) => `<p style="text-align: center; margin: 0.25rem 0; ${i === game.currentCombatIndex ? 'font-weight: 700;' : ''}">${list.length > 1 ? `${i + 1}. ` : ''}${enemyLine(c)}</p>`).join('')}
        ${rulesList(first)}
        <button class="btn btn-danger btn-block" onclick="ui.fight()">Fight!</button>
    </div>`;
}

function meter(label, value, max, tight) {
    const pct = max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0;
    return `<div class="bar" ${tight ? 'style="margin-bottom: 0.3rem;"' : ''}>
        <div class="lab"><span>${label}</span><span>${value} / ${max}</span></div>
        <div class="meter" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><span class="${pct > 66 ? '' : pct > 33 ? 'mid' : 'low'}" style="width: ${pct}%"></span></div>
    </div>`;
}

function renderCombat() {
    const list = Engine.enemiesOf(game.section());
    const c = game.currentEnemy();
    const st = game.stats;
    const busy = game.pending || autoFightOn;
    const skillNow = Math.max(0, st.skill - game.tempSkillPenalty);
    return `<div class="combat">
        <h3>⚔️ Combat${list.length > 1 ? ` · enemy ${game.currentCombatIndex + 1} of ${list.length}` : ''}</h3>
        <div class="versus">
            <div class="fighter"><strong>You</strong><div class="skillline">SKILL ${skillNow}${game.tempSkillPenalty ? ` (−${game.tempSkillPenalty} this fight)` : ''}</div>${meter('STAMINA', st.stamina, st.initialStamina, true)}</div>
            <div class="fighter"><strong>${esc(c.enemyName)}</strong><div class="skillline">SKILL ${c.enemySkill}</div>${meter('STAMINA', game.enemyCurrentStamina, c.enemyStamina, true)}</div>
        </div>
        ${rulesList(c)}
        <div class="fightlog" role="log" aria-live="polite" tabindex="0" aria-label="Fight log">${game.combatLog.map(l => `<div>${esc(l)}</div>`).join('')}</div>
        <div class="actions">
            <button class="btn btn-danger" onclick="ui.round()" ${busy ? 'disabled' : ''}>Fight a round</button>
            <button class="btn" onclick="ui.toggleAutoFight()" ${game.pending && !autoFightOn ? 'disabled' : ''} aria-pressed="${autoFightOn}">${autoFightOn ? '⏸ Stop auto-fight' : '⏩ Auto-fight'}</button>
            ${game.canFleeNow(c) ? `<button class="btn" onclick="ui.flee()" ${game.pending ? 'disabled' : ''}>${c.fleeTestLuck ? 'Flee (Test your Luck)' : 'Flee'}</button>` : ''}
        </div>
    </div>`;
}

function renderCombatResult() {
    return `<div class="combat">
        <div class="fightlog" role="log" aria-live="polite" tabindex="0" aria-label="Fight log">${game.combatLog.map(l => `<div>${esc(l)}</div>`).join('')}</div>
        ${game.advance ? `<button class="btn btn-primary btn-block" onclick="ui.advance()">Continue</button>` : ''}
    </div>`;
}

// ---- the side panels ----------------------------------------------------------------------------------------------------------------
function renderStatStrip() {
    const st = game.stats;
    const chip = (name, v, m) => `<div class="chip"><span>${name}</span><b>${v}/${m}</b><div class="meter" aria-hidden="true"><span class="${v / m > 0.66 ? '' : v / m > 0.33 ? 'mid' : 'low'}" style="width: ${m > 0 ? Math.min(100, v / m * 100) : 0}%"></span></div></div>`;
    return `<div class="statstrip" role="group" aria-label="Your character">
        ${chip('SKILL', st.skill, st.initialSkill)}${chip('STAMINA', st.stamina, st.initialStamina)}${chip('LUCK', st.luck, st.initialLuck)}
        <button class="btn btn-small" onclick="ui.togglePack()" aria-expanded="${packOpen}" aria-controls="side">🎒 Pack</button>
    </div>`;
}

function renderStats() {
    const st = game.stats;
    return `<section class="card stats-card" aria-label="Character stats">
        <h2>Character</h2>
        ${meter('SKILL', st.skill, st.initialSkill)}${meter('STAMINA', st.stamina, st.initialStamina)}${meter('LUCK', st.luck, st.initialLuck)}
        ${game.tempSkillPenalty ? `<p class="penalty">−${game.tempSkillPenalty} SKILL for this fight</p>` : ''}
        ${game.carriedSkillPenalty ? `<p class="penalty">−${game.carriedSkillPenalty} SKILL in your next fight</p>` : ''}
        <div class="gold"><span>💰 Gold</span><span>${st.gold || 0} GP</span></div>
    </section>`;
}

const ICONS = { weapon: '⚔️', armor: '🛡️', potion: '🧪', food: '🍞', treasure: '💎', key: '🔑', other: '📦' };
function renderPack() {
    // identical items (ten rations) are shown once with a count
    const groups = new Map();
    for (const it of game.inventory) {
        const key = [it.id, it.name, it.restore || '', it.bonus || '', it.onUse ? 1 : 0].join('|');
        if (!groups.has(key)) groups.set(key, { item: it, count: 0 });
        groups.get(key).count++;
    }
    const rows = [...groups.values()].map(({ item, count }) => {
        const tags = [item.restore && `✨ ${item.restore}`, item.bonus && `⚡ ${item.bonus}`, item.properties && item.properties.length && `🏷️ ${item.properties.join(', ')}`].filter(Boolean).join(' · ');
        const usable = !!(item.restore || item.onUse);
        return `<div class="item">
            <span class="ico" aria-hidden="true">${ICONS[item.type] || ICONS.other}</span>
            <div class="body"><strong>${esc(item.name)}${count > 1 ? ` ×${count}` : ''}</strong>${item.description ? `<div class="tags">${esc(item.description)}</div>` : ''}${tags ? `<div class="tags">${esc(tags)}</div>` : ''}</div>
            <div class="acts">
                ${usable ? `<button class="btn btn-small" onclick="ui.use(${Number(item.uid)})" ${game.pending ? 'disabled' : ''}>Use</button>` : ''}
                <button class="x" onclick="ui.drop(${Number(item.uid)})" aria-label="Drop ${esc(item.name)}" title="Drop">✕</button>
            </div></div>`;
    }).join('');
    return `<section class="card" aria-label="Pack"><h2>Pack</h2>${rows || '<p class="empty">Your pack is empty.</p>'}</section>`;
}

function renderJourney() {
    const recent = Array.from(game.visited).slice(-12);
    return `<details class="card journey"><summary>Journey · ${game.visited.size} sections</summary>
        <div class="trail">${recent.map(id => `<span class="${id === game.currentSection ? 'here' : ''}">${id}</span>`).join('')}</div></details>`;
}

// ---- events from the page ----------------------------------------------------------------------------------------------------------------
// option buttons carry the option id in data-opt (never in inline script)
document.addEventListener('click', e => {
    const b = e.target.closest('[data-opt]');
    if (b && !b.disabled && game) ui.choose(b.getAttribute('data-opt'));
});
// R rolls the dice when it is time to
document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'r' || e.ctrlKey || e.metaKey || e.altKey || !game || !game.started) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    if (game.pending) { e.preventDefault(); ui.rollPending(); return; }
    const box = $('.roll-box .btn');
    if (box) { e.preventDefault(); box.click(); }
});

function attachImportListeners() {
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    const area = document.getElementById('upload-area');
    if (area) {
        area.addEventListener('dragenter', handleDrag);
        area.addEventListener('dragover', handleDrag);
        area.addEventListener('dragleave', handleDragLeave);
        area.addEventListener('drop', handleDrop);
    }
}

function loadBookFile(name) {
    fetch(name)
        .then(res => res.json())
        .then(data => { if (validateBook(data)) ui.loadBook(data); else showError('This book has an invalid format.'); })
        .catch(() => showError(`Could not load ${name}. Make sure it is in the same folder as this page.`));
}

applyTextSize();
render();
