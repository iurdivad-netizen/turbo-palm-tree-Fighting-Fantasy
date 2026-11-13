'use strict';
// The book map: every section is a node and every way out of a section is a link, for any book in format v2.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');

function build(book) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'map-')), 'map.html');
    const r = spawnSync('python3', ['make_book_map.py', book, out], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const html = fs.readFileSync(out, 'utf8');
    const m = html.match(/const DATA = (\{.*\});\n\(\(\) =>/);
    assert.ok(m, 'the data is embedded');
    return JSON.parse(m[1]);
}

test('the map has a node per section and a link per way out, for the real book and the template', () => {
    for (const f of ['CURSE_OF_HOLLOWS_END.v2.json', 'templates/minimal-book.v2.json']) {
        const book = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
        const data = build(f);
        assert.equal(data.nodes.length, book.sections.length, f);
        const ids = new Set(book.sections.map(s => s.id));
        assert.ok(data.edges.length > 0 && data.edges.every(e => ids.has(e.s) && ids.has(e.t)), `${f}: every link joins two sections`);
        assert.equal(data.start, book.startingSection);
    }
});

test('endings, fights, rolls and the start are told apart', () => {
    const data = build('CURSE_OF_HOLLOWS_END.v2.json');
    const kind = id => data.nodes.find(n => n.id === id).kind;
    assert.deepEqual([kind(1), kind(400), kind(999), kind(998), kind(30), kind(245)], ['start', 'end-victory', 'end-defeat', 'end-neutral', 'combat', 'dice']);
    const links = data.edges.filter(e => e.s === 395).map(e => `${e.t}:${e.k}`).sort();
    assert.deepEqual(links, ['362:option', '388:option', '394:failure', '400:success']);
});
