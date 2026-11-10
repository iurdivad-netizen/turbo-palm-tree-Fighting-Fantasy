'use strict';
// The author's guide must stay true: the template validates, the sidecars point at real sections, every file named in the guide exists.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the template and the shipped books pass the validator', () => {
    for (const f of ['templates/minimal-book.v2.json', 'CURSE_OF_HOLLOWS_END.v2.json', 'example-adventure.v2.json']) {
        const r = spawnSync('python3', ['validate_adventure.py', f], { cwd: root, encoding: 'utf8' });
        assert.equal(r.status, 0, `${f}: ${r.stdout}${r.stderr}`);
        assert.match(r.stdout, /OK/, f);
    }
});

test('the Curse sim sidecar and overrides refer to sections and items that exist', () => {
    const book = JSON.parse(read('CURSE_OF_HOLLOWS_END.v2.json'));
    const ids = new Set(book.sections.map(s => s.id));
    const sim = JSON.parse(read('CURSE_OF_HOLLOWS_END.sim.json'));
    for (const n of [sim.finalSection, ...sim.avoidUntilReady, ...Object.values(sim.analytics).filter(Number.isInteger)]) assert.ok(ids.has(n), `section ${n}`);
    const ov = JSON.parse(read('CURSE_OF_HOLLOWS_END.overrides.json'));
    for (const [sec, labels] of Object.entries(ov.labels || {})) {
        const s = book.sections.find(x => x.id === Number(sec));
        assert.ok(s, `override section ${sec}`);
        for (const [opt, label] of Object.entries(labels)) assert.equal(s.options.find(o => o.id === opt).label, label, `${sec}/${opt}`);
    }
});

test('every file the author guide names exists', () => {
    const guide = read('AUTHORING.md');
    const names = [...guide.matchAll(/`((?:templates\/)?[\w.-]+\.(?:json|py|js|md|html))`/g)].map(m => m[1]).filter(n => !/^(my-book|old|book|<)/.test(n) && !n.includes('<'));
    assert.ok(names.length > 5);
    for (const n of new Set(names)) assert.ok(fs.existsSync(path.join(root, n)), n);
});
