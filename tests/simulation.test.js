'use strict';
// The engine must keep playing exactly as it did when it was extracted from index.html: a seeded run of 3,000 games
// (3 players x 1,000) gives the same results in every recorded field. Takes about 10 seconds.
// If you changed the rules or the book on purpose, refresh the fingerprint with tests/make-baseline.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'simulation-baseline.json'), 'utf8'));

test('the seeded simulation reproduces the recorded results exactly', { timeout: 180000 }, () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sim-')), 'results.json');
    const r = spawnSync('node', ['simulate_playthroughs.js', baseline.book, String(baseline.games), out, String(baseline.seed)], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const results = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(Object.fromEntries(Object.entries(results.policies).map(([k, v]) => [k, v.outcomes])), baseline.outcomes);
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(results.policies)).digest('hex'), baseline.sha256);
});

test('the converted v2 book plays identically to the original book', { timeout: 180000 }, () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sim-')), 'results.json');
    const r = spawnSync('node', ['simulate_playthroughs.js', 'CURSE_OF_HOLLOWS_END.v2.json', String(baseline.games), out, String(baseline.seed)], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const results = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(results.policies)).digest('hex'), baseline.sha256);
});
