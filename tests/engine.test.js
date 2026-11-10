'use strict';
// Rules of the game, tested on small hand-made books with scripted dice, plus scenarios on the real book.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../engine.js');

// ---- helpers -------------------------------------------------------------------------------------------
/** A random generator that yields exactly these dice, in order; a further roll is a test failure. */
const dice = (...values) => {
    let i = 0;
    const fn = () => {
        if (i >= values.length) throw new Error('the engine rolled more dice than the test expected');
        return (values[i++] - 0.5) / 6;
    };
    fn.left = () => values.length - i;
    return fn;
};

const sec = (id, extra = {}) => Object.assign({ id, text: `Section ${id}.` }, extra);
const opt = (id, target, extra = {}) => Object.assign({ id, label: `Go to ${target}`, target }, extra);
const book = (sections, extra = {}) => Object.assign({
    schemaVersion: 2, id: 't', title: 'T', startingSection: 1, initialStats: { skill: 8, stamina: 20, luck: 9 },
    startingItems: [{ id: 'sword', name: 'Sword', type: 'weapon' }], sections
}, extra);
const make = (sections, opts = {}, bookExtra = {}) => {
    const messages = [];
    const g = Engine.create(Object.assign({ book: book(sections, bookExtra), rng: dice(), onEvent: e => { if (e.type === 'message') messages.push(e.text); } }, opts));
    g.messages = messages;
    g.start();
    return g;
};
const item = (id, extra = {}) => Object.assign({ id, name: id, type: 'other' }, extra);
const enemy = (extra = {}) => Object.assign({ enemyName: 'RAT', enemySkill: 5, enemyStamina: 4 }, extra);
const names = g => g.inventory.map(i => i.id);

// ---- starting a game -------------------------------------------------------------------------------------
test('a new game has the stats of the book, 10 gold and the book\'s starting items', () => {
    const g = make([sec(1)]);
    assert.deepEqual([g.stats.skill, g.stats.stamina, g.stats.luck, g.stats.gold], [8, 20, 9, 10]);
    assert.deepEqual(names(g), ['sword']);
    assert.equal(g.currentSection, 1);
    assert.ok(g.visited.has(1));
});

test('a book without starting items gets the default equipment (4 items and 10 rations)', () => {
    const g = Engine.create({ book: { ...book([sec(1)]), startingItems: undefined } });
    g.start();
    assert.equal(g.inventory.length, 14);
    assert.equal(g.inventory.filter(i => i.id === 'rations').length, 10);
});

test('every inventory item gets its own unique id even when the book id is shared', () => {
    const g = Engine.create({ book: { ...book([sec(1)]), startingItems: undefined } });
    g.start();
    assert.equal(new Set(g.inventory.map(i => i.uid)).size, 14);
});

// ---- stats and effects -------------------------------------------------------------------------------------
test('stat changes are clamped between 0 and the Initial value; "max" restores', () => {
    const g = make([sec(1)]);
    g.modifyStats({ stamina: -5 });
    assert.equal(g.stats.stamina, 15);
    g.modifyStats({ stamina: 99 });
    assert.equal(g.stats.stamina, 20);
    g.modifyStats({ stamina: -7, luck: -3 });
    g.modifyStats({ stamina: 'max', luck: 'max' });
    assert.deepEqual([g.stats.stamina, g.stats.luck], [20, 9]);
});

test('reaching 0 STAMINA ends the game', () => {
    const g = make([sec(1)]);
    g.modifyStats({ stamina: -20 });
    assert.equal(g.isGameOver, true);
    assert.equal(g.gameOverType, 'defeat');
});

test('permanent losses lower the current score and the Initial value; max losses only the maximum', () => {
    const g = make([sec(1)]);
    g.reduceStats({ skill: -2, stamina: -3 }, true);
    assert.deepEqual([g.stats.skill, g.stats.initialSkill, g.stats.stamina, g.stats.initialStamina], [6, 6, 17, 17]);
    g.reduceStats({ stamina: -4 }, false);          // current 17 is above the new maximum 13
    assert.deepEqual([g.stats.stamina, g.stats.initialStamina], [13, 13]);
    g.modifyStats({ stamina: -5 });
    g.reduceStats({ stamina: -2 }, false);          // current 8 stays below the new maximum
    assert.deepEqual([g.stats.stamina, g.stats.initialStamina], [8, 11]);
});

test('section effects apply the first time a section is entered, never again', () => {
    const g = make([sec(1, { options: [opt('a', 2)] }), sec(2, { options: [opt('b', 1)], effects: { modifyStats: { stamina: -3 }, addItems: [item('lantern')] } })]);
    g.chooseOption('a'); g.chooseOption('b'); g.chooseOption('a');
    assert.equal(g.stats.stamina, 17);
    assert.equal(g.inventory.filter(i => i.id === 'lantern').length, 1);
});

test('effects apply whatever the route into the section (here: the success of a Luck test)', () => {
    const g = make([sec(1, { roll: { kind: 'luck', success: { target: 2 }, failure: { target: 3 } } }), sec(2, { effects: { modifyStats: { luck: 1 } } }), sec(3)], { rng: dice(1, 1) });
    g.stats.luck = 5;
    g.doRoll();                  // 2 <= 5: lucky, costs 1 LUCK (5 -> 4), section 2 gives +1 (-> 5)
    assert.equal(g.currentSection, 2);
    assert.equal(g.stats.luck, 5);
});

// ---- items ------------------------------------------------------------------------------------------------------
test('gold pieces become gold, not an item; a golden ring is an item', () => {
    const g = make([sec(1)]);
    g.addItem({ id: 'gold', name: '30 Gold Pieces', type: 'treasure' });
    g.addItem({ id: 'golden-ring', name: 'Golden Ring', type: 'other' });
    assert.equal(g.stats.gold, 40);
    assert.deepEqual(names(g), ['sword', 'golden-ring']);
});

test('unique items and bonus equipment are not collected twice; bonus potions can be', () => {
    const g = make([sec(1)]);
    g.addItem(item('journal', { unique: true })); g.addItem(item('journal', { unique: true }));
    g.addItem(item('cloak', { type: 'armor', bonus: '+1 defense' })); g.addItem(item('cloak', { type: 'armor', bonus: '+1 defense' }));
    g.addItem(item('str', { type: 'potion', bonus: '+2 skill' })); g.addItem(item('str', { type: 'potion', bonus: '+2 skill' }));
    assert.equal(g.inventory.filter(i => i.id === 'journal').length, 1);
    assert.equal(g.inventory.filter(i => i.id === 'cloak').length, 1);
    assert.equal(g.inventory.filter(i => i.id === 'str').length, 2);
});

test('removing by book id takes one item; dropping by unique id takes that exact one', () => {
    const g = make([sec(1)]);
    g.addItem(item('rations', { type: 'food' })); g.addItem(item('rations', { type: 'food' }));
    g.removeItem('rations');
    assert.equal(g.inventory.filter(i => i.id === 'rations').length, 1);
    const sword = g.inventory.find(i => i.id === 'sword');
    g.dropItem(sword.uid);
    assert.equal(g.hasItem('sword'), false);
});

test('eating food restores STAMINA (up to the maximum) and uses it up; a potion with onUse applies its effects', () => {
    const g = make([sec(1)]);
    g.modifyStats({ stamina: -10 });
    g.addItem({ id: 'rations', name: 'Provisions', type: 'food', restore: '+4 stamina' });
    g.useItem(g.inventory.find(i => i.id === 'rations').uid);
    assert.equal(g.stats.stamina, 14);
    assert.equal(g.hasItem('rations'), false);
    g.addItem({ id: 'vial', name: 'Vial', type: 'potion', onUse: { permanentStats: { skill: 1 }, modifyStats: { luck: -1 } } });
    g.useItem(g.inventory.find(i => i.id === 'vial').uid);
    assert.deepEqual([g.stats.skill, g.stats.initialSkill, g.stats.luck], [9, 9, 8]);
    assert.equal(g.messages.length, 2);
});

test('weapon properties are guessed from the name unless the book states them', () => {
    const g = make([sec(1)]);
    g.addItem({ id: 'a', name: 'Silver Dagger', type: 'weapon' });
    g.addItem({ id: 'b', name: 'Iron Mace', type: 'weapon' });
    g.addItem({ id: 'c', name: 'Blessed Sword', type: 'weapon' });
    g.addItem({ id: 'd', name: 'Silver Spoon', type: 'weapon', properties: [] });
    const p = id => g.inventory.find(i => i.id === id).properties;
    assert.deepEqual(p('a'), ['silver']); assert.deepEqual(p('b'), ['crushing']); assert.deepEqual(p('c'), ['magical']); assert.deepEqual(p('d'), []);
});

// ---- options ------------------------------------------------------------------------------------------------------
test('conditions: locked options are shown disabled, "if you do not have" options are hidden', () => {
    const g = make([sec(1, { options: [
        opt('need', 2, { conditions: { requiresItem: 'key' } }),
        opt('without', 3, { conditions: { requiresNoItem: 'key' } }),
        opt('plain', 4)
    ] }), sec(2), sec(3), sec(4)]);
    let states = g.optionStates();
    assert.deepEqual(states.map(s => [s.option.id, s.enabled]), [['need', false], ['without', true], ['plain', true]]);
    g.addItem(item('key'));
    states = g.optionStates();
    assert.deepEqual(states.map(s => [s.option.id, s.enabled]), [['need', true], ['plain', true]]);
});

test('requiresMissingAny shows the option only while at least one item is missing; lists need all items', () => {
    const g = make([sec(1, { options: [
        opt('both', 2, { conditions: { requiresItem: ['a', 'b'] } }),
        opt('lack', 3, { conditions: { requiresMissingAny: ['a', 'b'] } })
    ] }), sec(2), sec(3)]);
    g.addItem(item('a'));
    assert.deepEqual(g.optionStates().map(s => [s.option.id, s.enabled]), [['both', false], ['lack', true]]);
    g.addItem(item('b'));
    assert.deepEqual(g.optionStates().map(s => [s.option.id, s.enabled]), [['both', true]]);
});

test('an option you cannot take is refused with a message', () => {
    const g = make([sec(1, { options: [opt('need', 2, { conditions: { requiresItem: 'key' } })] }), sec(2)]);
    assert.equal(g.chooseOption('need'), false);
    assert.equal(g.currentSection, 1);
    assert.match(g.messages[0], /requirements/);
});

test('one-time decisions: after one is taken the "once" options vanish on later visits', () => {
    const g = make([sec(1, { options: [opt('drink', 2, { once: true, effects: { permanentStats: { skill: 1 } } }), opt('take', 2, { once: true }), opt('leave', 2)] }), sec(2, { options: [opt('back', 1)] })]);
    g.chooseOption('drink'); g.chooseOption('back');
    assert.deepEqual(g.optionStates().map(s => s.option.id), ['leave']);
    assert.equal(g.stats.skill, 9);
});

test('option effects apply when the option is taken; dying from them ends the game without moving on', () => {
    const g = make([sec(1, { options: [opt('hurt', 2, { effects: { modifyStats: { stamina: -25 } } })] }), sec(2)]);
    g.chooseOption('hurt');
    assert.equal(g.isGameOver, true);
    assert.equal(g.currentSection, 1);
});

// ---- Luck tests and dice tables --------------------------------------------------------------------------------------
test('a Luck test succeeds on 2d6 <= LUCK, costs 1 LUCK, and applies the effects of its outcome', () => {
    const roll = { kind: 'luck', success: { target: 2 }, failure: { target: 3, effects: { modifyStats: { stamina: -4 } } } };
    const lucky = make([sec(1, { roll }), sec(2), sec(3)], { rng: dice(3, 4) });       // 7 <= 9
    lucky.doRoll();
    assert.deepEqual([lucky.currentSection, lucky.stats.luck, lucky.stats.stamina], [2, 8, 20]);
    const unlucky = make([sec(1, { roll }), sec(2), sec(3)], { rng: dice(5, 5) });     // 10 > 9
    unlucky.doRoll();
    assert.deepEqual([unlucky.currentSection, unlucky.stats.luck, unlucky.stats.stamina], [3, 8, 16]);
    assert.match(unlucky.messages[0], /Unlucky! \(rolled 10\).*\[-4 STAMINA\]/);
});

test('a roll can be made once per visit; a "once" roll only the first time in a game', () => {
    const roll = { kind: 'luck', once: true, success: {}, failure: {} };
    const g = make([sec(1, { roll, options: [opt('go', 2)] }), sec(2, { options: [opt('back', 1)] })], { rng: dice(1, 1) });
    g.doRoll(); g.doRoll();                               // the second call does nothing (no extra dice)
    assert.equal(g.rollPending(), false);
    g.chooseOption('go'); g.chooseOption('back');
    assert.equal(g.rollPending(), false);                 // "once": not offered again on a later visit
    const g2 = make([sec(1, { roll: { kind: 'luck', success: {}, failure: {} }, options: [opt('go', 2)] }), sec(2, { options: [opt('back', 1)] })], { rng: dice(1, 1) });
    g2.doRoll(); g2.chooseOption('go'); g2.chooseOption('back');
    assert.equal(g2.rollPending(), true);                 // without "once" it is offered again
});

test('gatesOptions hides the options until the roll was made; a roll with conditions is offered only when they hold', () => {
    const g = make([sec(1, { roll: { kind: 'luck', gatesOptions: true, success: {}, failure: {} }, options: [opt('go', 2)] }), sec(2)], { rng: dice(1, 1) });
    assert.deepEqual(g.optionStates(), []);
    g.doRoll();
    assert.deepEqual(g.optionStates().map(s => s.option.id), ['go']);
    const g2 = make([sec(1, { roll: { kind: 'luck', conditions: { requiresNoItem: 'key' }, success: {}, failure: {} } })], { rng: dice() });
    assert.equal(g2.rollPending(), true);
    g2.addItem(item('key'));
    assert.equal(g2.rollPending(), false);
});

test('a dice table picks the outcome by the die, applies its effects and goes on (or stays)', () => {
    const roll = { kind: 'dice', dice: '1d6', outcomes: [
        { min: 1, max: 2, text: 'Ouch', target: 2, effects: { modifyStats: { stamina: -3 } } },
        { min: 3, max: 6, text: 'Fine' }
    ] };
    const low = make([sec(1, { roll }), sec(2)], { rng: dice(2) });
    low.doRoll();
    assert.deepEqual([low.currentSection, low.stats.stamina], [2, 17]);
    const high = make([sec(1, { roll }), sec(2)], { rng: dice(5) });
    high.doRoll();
    assert.equal(high.currentSection, 1);                 // no target: stays
    assert.match(high.messages[0], /You rolled 5\. Fine/);
});

test('a dice outcome can ask for a Luck test of its own', () => {
    const roll = { kind: 'dice', dice: '1d6', outcomes: [{ min: 1, max: 6, luck: { success: { text: 'caught it' }, failure: { target: 2 } } }] };
    const lucky = make([sec(1, { roll }), sec(2)], { rng: dice(3, 1, 1) });
    lucky.doRoll();
    assert.equal(lucky.currentSection, 1);
    const unlucky = make([sec(1, { roll }), sec(2)], { rng: dice(3, 6, 6) });
    unlucky.doRoll();
    assert.equal(unlucky.currentSection, 2);
});

test('dying from the effects of a roll stops the navigation', () => {
    const g = make([sec(1, { roll: { kind: 'luck', success: {}, failure: { target: 2, effects: { modifyStats: { stamina: -30 } } } } }), sec(2)], { rng: dice(6, 6) });
    g.doRoll();
    assert.deepEqual([g.isGameOver, g.currentSection], [true, 1]);
});

// ---- combat ------------------------------------------------------------------------------------------------------------
const fightBook = (en, extra = {}) => [sec(1, Object.assign({ combat: en, options: [opt('on', 2)] }, extra)), sec(2), sec(3), sec(9)];
/** player 2d6 then enemy 2d6 for each round */
const rounds = (...pairs) => dice(...pairs.flat());

test('a round: the higher attack strength wins; the loser loses STAMINA (2 for the player, 2 for the enemy)', () => {
    const g = make(fightBook(enemy({ enemySkill: 5, enemyStamina: 6 })), { rng: rounds([5, 5, 2, 2], [1, 1, 6, 6], [3, 3, 3, 2]) });
    g.startCombat();
    g.fightRound();                    // player 10+8=18 vs 4+5=9: hit
    assert.equal(g.enemyCurrentStamina, 4);
    g.fightRound();                    // player 2+8=10 vs 12+5=17: hit
    assert.equal(g.stats.stamina, 18);
    g.fightRound();                    // 6+8=14 vs 5+5=10: hit
    assert.equal(g.enemyCurrentStamina, 2);
    assert.ok(g.combatLog.some(l => /Round 3/.test(l)));
});

test('equal strengths: nobody is hurt', () => {
    const g = make(fightBook(enemy({ enemySkill: 8 })), { rng: rounds([3, 3, 3, 3]) });
    g.startCombat(); g.fightRound();
    assert.deepEqual([g.stats.stamina, g.enemyCurrentStamina], [20, 4]);
});

test('armour bonus reduces damage taken (never below 1); the best weapon is wielded', () => {
    const g = make(fightBook(enemy({ enemySkill: 12, enemyStamina: 20 })), { rng: rounds([1, 1, 6, 6]) });
    g.addItem(item('cloak', { type: 'armor', bonus: '+1 defense' })); g.addItem(item('cloak2', { type: 'armor', bonus: '+5 defense' }));
    g.startCombat(); g.fightRound();
    assert.equal(g.stats.stamina, 19);
    const w = make(fightBook(enemy({ enemySkill: 1, enemyStamina: 20 })), { rng: rounds([2, 2, 2, 2], [4, 4, 3, 3]) });
    w.addItem({ id: 'blade', name: 'Blade', type: 'weapon', bonus: '+2 skill' });
    w.startCombat(); w.fightRound();
    assert.ok(w.combatLog.some(l => /You fight with: Blade/.test(l)));
    assert.ok(w.combatLog.some(l => /8 SKILL \+ 2 \(weapon bonus\)/.test(l)));
});

test('weapons that are not magical cannot hurt an immune enemy; crushing weapons hurt skeletons more', () => {
    const ghost = make(fightBook(enemy({ effectiveWeapons: ['magical'], normalWeaponDamage: 0, enemySkill: 1 })), { rng: rounds([6, 6, 1, 1]) });
    ghost.startCombat(); ghost.fightRound();
    assert.equal(ghost.enemyCurrentStamina, 4);
    assert.ok(ghost.combatLog.some(l => /passes harmlessly/.test(l)));
    ghost.addItem({ id: 'ml', name: 'Longsword', type: 'weapon', properties: ['magical'] });
    ghost.rng = dice(6, 6, 1, 1);
    ghost.fightRound();
    assert.equal(ghost.enemyCurrentStamina, 2);
    const bones = make(fightBook(enemy({ weakTo: { property: 'crushing', damage: 3 }, enemySkill: 1, enemyStamina: 9 })), { rng: rounds([6, 6, 1, 1]) });
    bones.addItem({ id: 'mace', name: 'Mace', type: 'weapon' });
    bones.startCombat(); bones.fightRound();
    assert.equal(bones.enemyCurrentStamina, 6);
});

test('wounds: permanent SKILL drain, or a Luck test for a penalty that lasts for the fight only', () => {
    const drain = make(fightBook(enemy({ enemySkill: 12, onWound: { skillLoss: 1, permanent: true } })), { rng: rounds([1, 1, 6, 6]) });
    drain.startCombat(); drain.fightRound();
    assert.deepEqual([drain.stats.skill, drain.stats.initialSkill], [7, 7]);
    const toxin = make(fightBook(enemy({ enemySkill: 12, onWound: { skillLoss: 2, luckTest: true } })), { rng: rounds([1, 1, 6, 6], [6, 6]) });
    toxin.startCombat(); toxin.fightRound();              // Luck test dice 6+6 = 12 > 9: unlucky
    assert.equal(toxin.tempSkillPenalty, 2);
    assert.equal(toxin.stats.skill, 8);
    toxin.goTo(2);
    assert.equal(toxin.tempSkillPenalty, 0);
});

test('Undead Fortitude: at 0 STAMINA a die decides whether the enemy gets up with 1 STAMINA', () => {
    const e = enemy({ enemySkill: 1, enemyStamina: 2, reviveOn: [5, 6] });
    const up = make(fightBook(e), { rng: rounds([6, 6, 1, 1], [5]) });
    up.startCombat(); up.fightRound();
    assert.equal(up.enemyCurrentStamina, 1);
    assert.equal(up.inCombat, true);
    const down = make(fightBook(e), { rng: rounds([6, 6, 1, 1], [3]) });
    down.startCombat(); down.fightRound();
    assert.equal(down.inCombat, false);
});

test('several enemies are fought one after another; the fight ends when the last falls', () => {
    const g = make(fightBook([enemy({ enemyName: 'A', enemyStamina: 2, onVictorySection: 2 }), enemy({ enemyName: 'B', enemyStamina: 2, onVictorySection: 2 })]), { rng: rounds([6, 6, 1, 1], [6, 6, 1, 1]) });
    g.startCombat(); g.fightRound();
    assert.equal(g.currentEnemy().enemyName, 'B');
    assert.equal(g.enemyCurrentStamina, 2);
    g.fightRound();
    assert.equal(g.currentSection, 2);
});

test('start-of-fight effects: a Luck test (a wail) or a flat penalty (underwater)', () => {
    const wail = make(fightBook(enemy({ onStart: { luckTest: true, skillLoss: 2 } })), { rng: dice(6, 6) });
    wail.startCombat();
    assert.equal(wail.tempSkillPenalty, 2);
    const water = make(fightBook(enemy({ onStart: { skillLoss: 2, text: 'Fighting underwater' } })), { rng: dice() });
    water.startCombat();
    assert.equal(water.tempSkillPenalty, 2);
});

test('winning goes to the victory section; with none the section\'s own options appear; victory can cost STAMINA', () => {
    const win = make(fightBook(enemy({ enemySkill: 1, enemyStamina: 2, onVictorySection: 2, onVictoryEffects: { modifyStats: { stamina: -2 } }, victoryText: 'It falls.' })), { rng: rounds([6, 6, 1, 1]) });
    win.startCombat(); win.fightRound();
    assert.deepEqual([win.currentSection, win.stats.stamina], [2, 18]);
    const none = make(fightBook(enemy({ enemySkill: 1, enemyStamina: 2 })), { rng: rounds([6, 6, 1, 1]) });
    none.startCombat();
    assert.deepEqual(none.optionStates(), []);            // options stay hidden during the fight
    none.fightRound();
    assert.equal(none.combatDone, true);
    assert.deepEqual(none.optionStates().map(s => s.option.id), ['on']);
    const deadly = make(fightBook(enemy({ enemySkill: 1, enemyStamina: 2, onVictorySection: 2, onVictoryEffects: { modifyStats: { stamina: -25 } } })), { rng: rounds([6, 6, 1, 1]) });
    deadly.startCombat(); deadly.fightRound();
    assert.deepEqual([deadly.isGameOver, deadly.currentSection], [true, 1]);
});

test('losing: to the defeat section if the book has one, otherwise the game is over', () => {
    const a = make(fightBook(enemy({ enemySkill: 12, onDefeatSection: 9 })), { rng: rounds([1, 1, 6, 6]) });
    a.modifyStats({ stamina: -19 });
    a.startCombat(); a.fightRound();
    assert.deepEqual([a.isGameOver, a.currentSection], [false, 9]);
    const b = make(fightBook(enemy({ enemySkill: 12 })), { rng: rounds([1, 1, 6, 6]) });
    b.modifyStats({ stamina: -19 });
    b.startCombat(); b.fightRound();
    assert.equal(b.isGameOver, true);
});

test('fleeing: only when allowed and STAMINA is low enough; a Luck test can fail and the fight goes on', () => {
    const e = enemy({ canFlee: true, fleeSection: 3, fleeMaxStamina: 4, fleeTestLuck: true });
    const g = make(fightBook(e), { rng: dice(6, 6, 1, 1) });
    g.startCombat();
    assert.equal(g.canFleeNow(g.currentEnemy()), false);   // STAMINA 20 > 4
    g.modifyStats({ stamina: -17 });
    g.flee();                                              // Luck test 12 > 9: unlucky
    assert.equal(g.inCombat, true);
    g.flee();                                              // 2 <= 8: lucky
    assert.deepEqual([g.inCombat, g.currentSection], [false, 3]);
});

// ---- dice by hand ---------------------------------------------------------------------------------------------------------
test('with auto-roll off the engine stops and asks for each die; nothing else is accepted meanwhile', () => {
    const events = [];
    const g = make([sec(1, { roll: { kind: 'luck', success: { target: 2 }, failure: { target: 3 } }, options: [opt('x', 3)] }), sec(2), sec(3)], { autoRoll: false, onEvent: e => events.push(e.type) });
    g.doRoll();
    assert.deepEqual(g.pendingRoll, { dice: '2d6', reason: 'luck', label: 'Test your Luck' });
    assert.ok(events.includes('roll-needed'));
    assert.equal(g.chooseOption('x'), false);              // refused while waiting
    g.resolveRoll([2, 3]);                                 // 5 <= 9
    assert.equal(g.pendingRoll, null);
    assert.equal(g.currentSection, 2);
});

test('a combat round asks for two rolls (yours, then the enemy\'s); the player\'s own values are used', () => {
    const g = make(fightBook(enemy({ enemySkill: 5, enemyStamina: 6 })), { autoRoll: false });
    g.startCombat();
    g.fightRound();
    assert.equal(g.pendingRoll.who, 'player');
    g.resolveRoll([6, 6]);
    assert.equal(g.pendingRoll.who, 'enemy');
    g.resolveRoll([1, 1]);
    assert.equal(g.pendingRoll, null);
    assert.equal(g.enemyCurrentStamina, 4);                // 12+8 = 20 beats 2+5 = 7
});

test('values that are not valid dice are ignored (the engine rolls instead)', () => {
    const g = make([sec(1, { roll: { kind: 'dice', dice: '1d6', outcomes: [{ min: 1, max: 6, text: 'x' }] } })], { autoRoll: false, rng: dice(4) });
    g.doRoll();
    g.resolveRoll([9]);
    assert.match(g.messages[0], /You rolled 4/);
});

test('switching auto-roll on lets the same actions finish by themselves', () => {
    const g = make([sec(1, { roll: { kind: 'luck', success: { target: 2 }, failure: { target: 2 } } }), sec(2)], { autoRoll: false, rng: dice(1, 1) });
    g.setAutoRoll(true);
    g.doRoll();
    assert.equal(g.currentSection, 2);
});

test('with autoAdvance off, a won fight waits for advanceNow(); choosing something else cancels the wait', () => {
    const e = enemy({ enemySkill: 1, enemyStamina: 2, onVictorySection: 2 });
    const g = make(fightBook(e), { autoAdvance: false, rng: rounds([6, 6, 1, 1]) });
    g.startCombat(); g.fightRound();
    assert.deepEqual([g.currentSection, g.advance], [1, { target: 2 }]);
    g.advanceNow();
    assert.deepEqual([g.currentSection, g.advance], [2, null]);
    const h = make(fightBook(e), { autoAdvance: false, rng: rounds([6, 6, 1, 1]) });
    h.startCombat(); h.fightRound();
    h.chooseOption('on');
    assert.equal(h.advance, null);
});

// ---- saving ------------------------------------------------------------------------------------------------------------------
test('a game saved in the middle of a fight comes back exactly (through JSON)', () => {
    const b = fightBook(enemy({ enemySkill: 5, enemyStamina: 10 }));
    const g = make(b, { rng: rounds([5, 5, 2, 2]) });
    g.addItem(item('key')); g.startCombat(); g.fightRound(); g.usedOnce.add(7);
    const saved = JSON.parse(JSON.stringify(g.serialize()));
    const h = make(b, { rng: dice() });
    h.restore(saved);
    assert.deepEqual(h.serialize(), g.serialize());
    assert.equal(h.inCombat, true);
    assert.equal(h.enemyCurrentStamina, g.enemyCurrentStamina);
});

// ---- determinism and old books ----------------------------------------------------------------------------------------------------
test('the same seed gives the same game', () => {
    const v2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'CURSE_OF_HOLLOWS_END.v2.json'), 'utf8'));
    const play = seed => {
        let a = seed;
        const rng = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const g = Engine.create({ book: v2, rng });
        g.start();
        const path_ = [];
        for (let i = 0; i < 300 && !g.isGameOver; i++) {
            const s = g.section();
            if (g.rollPending(s)) g.doRoll();
            else if (s.combat && !g.combatDone) { g.startCombat(); while (g.inCombat && !g.isGameOver) g.fightRound(); }
            else { const o = g.optionStates(s).filter(x => x.enabled); if (!o.length) break; g.chooseOption(o[Math.floor(rng() * o.length)].option.id); }
            path_.push(g.currentSection);
        }
        return JSON.stringify([path_, g.stats]);
    };
    assert.equal(play(7), play(7));
    assert.notEqual(play(7), play(8));
});

test('upgradeBook turns the old format into exactly the structure the converter produces (text and labels aside)', () => {
    const root = path.join(__dirname, '..');
    const v1 = JSON.parse(fs.readFileSync(path.join(root, 'CURSE_OF_HOLLOWS_END.json'), 'utf8'));
    const v2 = JSON.parse(fs.readFileSync(path.join(root, 'CURSE_OF_HOLLOWS_END.v2.json'), 'utf8'));
    const up = Engine.upgradeBook(v1);
    assert.equal(up.sections.length, v2.sections.length);
    const strip = s => {
        const c = JSON.parse(JSON.stringify(s));
        delete c.text; delete c.title;
        if (c.options) c.options = c.options.map(o => { const { label, ...rest } = o; return rest; });
        if (c.combat) (Array.isArray(c.combat) ? c.combat : [c.combat]).forEach(e => delete e.victoryText);
        return c;
    };
    up.sections.forEach((s, i) => {
        const w = v2.sections[i];
        assert.equal(s.id, w.id);
        const a = strip(s), b = strip(w);
        // the old flag marked 9 mid-game sections as endings; the converter dropped them, the in-memory upgrade drops them too
        assert.deepEqual(a, b, `section ${s.id}`);
    });
});

test('a v2 book is used as it is', () => {
    const b = book([sec(1)]);
    assert.equal(Engine.upgradeBook(b), b);
});

// ---- scenarios on the real book -----------------------------------------------------------------------------------------------------------
const real = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'CURSE_OF_HOLLOWS_END.v2.json'), 'utf8'));
const play = (rng, extra = {}) => { const g = Engine.create(Object.assign({ book: real(), rng }, extra)); g.start(); return g; };
const ids = g => g.optionStates().map(s => s.option.id);

test('real book: the pit trap at 245 asks for a Luck save instead of killing; options come after the roll', () => {
    const g = play(dice(1, 2, 3));           // die 1 (the death band), then the Luck test 2+3 = 5 <= 9
    g.goTo(245);
    assert.deepEqual(ids(g), []);            // hidden until the roll
    g.doRoll();
    assert.equal(g.currentSection, 245);
    assert.equal(g.stats.stamina, 16);
    assert.deepEqual(ids(g), ['to-155']);
    const d = play(dice(1, 6, 6));
    d.goTo(245); d.doRoll();
    assert.equal(d.currentSection, 4);       // an unlucky save falls
    assert.equal(d.section().ending.type, 'defeat');
});

test('real book: the encounter hub 301 rolls once per game, then shows its menu', () => {
    const g = play(dice(2));
    g.goTo(301);
    g.doRoll();
    assert.equal(g.currentSection, 302);     // a Phantom Servant
    g.goTo(301);
    assert.equal(g.rollPending(), false);
    assert.ok(ids(g).length > 10);
});

test('real book: the final door needs the key and her name; without them you can back away', () => {
    const g = play(dice());
    g.goTo(395);
    assert.deepEqual(ids(g), ['to-388', 'to-362']);
    assert.equal(g.rollPending(), false);
    g.addItem({ id: 'silver-key', name: 'Silver Key', type: 'key' });
    g.addItem({ id: 'true-name', name: 'True Name', type: 'other' });
    assert.equal(g.rollPending(), true);
    assert.deepEqual(ids(g), []);
});

test('real book: the Widow\'s ritual - lucky ends the book, unlucky means her immune self at 394', () => {
    const lucky = play(dice(1, 1));
    lucky.addItem({ id: 'silver-key', name: 'Silver Key', type: 'key' }); lucky.addItem({ id: 'true-name', name: 'N', type: 'other' });
    lucky.goTo(395); lucky.doRoll();
    assert.equal(lucky.currentSection, 400);
    assert.equal(lucky.section().ending.type, 'victory');
    const unlucky = play(dice(6, 6, 6, 6, 1, 1, 1, 1));
    unlucky.addItem({ id: 'silver-key', name: 'Silver Key', type: 'key' }); unlucky.addItem({ id: 'true-name', name: 'N', type: 'other' });
    unlucky.goTo(395); unlucky.doRoll();
    assert.equal(unlucky.currentSection, 394);
    unlucky.startCombat();                   // the Wail: Test Luck 6+6 = 12 -> unlucky, -2 SKILL
    assert.equal(unlucky.tempSkillPenalty, 2);
    unlucky.fightRound();                    // you 6+6+6 vs her 1+1+11: a hit - but a plain sword passes through her
    assert.equal(unlucky.enemyCurrentStamina, 15);
});

test('real book: a preparation room returns to its hub, and a fountain heals only the first time', () => {
    const g = play(dice());
    g.goTo(388); g.goTo(390);
    assert.deepEqual(ids(g), ['to-388']);
    g.modifyStats({ stamina: -9 });
    g.chooseOption('to-388'); g.goTo(390);
    assert.equal(g.stats.stamina, 11);
});

test('real book: the vial in 35 can be drunk, taken or left - once', () => {
    const g = play(dice());
    g.goTo(35);
    assert.equal(ids(g).filter(i => i.startsWith('to-111')).length, 3);
    g.chooseOption('to-111');                // drink: +1 SKILL permanently, -1 LUCK
    assert.deepEqual([g.stats.skill, g.stats.initialSkill, g.stats.luck], [9, 9, 8]);
    g.goTo(35);
    assert.deepEqual(ids(g), ['to-111-3']);  // only "leave" remains
});

test('real book: the rope gate at 89 - with rope you wade across, without it you test your Luck', () => {
    const g = play(dice());
    g.goTo(89);
    assert.equal(g.rollPending(), true);
    g.addItem({ id: 'rope', name: 'Rope', type: 'other' });
    assert.equal(g.rollPending(), false);
    assert.deepEqual(g.optionStates().map(s => [s.option.id, s.enabled]), [['to-221', true]]);
});

// ---- the open book issues, fixed ---------------------------------------------------------------------------
test('a wound that has not healed (nextFightSkill) is carried into the next fight, once, and survives a save', () => {
    const g = make([sec(1), sec(2, { combat: enemy() }), sec(3, { combat: enemy() })]);
    g.applyEffects({ nextFightSkill: -1 });
    assert.equal(g.carriedSkillPenalty, 1);
    const copy = Engine.create({ book: book([sec(1), sec(2, { combat: enemy() }), sec(3, { combat: enemy() })]), rng: dice() });
    copy.restore(JSON.parse(JSON.stringify(g.serialize())));
    assert.equal(copy.carriedSkillPenalty, 1, 'saved and restored');
    g.goTo(2); g.startCombat();
    assert.equal(g.tempSkillPenalty, 1);
    assert.equal(g.carriedSkillPenalty, 0, 'used up');
    g.goTo(3); g.startCombat();
    assert.equal(g.tempSkillPenalty, 0, 'the second fight is not affected');
    assert.equal(Engine.describeEffects({ nextFightSkill: -1 }), ' [-1 SKILL in your next fight]');
});

test('real book: section 22 is a Luck test; the paralysis costs 1 SKILL in the next fight', () => {
    const bad = play(dice(6, 6));
    bad.goTo(22); bad.doRoll();
    assert.equal(bad.currentSection, 298);
    assert.equal(bad.carriedSkillPenalty, 1);
    bad.goTo(46); bad.startCombat();
    assert.equal(bad.tempSkillPenalty >= 1, true);
    const good = play(dice(1, 1));
    good.goTo(22); good.doRoll();
    assert.equal(good.currentSection, 298);
    assert.equal(good.carriedSkillPenalty, 0);
});

test('real book: the instant-death pages are defeats and 39 hands out nothing', () => {
    const b = real(); const S = id => b.sections.find(s => s.id === id);
    for (const id of [4, 39, 65]) assert.equal(S(id).ending.type, 'defeat', `section ${id}`);
    assert.equal(S(39).effects, undefined);
});

test('real book: 362 ends in the incomplete victory (998), not in the Phantom Servant fight', () => {
    const b = real(); const S = id => b.sections.find(s => s.id === id);
    assert.deepEqual([...new Set(S(362).combat.map(e => e.onVictorySection))], [998]);
    assert.equal(S(998).ending.type, 'neutral');
    assert.match(S(998).text, /INCOMPLETE VICTORY/);
});

test('real book: after the zombies in 180 the menu is shown, so sections 260-280 can be reached', () => {
    const b = real(); const s = b.sections.find(x => x.id === 180);
    assert.ok(s.combat.every(e => e.onVictorySection === undefined));
    const seen = new Set();
    const walk = id => { if (seen.has(id)) return; seen.add(id); const x = b.sections.find(y => y.id === id); if (!x) return;
        const t = (x.options || []).map(o => o.target);
        if (x.roll) JSON.stringify(x.roll).replace(/"target":(\d+)/g, (_, n) => t.push(+n));
        [].concat(x.combat || []).forEach(e => ['onVictorySection', 'onDefeatSection', 'fleeSection'].forEach(k => e[k] != null && t.push(e[k])));
        t.forEach(walk); };
    walk(1);
    for (let i = 260; i <= 280; i++) if (b.sections.some(x => x.id === i)) assert.ok(seen.has(i), `section ${i} is reachable`);
});

test('real book: a failed Luck test at a trap costs STAMINA and goes where success goes - never to a reward', () => {
    const b = real();
    for (const id of [138, 224, 256, 295, 142, 304, 228]) {
        const r = b.sections.find(s => s.id === id).roll;
        assert.equal(r.failure.target, r.success.target, `section ${id}`);
        assert.ok(r.failure.effects.modifyStats.stamina < 0, `section ${id}`);
    }
    const shrine = b.sections.find(s => s.id === 155).options.find(o => o.target === 97);
    assert.ok(shrine, 'the healing shrine (97) can still be found');
});

test('real book: the well (54, 164) needs rope and the Mayor (24) needs the ledger - reading the page gives nothing', () => {
    const g = play(dice());
    g.goTo(54);
    assert.deepEqual(names(g).includes('rope'), false);
    assert.deepEqual(g.optionStates().map(s => [s.option.id, s.enabled]), [['to-109', false], ['to-127', true]]);
    g.addItem({ id: 'rope', name: 'Rope', type: 'other' });
    assert.equal(g.optionStates()[0].enabled, true);
    g.goTo(164);
    assert.equal(g.optionStates()[0].enabled, true);
    g.goTo(24);
    assert.equal(names(g).includes('book'), false);
    assert.deepEqual(g.optionStates().map(s => [s.option.id, s.enabled]), [['to-234', false], ['to-127', true]]);
    g.addItem({ id: 'mayors-ledger', name: "Mayor's Ledger", type: 'other' });
    assert.equal(g.optionStates()[0].enabled, true);
});
