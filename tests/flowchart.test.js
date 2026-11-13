'use strict';
// The flowchart: the beginning at the top, every section a box, every option an arrow, in layers by distance from the start.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');

function build(book) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-')), 'flow.html');
    const r = spawnSync('python3', ['make_flowchart.py', book, out], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(fs.readFileSync(out, 'utf8').match(/const DATA = (\{.*\});\n\(\(\) =>/)[1]);
}

test('every section is a box and every option an arrow, the start is at the top, no two boxes overlap', () => {
    for (const f of ['CURSE_OF_HOLLOWS_END.v2.json', 'templates/minimal-book.v2.json']) {
        const book = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
        const d = build(f);
        assert.equal(d.nodes.length, book.sections.length, f);
        const byId = new Map(d.nodes.map(n => [n.id, n]));
        assert.equal(byId.get(d.start).layer, 0);
        assert.equal(Math.min(...d.nodes.filter(n => n.id !== 0).map(n => n.layer)), 0, 'nothing sits above the beginning (but the introduction)');
        for (const e of d.edges) {
            const ls = byId.get(e.s).layer, lt = byId.get(e.t).layer;
            assert.equal(e.c, lt > ls ? 'fwd' : lt === ls ? 'same' : 'back', `${e.s} -> ${e.t}`);
        }
        const rows = new Map();
        for (const n of d.nodes) { const r = rows.get(n.layer) || []; r.push(n.x); rows.set(n.layer, r); }
        for (const xs of rows.values()) { xs.sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 90, 'boxes in a layer are kept apart'); }
    }
});

test('a section is as deep as the fewest choices that reach it', () => {
    const d = build('CURSE_OF_HOLLOWS_END.v2.json'); const L = id => d.nodes.find(n => n.id === id).layer;
    assert.deepEqual([L(1), L(45), L(127), L(234)], [0, 1, 1, 1]);
    assert.ok(L(395) > L(355), 'the final door lies beyond the manor');
    assert.ok(d.edges.some(e => e.c === 'back'), 'links back to earlier layers are flagged');
});
