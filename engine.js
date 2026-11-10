/**
 * Gamebook engine: the rules of the game, with no screen, no timers and no alert().
 *
 * Plays books in format v2 (book.schema.json). Older books are upgraded with Engine.upgradeBook().
 * Works in the browser (<script src="engine.js"> gives a global `Engine`) and in Node (require).
 *
 *   const game = Engine.create({ book, rng: Math.random, autoRoll: true, onEvent: e => ... });
 *   game.start();
 *   game.chooseOption('to-45');   // follow an option
 *   game.doRoll();                // make the section's Luck test / dice roll
 *   game.startCombat(); game.fightRound(); game.flee();
 *
 * Dice: every random event is a "roll request" ({ dice: '1d6' | '2d6', reason, label }).
 *   autoRoll true  : the engine rolls with `rng` and carries on at once (the simulator always uses this).
 *   autoRoll false : the engine stops with `game.pending` set and a 'roll-needed' event; the UI shows a die and calls
 *                    game.resolveRoll() (or resolveRoll([3, 5]) with chosen values). Nothing else is accepted meanwhile.
 *
 * Events (options.onEvent): { type: 'message', text } for things the player should be told (replaces alert()),
 * { type: 'roll-needed', request } and { type: 'change' } after every state change.
 *
 * Navigation after a fight or a flee waits for game.advanceNow() when autoAdvance is false (so the UI can show the log),
 * and happens at once when it is true (the simulator).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Engine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STATS = ['skill', 'stamina', 'luck'];
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const isArr = Array.isArray;
    const enemiesOf = section => (section && section.combat ? (isArr(section.combat) ? section.combat : [section.combat]) : []);

    // ----------------------------------------------------------------------------------------- pure helpers

    /** "-5 STAMINA, +1 LUCK" for the message after a roll. */
    function describeEffects(e) {
        if (!e) return '';
        const parts = [];
        const add = (obj, suffix) => Object.entries(obj || {}).forEach(([stat, v]) =>
            parts.push(v === 'max' ? `${stat.toUpperCase()} restored${suffix}` : `${v > 0 ? '+' : ''}${v} ${stat.toUpperCase()}${suffix}`));
        add(e.modifyStats, '');
        add(e.permanentStats, ' (permanent)');
        add(e.maxStats, ' (maximum)');
        return parts.length ? ` [${parts.join(', ')}]` : '';
    }

    /** One line per special rule of an enemy, so the player knows what they face. */
    function combatNotes(c) {
        const notes = [];
        if (c.note) notes.push(c.note);
        if (isArr(c.effectiveWeapons)) {
            const list = c.effectiveWeapons.join(' or ');
            notes.push(c.normalWeaponDamage === 0
                ? `Immune to any weapon that is not ${list}`
                : `Weapons that are not ${list} deal only ${c.normalWeaponDamage ?? 2} damage`);
        }
        if (c.weakTo) notes.push(`${c.weakTo.property} weapons deal ${c.weakTo.damage} damage`);
        if (c.onStart && c.onStart.luckTest) notes.push(`At the start of the fight, Test Luck or lose ${c.onStart.skillLoss || 1} SKILL for the battle`);
        if (c.onStart && !c.onStart.luckTest) notes.push(`You fight at -${c.onStart.skillLoss || 1} SKILL${c.onStart.text ? ' (' + c.onStart.text.toLowerCase() + ')' : ''}`);
        if (c.onVictoryEffects) notes.push(`Winning costs you:${describeEffects(c.onVictoryEffects)}`);
        if (c.onWound) {
            notes.push(c.onWound.luckTest ? `Each wound: Test Luck or lose ${c.onWound.skillLoss || 1} SKILL for the battle`
                : `Each wound permanently drains ${c.onWound.skillLoss || 1} SKILL`);
        }
        if (isArr(c.reviveOn)) notes.push(`When reduced to 0 STAMINA, roll a die: on ${c.reviveOn.join(' or ')} it survives with 1 STAMINA`);
        return notes;
    }

    /** "Brass Key" from the item id "brass-key". */
    function prettyItemId(id) {
        return String(id).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    function describeConditions(c) {
        const parts = [];
        const names = v => [].concat(v).map(prettyItemId).join(' and ');
        if (c.requiresItem) parts.push(`requires ${names(c.requiresItem)}`);
        if (c.requiresNoItem) parts.push(`only without ${names(c.requiresNoItem)}`);
        if (c.requiresMissingAny) parts.push(`only if you lack ${[].concat(c.requiresMissingAny).map(prettyItemId).join(' or ')}`);
        if (c.requiresMinSkill) parts.push(`requires SKILL ${c.requiresMinSkill}+`);
        if (c.requiresMinStamina) parts.push(`requires STAMINA ${c.requiresMinStamina}+`);
        if (c.requiresMinLuck) parts.push(`requires LUCK ${c.requiresMinLuck}+`);
        return parts.join(', ') || 'requires conditions';
    }

    /** "If you don't have X" style conditions: the option is hidden rather than shown locked. */
    const hasNegativeCondition = c => !!(c && (c.requiresNoItem || c.requiresMissingAny));
    const stripPositive = c => ({ requiresNoItem: c.requiresNoItem, requiresMissingAny: c.requiresMissingAny });

    /** Weapon properties are guessed from the item name when a book does not state them. */
    function inferWeaponProperties(name) {
        const n = String(name || '').toLowerCase();
        const props = [];
        if (/silver/.test(n)) props.push('silver');
        if (/magic|enchanted|blessed|holy/.test(n)) props.push('magical');
        if (/\b(mace|club|hammer|flail|maul)\b/.test(n)) props.push('crushing');
        return props;
    }

    /** Numeric bonus from strings like "+1 skill", "+2 attack". */
    function weaponBonus(item) {
        const match = item && item.bonus ? String(item.bonus).match(/([+-]\d+)/) : null;
        return match ? parseInt(match[1], 10) : 0;
    }

    /**
     * Damage the player deals per hit with a weapon (or null) against an enemy. Base damage is 2.
     * effectiveWeapons + normalWeaponDamage: weapons without one of those properties deal n instead (0 = immune).
     * weakTo: weapons with the property deal more.
     */
    function damageAgainst(weapon, enemy) {
        const props = (weapon && weapon.properties) || [];
        let damage = 2;
        if (isArr(enemy.effectiveWeapons) && !enemy.effectiveWeapons.some(p => props.includes(p))) {
            damage = enemy.normalWeaponDamage != null ? enemy.normalWeaponDamage : 2;
        }
        if (enemy.weakTo && props.includes(enemy.weakTo.property)) damage = enemy.weakTo.damage;
        return damage;
    }

    // ----------------------------------------------------------------------------------------- v1 -> v2

    /**
     * Upgrades a book in the old format to v2 in memory. Structure only: destinations, rolls, effects and endings are
     * regrouped exactly as migrate_to_v2.py does, but the text is left as it is and option labels stay as the book had
     * them ("Turn to N" included). Use migrate_to_v2.py for a proper conversion.
     */
    function upgradeBook(book) {
        if (!book || book.schemaVersion === 2) return book;
        const EK = ['modifyStats', 'permanentStats', 'maxStats', 'addItems', 'removeItems'];
        const fx = d => { const o = {}; EK.forEach(k => { if (d && d[k] && (!isArr(d[k]) || d[k].length)) o[k] = d[k]; }); return o; };
        const hasFx = o => Object.keys(o).length > 0;
        const out = { schemaVersion: 2, id: book.id, title: book.title };
        ['author', 'description'].forEach(k => { if (book[k]) out[k] = book[k]; });
        out.startingSection = book.startingSection != null ? book.startingSection : 1;
        out.initialStats = book.initialStats;
        if (book.startingItems && book.startingItems.length) out.startingItems = book.startingItems;
        out.sections = book.sections.map(x => {
            const sec = { id: x.id };
            if (x.title) sec.title = x.title;
            sec.text = String(x.text || '').replace(/\r\n/g, '\n');
            const seen = {};
            const options = (x.choices || []).map(c => {
                seen[c.targetSection] = (seen[c.targetSection] || 0) + 1;
                const o = { id: `to-${c.targetSection}` + (seen[c.targetSection] === 1 ? '' : `-${seen[c.targetSection]}`), label: c.text, target: c.targetSection };
                ['conditions', 'effects', 'once'].forEach(k => { if (c[k]) o[k] = c[k]; });
                return o;
            });
            if (options.length) sec.options = options;
            if (x.testLuck) {
                const t = x.testLuck;
                const r = { kind: 'luck' };
                if (t.label) r.label = t.label;
                if (t.once) r.once = t.once;
                if (t.gatesChoices) r.gatesOptions = t.gatesChoices;
                if (t.conditions) r.conditions = t.conditions;
                [['success', 'successSection', 'successText', 'successEffects'], ['failure', 'failureSection', 'failureText', 'failureEffects']].forEach(([side, sk, tk, ek]) => {
                    const o = {};
                    if (t[tk]) o.text = t[tk];
                    if (t[sk]) o.target = t[sk];
                    if (t[ek]) o.effects = t[ek];
                    r[side] = o;
                });
                sec.roll = r;
            }
            if (x.diceRoll) {
                const d = x.diceRoll;
                const r = { kind: 'dice', dice: '1d6' };
                if (d.label) r.label = d.label;
                if (d.once) r.once = d.once;
                if (d.gatesChoices) r.gatesOptions = d.gatesChoices;
                r.outcomes = d.outcomes.map(oc => {
                    const o = { min: oc.min, max: oc.max };
                    if (oc.text) o.text = oc.text;
                    if (oc.targetSection) o.target = oc.targetSection;
                    const e = fx(oc);
                    if (hasFx(e)) o.effects = e;
                    if (oc.luckTest) {
                        o.luck = {};
                        ['success', 'failure'].forEach(side => {
                            const s_ = oc.luckTest[side] || {};
                            const so = {};
                            if (s_.text) so.text = s_.text;
                            if (s_.targetSection) so.target = s_.targetSection;
                            const se = fx(s_);
                            if (hasFx(se)) so.effects = se;
                            o.luck[side] = so;
                        });
                    }
                    return o;
                });
                sec.roll = r;
            }
            if (x.combat) sec.combat = JSON.parse(JSON.stringify(x.combat));
            const e = fx(x);
            if (hasFx(e)) sec.effects = e;
            if (x.isEnding && !(options.length || x.testLuck || x.diceRoll || x.combat)) sec.ending = { type: x.endingType || 'neutral' };
            return sec;
        });
        return out;
    }

    // ----------------------------------------------------------------------------------------- the engine

    const DEFAULT_ITEMS = () => [
        { id: 'sword', name: 'Sword', type: 'weapon' },
        { id: 'shield', name: 'Shield', type: 'armor' },
        { id: 'leather-armor', name: 'Leather Armor', type: 'armor' },
        { id: 'backpack', name: 'Backpack', type: 'other' }
    ].concat(Array.from({ length: 10 }, () => ({ id: 'rations', name: 'Rations', type: 'food', restore: '+4 stamina' })));

    class Game {
        constructor(options) {
            const o = options || {};
            this.book = o.book ? upgradeBook(o.book) : null;
            this.rng = o.rng || Math.random;
            this.autoRoll = o.autoRoll !== false;
            this.autoAdvance = o.autoAdvance !== false;
            this.onEvent = o.onEvent || null;
            this.sections = new Map();
            if (this.book) this.book.sections.forEach(s => this.sections.set(s.id, s));
            this._blank();
        }

        // ---- state ------------------------------------------------------------------------------------
        _blank() {
            this.started = false;
            this.currentSection = this.book ? (this.sections.has(0) ? 0 : this.book.startingSection) : 1;
            this.stats = null;
            this.inventory = [];
            this.visited = new Set();
            this.inCombat = false;
            this.enemyCurrentStamina = 0;
            this.combatLog = [];
            this.currentCombatIndex = 0;
            this.isGameOver = false;
            this.gameOverType = null;
            this.combatDone = false;
            this.lastWielded = null;
            this.rolledOnce = new Set();
            this.usedOnce = new Set();
            this.rollResolved = false;
            this.tempSkillPenalty = 0;
            this.nextUid = 1;
            this.pending = null;      // { request, gen } while waiting for the player to roll
            this.advance = null;      // { target } navigation waiting for advance()
        }

        _emit(evt) { if (this.onEvent) this.onEvent(evt); }
        _changed() { this._emit({ type: 'change' }); }
        _say(text) { this._emit({ type: 'message', text }); }

        section(id) { return this.sections.get(id === undefined ? this.currentSection : id); }
        get pendingRoll() { return this.pending ? this.pending.request : null; }

        setAutoRoll(on) { this.autoRoll = !!on; }

        // ---- starting and resetting ---------------------------------------------------------------------
        start() {
            if (!this.book) return;
            this._blank();
            this.started = true;
            const st = this.book.initialStats;
            this.stats = { skill: st.skill, stamina: st.stamina, luck: st.luck, initialSkill: st.skill, initialStamina: st.stamina, initialLuck: st.luck, gold: 10 };
            const own = this.book.startingItems || [];
            this.inventory = (own.length === 0 ? DEFAULT_ITEMS() : own).map(i => this.makeItem(i));
            this.currentSection = this.book.startingSection;
            this.visited = new Set([this.book.startingSection]);
            this._changed();
        }

        reset() {
            this._blank();
            this._changed();
        }

        // ---- items ---------------------------------------------------------------------------------------
        makeItem(item) {
            const made = Object.assign({}, item, { uid: this.nextUid++ });
            if (made.type === 'weapon' && !isArr(made.properties)) made.properties = inferWeaponProperties(made.name);
            return made;
        }

        hasItem(id) { return this.inventory.some(i => i.id === id); }

        addItem(item) {
            const isGold = /\b(gold pieces?|coins?|gp)\b/.test(item.name.toLowerCase());
            if (isGold) {
                const m = item.name.match(/(\d+)/);
                this.addGold(m ? parseInt(m[1], 10) : 1);
            } else if ((item.unique || (item.bonus && item.type !== 'potion')) && this.hasItem(item.id)) {
                // a second copy of a unique item or of bonus equipment would only stack its bonus
            } else {
                this.inventory.push(this.makeItem(item));
            }
        }

        addGold(amount) { if (this.stats) this.stats.gold = (this.stats.gold || 0) + amount; }

        removeItem(id) {
            const i = this.inventory.findIndex(x => x.id === id);
            if (i !== -1) this.inventory.splice(i, 1);
        }

        removeItemByUid(uid) {
            const i = this.inventory.findIndex(x => x.uid === uid);
            if (i !== -1) this.inventory.splice(i, 1);
        }

        /** The player throws an item away. */
        dropItem(uid) {
            if (this.pending) return;
            this.removeItemByUid(uid);
            this._changed();
        }

        chooseWeapon(enemy) {
            let best = null, bestDamage = damageAgainst(null, enemy), bestBonus = 0;
            for (const item of this.inventory) {
                if (item.type !== 'weapon') continue;
                const damage = damageAgainst(item, enemy), bonus = weaponBonus(item);
                if (!best || damage > bestDamage || (damage === bestDamage && bonus > bestBonus)) { best = item; bestDamage = damage; bestBonus = bonus; }
            }
            return { weapon: best, damage: bestDamage, bonus: bestBonus };
        }

        calculateDefenseBonus() {
            return this.inventory.reduce((total, item) => {
                if (item.type === 'armor' && item.bonus) {
                    const m = item.bonus.match(/([+-]\d+)/);
                    if (m) return total + parseInt(m[1], 10);
                }
                return total;
            }, 0);
        }

        /** Eat, drink or use an item (by its unique id). */
        useItem(uid) {
            if (this.pending) return;
            const item = this.inventory.find(i => i.uid === uid);
            if (item && item.onUse) {
                this._say(`You used ${item.name}!${describeEffects(item.onUse)}`);
                this.removeItemByUid(uid);
                this.applyEffects(item.onUse);
                this._changed();
                return;
            }
            if (!item || !item.restore) return;
            const m = item.restore.match(/([+-]\d+)\s*(\w+)/);
            if (!m) return;
            const amount = parseInt(m[1], 10), stat = m[2].toLowerCase();
            if (STATS.includes(stat)) {
                this.modifyStats({ [stat]: amount });
                this._say(`You used ${item.name}! ${amount >= 0 ? '+' : ''}${amount} ${stat.toUpperCase()}`);
                if (item.type === 'potion' || item.type === 'food') this.removeItemByUid(uid);
            }
            this._changed();
        }

        // ---- stats and effects -----------------------------------------------------------------------------
        /** { skill, stamina, luck }: numbers add (clamped 0..Initial); 'max' restores to Initial. */
        modifyStats(changes) {
            if (!this.stats) return;
            const apply = (cur, init, v) => (v === 'max' ? init : Math.max(0, Math.min(init, cur + v)));
            if (changes.skill) this.stats.skill = apply(this.stats.skill, this.stats.initialSkill, changes.skill);
            if (changes.stamina) this.stats.stamina = apply(this.stats.stamina, this.stats.initialStamina, changes.stamina);
            if (changes.luck) this.stats.luck = apply(this.stats.luck, this.stats.initialLuck, changes.luck);
            this.checkDeath();
        }

        /** permanent: lowers current AND Initial; otherwise only the Initial maximum (current is capped to it). */
        reduceStats(changes, permanent) {
            if (!this.stats) return;
            for (const key of STATS) {
                const amount = changes[key];
                if (!amount) continue;
                const init = 'initial' + cap(key);
                this.stats[init] = Math.max(0, this.stats[init] + amount);
                this.stats[key] = permanent ? Math.max(0, this.stats[key] + amount) : this.stats[key];
                this.stats[key] = Math.min(this.stats[key], this.stats[init]);
            }
            this.checkDeath();
        }

        checkDeath() {
            if (this.stats && this.stats.stamina <= 0 && !this.isGameOver) {
                this.inCombat = false;
                this.isGameOver = true;
                this.gameOverType = 'defeat';
            }
        }

        /** Any object with modifyStats / permanentStats / maxStats / addItems / removeItems. */
        applyEffects(e) {
            if (!e) return;
            if (e.modifyStats) this.modifyStats(e.modifyStats);
            if (e.permanentStats) this.reduceStats(e.permanentStats, true);
            if (e.maxStats) this.reduceStats(e.maxStats, false);
            if (e.addItems) e.addItems.forEach(i => this.addItem(i));
            if (e.removeItems) e.removeItems.forEach(id => this.removeItem(id));
        }

        // ---- navigation -----------------------------------------------------------------------------------
        /** Go to a section. Its effects apply the first time it is entered, by whatever route. */
        goTo(id) {
            this.advance = null;
            this.combatDone = false;
            this.rollResolved = false;
            this.tempSkillPenalty = 0;
            const first = !this.visited.has(id);
            this.currentSection = id;
            this.visited.add(id);
            this.inCombat = false;
            this.combatLog = [];
            this.currentCombatIndex = 0;
            if (first) { const s = this.section(id); if (s) this.applyEffects(s.effects); }
            this._changed();
        }

        _navigateAfter(target) {
            if (this.autoAdvance) this.goTo(target);
            else { this.advance = { target }; this._changed(); }
        }

        /** Continue after a fight or a flee when autoAdvance is off. */
        advanceNow() {
            if (this.pending || !this.advance) return;
            this.goTo(this.advance.target);
        }

        // ---- options -----------------------------------------------------------------------------------------
        /** Do the conditions hold right now? */
        meets(conditions) {
            if (!conditions) return true;
            const c = conditions;
            if (!this.stats) return false;
            if ([].concat(c.requiresItem || []).some(id => !this.hasItem(id))) return false;
            if ([].concat(c.requiresNoItem || []).some(id => this.hasItem(id))) return false;
            if (c.requiresMissingAny && !c.requiresMissingAny.some(id => !this.hasItem(id))) return false;
            if (c.requiresMinSkill && this.stats.skill < c.requiresMinSkill) return false;
            if (c.requiresMinStamina && this.stats.stamina < c.requiresMinStamina) return false;
            if (c.requiresMinLuck && this.stats.luck < c.requiresMinLuck) return false;
            return true;
        }

        /** Is a roll still to be made in this section? Not once made on this visit, nor (for "once" rolls) earlier this game. */
        rollPending(section) {
            const s = section || this.section();
            const r = s && s.roll;
            if (!r || this.rollResolved) return false;
            if (r.once && this.rolledOnce.has(s.id)) return false;
            if (r.kind === 'luck' && !this.meets(r.conditions)) return false;
            return true;
        }

        /** Options of a section whose roll "gatesOptions" appear only after that roll was made. */
        optionsUnlocked(section) {
            const s = section || this.section();
            return !(s.roll && s.roll.gatesOptions && this.rollPending(s));
        }

        /**
         * The options the player can see: [{ option, enabled }]. Locked options (an item is missing) are shown disabled;
         * "if you don't have X" options are hidden while they do not apply; one-time decisions vanish once taken.
         */
        optionStates(section) {
            const s = section || this.section();
            if (!s || !(s.options && s.options.length && (!s.combat || this.combatDone) && this.optionsUnlocked(s))) return [];
            const out = [];
            for (const o of s.options) {
                if (o.once && this.usedOnce.has(s.id)) continue;
                if (hasNegativeCondition(o.conditions) && !this.meets(stripPositive(o.conditions))) continue;
                out.push({ option: o, enabled: this.meets(o.conditions) });
            }
            return out;
        }

        chooseOption(optionId) {
            if (this.pending || this.isGameOver) return false;
            const s = this.section();
            const state = this.optionStates(s).find(x => x.option.id === optionId);
            if (!state) return false;
            if (!state.enabled) { this._say('You do not meet the requirements for this choice.'); return false; }
            const o = state.option;
            if (o.effects) this.applyEffects(o.effects);
            if (o.once) this.usedOnce.add(s.id);
            if (this.isGameOver) { this._changed(); return true; }
            this.goTo(o.target);
            return true;
        }

        // ---- dice ---------------------------------------------------------------------------------------------
        _autoDice(req) {
            const n = req.dice === '2d6' ? 2 : 1;
            const out = [];
            for (let i = 0; i < n; i++) out.push(Math.floor(this.rng() * 6) + 1);
            return out;
        }

        _run(gen) { this._drive(gen, gen.next()); }

        _drive(gen, step) {
            while (!step.done) {
                if (this.autoRoll) step = gen.next(this._autoDice(step.value));
                else {
                    this.pending = { request: step.value, gen };
                    this._emit({ type: 'roll-needed', request: step.value });
                    this._changed();
                    return;
                }
            }
            this._changed();
        }

        /** The player rolled (values optional): carry on with whatever was waiting for the dice. */
        resolveRoll(values) {
            if (!this.pending) return;
            const { request, gen } = this.pending;
            this.pending = null;
            const n = request.dice === '2d6' ? 2 : 1;
            const dice = isArr(values) && values.length === n && values.every(v => Number.isInteger(v) && v >= 1 && v <= 6) ? values : this._autoDice(request);
            this._drive(gen, gen.next(dice));
        }

        *_testLuck() {
            if (!this.stats) return { success: false, newLuck: 0, roll: 0 };
            const dice = yield { dice: '2d6', reason: 'luck', label: 'Test your Luck' };
            const roll = dice[0] + dice[1];
            const success = roll <= this.stats.luck;
            this.stats.luck = Math.max(0, this.stats.luck - 1);
            return { success, newLuck: this.stats.luck, roll, dice };
        }

        // ---- the section's own roll (Luck test or dice table) ---------------------------------------------------------
        doRoll() {
            if (this.pending || this.isGameOver) return;
            const s = this.section();
            if (!s || !this.rollPending(s)) return;
            this._run(this._roll(s));
        }

        *_roll(s) {
            const r = s.roll;
            this.rollResolved = true;
            if (r.once) this.rolledOnce.add(s.id);
            if (r.kind === 'luck') {
                const result = yield* this._testLuck();
                const side = result.success ? r.success : r.failure;
                this._say(`${result.success ? 'Lucky' : 'Unlucky'}! (rolled ${result.roll}) ${side.text || ''}${describeEffects(side.effects)}`);
                this.applyEffects(side.effects);
                if (this.isGameOver) return;
                if (side.target) this.goTo(side.target);
                return;
            }
            const dice = yield { dice: '1d6', reason: 'table', label: r.label || 'Roll one die' };
            const roll = dice[0];
            const outcome = r.outcomes.find(o => roll >= o.min && roll <= o.max);
            if (!outcome) return;
            this._say(`You rolled ${roll}. ${outcome.text || ''}${describeEffects(outcome.effects)}`);
            this.applyEffects(outcome.effects);
            if (this.isGameOver) return;
            let target = outcome.target;
            if (outcome.luck) {
                const lt = yield* this._testLuck();
                const res = lt.success ? outcome.luck.success : outcome.luck.failure;
                this._say(`${lt.success ? 'Lucky' : 'Unlucky'}! (rolled ${lt.roll}) ${(res && res.text) || ''}${describeEffects(res && res.effects)}`);
                if (res) { this.applyEffects(res.effects); if (res.target) target = res.target; }
                if (this.isGameOver) return;
            }
            if (target) this.goTo(target);
        }

        // ---- combat ----------------------------------------------------------------------------------------------------
        canFleeNow(c) {
            if (!c.canFlee) return false;
            if (c.fleeMaxStamina != null && this.stats.stamina > c.fleeMaxStamina) return false;
            return true;
        }

        currentEnemy() {
            const list = enemiesOf(this.section());
            return list[this.currentCombatIndex] || list[0];
        }

        startCombat() {
            if (this.pending || this.isGameOver) return;
            const s = this.section();
            const list = enemiesOf(s);
            if (!list.length || this.inCombat) return;
            this._run(this._startCombat(list));
        }

        *_startCombat(list) {
            const first = list[0];
            this.inCombat = true;
            this.tempSkillPenalty = 0;
            this.lastWielded = null;
            this.currentCombatIndex = 0;
            this.enemyCurrentStamina = first.enemyStamina;
            this.combatLog = [`⚔️ Combat begins with ${first.enemyName}!`, `${first.enemyName}: SKILL ${first.enemySkill}, STAMINA ${first.enemyStamina}`];
            if (list.length > 1) this.combatLog.push(`⚠️ Warning: ${list.length} enemies detected! You must defeat them all.`);
            yield* this._combatStart(first);
        }

        /** Effects that trigger when an enemy's fight begins (a wail: Test Luck or lose SKILL; underwater: a flat penalty). */
        *_combatStart(enemy) {
            const os = enemy.onStart;
            if (!os) return;
            const loss = os.skillLoss || 1;
            if (!os.luckTest) {
                this.tempSkillPenalty += loss;
                this.combatLog.push(`🌊 ${os.text || 'Difficult conditions'}: -${loss} SKILL for this combat. (SKILL now ${Math.max(0, this.stats.skill - this.tempSkillPenalty)})`);
                return;
            }
            const lt = yield* this._testLuck();
            if (lt.success) this.combatLog.push(`🍀 Test your Luck (rolled ${lt.roll}): Lucky! ${enemy.enemyName}'s power does not touch you.`);
            else {
                this.tempSkillPenalty += loss;
                this.combatLog.push(`😱 Test your Luck (rolled ${lt.roll}): Unlucky! You lose ${loss} SKILL for the entire battle. (SKILL now ${Math.max(0, this.stats.skill - this.tempSkillPenalty)})`);
            }
        }

        fightRound() {
            if (this.pending) return;
            const s = this.section();
            if (!s || !s.combat || !this.stats || this.isGameOver) return;
            this._run(this._fightRound(s));
        }

        *_fightRound(s) {
            const list = enemiesOf(s);
            const combat = list[this.currentCombatIndex] || list[0];
            const log = this.combatLog;

            const pd = yield { dice: '2d6', reason: 'attack', label: 'Your attack', who: 'player' };
            const playerDice = pd[0] + pd[1];
            const wield = this.chooseWeapon(combat);
            const attackBonus = wield.bonus;
            const effectiveSkill = Math.max(0, this.stats.skill - this.tempSkillPenalty);
            const playerStrength = playerDice + effectiveSkill + attackBonus;

            const ed = yield { dice: '2d6', reason: 'attack', label: `${combat.enemyName}'s attack`, who: 'enemy' };
            const enemyDice = ed[0] + ed[1];
            const enemyStrength = enemyDice + combat.enemySkill;

            const roundNum = log.filter(l => l.includes('Round')).length + 1;
            log.push(`\nRound ${roundNum}:`);
            const wieldName = wield.weapon ? wield.weapon.name : 'bare hands';
            if (this.lastWielded !== wieldName) { this.lastWielded = wieldName; log.push(`🗡️ You fight with: ${wieldName}`); }
            log.push(attackBonus !== 0
                ? `You rolled ${playerDice} + ${effectiveSkill} SKILL + ${attackBonus} (weapon bonus) = ${playerStrength}`
                : `You rolled ${playerDice} + ${effectiveSkill} SKILL = ${playerStrength}`);
            log.push(`${combat.enemyName} rolled ${enemyDice} + ${combat.enemySkill} SKILL = ${enemyStrength}`);

            if (playerStrength > enemyStrength) {
                const hit = wield.damage;
                if (hit === 0) {
                    log.push(`👻 Your blow passes harmlessly through ${combat.enemyName}! Only a ${(combat.effectiveWeapons || []).join(' or ')} weapon can hurt it.`);
                    return;
                }
                this.enemyCurrentStamina -= hit;
                const note = (hit !== 2 && wield.weapon) ? ` (${wield.weapon.name})` : (hit !== 2 ? ' (no suitable weapon)' : '');
                log.push(`💥 You hit ${combat.enemyName} for ${hit} damage${note}! (${this.enemyCurrentStamina} STAMINA remaining)`);

                if (this.enemyCurrentStamina <= 0 && isArr(combat.reviveOn)) {
                    const rd = yield { dice: '1d6', reason: 'revive', label: `Does ${combat.enemyName} stay down?` };
                    const rr = rd[0];
                    if (combat.reviveOn.includes(rr)) { this.enemyCurrentStamina = 1; log.push(`🧟 You roll a ${rr}: ${combat.enemyName} refuses to stay down! It survives with 1 STAMINA.`); }
                    else log.push(`🎲 You roll a ${rr}: ${combat.enemyName} stays down.`);
                }

                if (this.enemyCurrentStamina <= 0) {
                    log.push(`\n🎉 You defeated ${combat.enemyName}!`);
                    if (this.currentCombatIndex < list.length - 1) {
                        this.currentCombatIndex++;
                        const next = list[this.currentCombatIndex];
                        log.push(`\n⚠️ Another enemy approaches: ${next.enemyName}!`);
                        this.enemyCurrentStamina = next.enemyStamina;
                        yield* this._combatStart(next);
                    } else {
                        this.inCombat = false;
                        this.currentCombatIndex = 0;
                        this.combatDone = true;       // the section's own options appear if the book defines no victory section
                        if (combat.victoryText) log.push(`\n${combat.victoryText}`);
                        if (combat.onVictoryEffects) {
                            this.applyEffects(combat.onVictoryEffects);
                            log.push(`😮‍💨 Victory has a price:${describeEffects(combat.onVictoryEffects)}`);
                        }
                        if (this.isGameOver) return;
                        if (this.sections.has(combat.onVictorySection)) this._navigateAfter(combat.onVictorySection);
                    }
                }
            } else if (enemyStrength > playerStrength) {
                const defense = this.calculateDefenseBonus();
                const damage = Math.max(1, 2 - defense);
                this.modifyStats({ stamina: -damage });
                log.push(defense > 0
                    ? `💔 ${combat.enemyName} hits you for ${damage} damage! (reduced from 2 by ${defense} armor bonus)`
                    : `💔 ${combat.enemyName} hits you for ${damage} damage!`);

                if (combat.onWound && this.stats.stamina > 0) {
                    const loss = combat.onWound.skillLoss || 1;
                    if (combat.onWound.luckTest) {
                        const lt = yield* this._testLuck();
                        if (lt.success) log.push(`🍀 Test your Luck (rolled ${lt.roll}): Lucky! The toxins have no effect.`);
                        else {
                            this.tempSkillPenalty += loss;
                            log.push(`☠️ Test your Luck (rolled ${lt.roll}): Unlucky! You lose ${loss} SKILL for the rest of this combat. (SKILL now ${Math.max(0, this.stats.skill - this.tempSkillPenalty)})`);
                        }
                    } else if (combat.onWound.permanent) {
                        this.stats.skill = Math.max(0, this.stats.skill - loss);
                        this.stats.initialSkill = Math.max(0, this.stats.initialSkill - loss);
                        log.push(`🩸 ${combat.enemyName}'s wound permanently drains ${loss} SKILL! (SKILL now ${this.stats.skill})`);
                    }
                }

                if (this.stats.stamina <= 0) {
                    log.push(`\n💀 You have been defeated...`);
                    this.inCombat = false;
                    this.currentCombatIndex = 0;
                    if (this.sections.has(combat.onDefeatSection)) {
                        this.isGameOver = false;           // the book's defeat section takes over
                        this.gameOverType = null;
                        this.goTo(combat.onDefeatSection);
                    }
                }
            } else {
                log.push(`⚡ Your blows meet! No damage dealt.`);
            }
        }

        flee() {
            if (this.pending) return;
            const s = this.section();
            if (!s || !s.combat || !this.inCombat) return;
            const enemy = this.currentEnemy();
            if (!this.canFleeNow(enemy)) return;
            this._run(this._flee(enemy));
        }

        *_flee(enemy) {
            if (enemy.fleeTestLuck) {
                const lt = yield* this._testLuck();
                if (!lt.success) { this.combatLog.push(`\n🎲 Test your Luck (rolled ${lt.roll}): Unlucky! They catch you before you can flee. You must keep fighting.`); return; }
                this.combatLog.push(`\n🍀 Test your Luck (rolled ${lt.roll}): Lucky! You escape.`);
            }
            this.combatLog.push(`\n🏃 You flee from ${enemy.enemyName}!`);
            this.inCombat = false;
            this._navigateAfter(enemy.fleeSection);
        }

        // ---- saving ---------------------------------------------------------------------------------------------------------
        /** Plain data (JSON-safe) describing the game; restore() puts it back. A game waiting for dice cannot be saved. */
        serialize() {
            return {
                bookId: this.book.id, started: this.started, currentSection: this.currentSection, stats: this.stats,
                inventory: this.inventory, visited: Array.from(this.visited), usedOnce: Array.from(this.usedOnce), rolledOnce: Array.from(this.rolledOnce),
                inCombat: this.inCombat, enemyCurrentStamina: this.enemyCurrentStamina, currentCombatIndex: this.currentCombatIndex, combatLog: this.combatLog,
                isGameOver: this.isGameOver, gameOverType: this.gameOverType, combatDone: this.combatDone, lastWielded: this.lastWielded,
                rollResolved: this.rollResolved, tempSkillPenalty: this.tempSkillPenalty, nextUid: this.nextUid, advance: this.advance
            };
        }

        restore(d) {
            this._blank();
            Object.assign(this, {
                started: d.started, currentSection: d.currentSection, stats: d.stats, inventory: d.inventory, visited: new Set(d.visited),
                usedOnce: new Set(d.usedOnce || []), rolledOnce: new Set(d.rolledOnce || []), inCombat: !!d.inCombat, enemyCurrentStamina: d.enemyCurrentStamina || 0,
                currentCombatIndex: d.currentCombatIndex || 0, combatLog: d.combatLog || [], isGameOver: !!d.isGameOver, gameOverType: d.gameOverType || null,
                combatDone: !!d.combatDone, lastWielded: d.lastWielded || null, rollResolved: !!d.rollResolved, tempSkillPenalty: d.tempSkillPenalty || 0,
                nextUid: d.nextUid || 1, advance: d.advance || null
            });
            this._changed();
        }
    }

    return {
        create: options => new Game(options),
        Game, upgradeBook, enemiesOf,
        describeEffects, describeConditions, combatNotes, prettyItemId, inferWeaponProperties, weaponBonus, damageAgainst,
        hasNegativeCondition, stripPositive
    };
}));
