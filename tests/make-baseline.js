#!/usr/bin/env node
'use strict';
// Records the fingerprint of a simulation run, so tests/simulation.test.js can notice if the game's behaviour changes.
// Usage: node simulate_playthroughs.js CURSE_OF_HOLLOWS_END.json 1000 simulation-results.json 20240601 && node tests/make-baseline.js
// Do this on purpose, after a deliberate change to the rules or to the book's data (and say why in the commit).
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const results = JSON.parse(fs.readFileSync(path.join(__dirname, '..', process.argv[2] || 'simulation-results.json'), 'utf8'));
const policies = JSON.stringify(results.policies);
const baseline = {
    note: 'Fingerprint of simulate_playthroughs.js on CURSE_OF_HOLLOWS_END.json, 1000 games per player, seed 20240601. The first version of this fingerprint was identical to the results recorded from the old in-browser game logic (260 KB, every field).',
    book: results.book.file, games: results.games, seed: results.seed,
    outcomes: Object.fromEntries(Object.entries(results.policies).map(([k, v]) => [k, v.outcomes])),
    sha256: crypto.createHash('sha256').update(policies).digest('hex')
};
fs.writeFileSync(path.join(__dirname, 'simulation-baseline.json'), JSON.stringify(baseline, null, 2) + '\n');
console.log('wrote tests/simulation-baseline.json', baseline.outcomes);
