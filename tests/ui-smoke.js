#!/usr/bin/env node
'use strict';
// Drives the real page in a browser: load the converted book, play, roll the dice by hand, fight, switch on auto-roll.
// Needs Playwright (npm i playwright). It serves the repository itself; nothing else has to be running.
// Usage: node tests/ui-smoke.js        (exit code 1 if anything fails)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/plain' });
    res.end(fs.readFileSync(file));
});

(async () => {
    await new Promise(r => server.listen(0, r));
    const url = `http://localhost:${server.address().port}/index.html`;
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/cdnjs.cloudflare.com/**', r => r.abort());          // the PDF library is not needed here
    try {
        await page.goto(url);
        await page.click('text=The Curse of Hollow');
        await page.waitForSelector('text=Start Adventure');
        assert.ok((await page.textContent('.book-info')).includes('Eliza Hollow'), 'the introduction is shown before starting');
        await page.click('text=Start Adventure');
        await page.waitForSelector('.section-text');

        const labels = await page.$$eval('[data-opt]', bs => bs.map(b => b.textContent.trim()));
        assert.deepEqual(labels, ['Enter the Weeping Willow tavern', 'Investigate the cemetery', "Visit Mayor Hollow's manor"], 'options carry their real labels');
        assert.ok(!(await page.textContent('.section-text')).includes('Turn to'), 'no "Turn to N" in the text');

        await page.click('[data-opt="to-45"]');
        await page.waitForTimeout(100);
        assert.equal((await page.$$('[data-opt]')).length, 27, 'a 27-option menu is shown as buttons');

        // a pit trap: options are hidden until the player rolls; the dice panel waits for the player
        await page.evaluate(() => game.goTo(245));
        await page.waitForSelector('.roll-box');
        assert.equal((await page.$$('[data-opt]')).length, 0, 'options wait for the roll');
        await page.click('.roll-box button');
        await page.waitForSelector('.pending-roll');
        await page.click('.pending-roll button');
        await page.waitForTimeout(100);
        assert.ok((await page.$$eval('.notice p', ps => ps.map(p => p.textContent))).some(t => /You rolled \d/.test(t)), 'the result is shown');
        assert.equal(await page.$('.pending-roll'), null, 'the dice panel is gone once rolled');

        // a fight by hand: a round asks for your roll and the enemy's
        await page.evaluate(() => game.goTo(30));
        await page.click('text=Fight!');
        await page.click('text=Fight Round');
        const asks = [];
        for (let i = 0; i < 2; i++) { asks.push((await page.textContent('.pending-roll strong')).trim()); await page.click('.pending-roll button'); await page.waitForTimeout(60); }
        assert.deepEqual(asks, ['Your attack', "SKELETON WARRIOR's attack"]);

        // auto-roll: the rest of the fight needs no dice clicks; Continue moves on
        await page.check('.auto-roll input');
        await page.evaluate(() => { game.stats.skill = 30; });
        for (let i = 0; i < 40 && await page.$('text=Fight Round'); i++) { await page.click('text=Fight Round'); await page.waitForTimeout(30); }
        await page.click('text=Continue');
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => game.currentSection), 155);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ff_prefs')).autoRoll), true, 'the auto-roll choice is remembered');

        // the old format still loads (upgraded in memory)
        await page.evaluate(() => ui.loadBook(null));
        await page.click('text=Load Example Adventure');
        await page.waitForSelector('text=Start Adventure');
        await page.click('text=Start Adventure');
        await page.waitForSelector('.section-text');
        assert.ok((await page.$$('[data-opt]')).length > 0, 'an old-format book plays');

        assert.deepEqual(errors, [], 'no JavaScript errors');
        console.log('ui smoke test: ok');
    } catch (e) {
        console.error('ui smoke test FAILED:', e.message, errors);
        process.exitCode = 1;
    } finally {
        await browser.close();
        server.close();
    }
})();
