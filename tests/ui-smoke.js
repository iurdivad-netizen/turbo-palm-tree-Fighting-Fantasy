#!/usr/bin/env node
'use strict';
// Drives the real page in a browser: load the converted book, play with the options in the text, roll the dice by hand and
// by keyboard, fight by hand and automatically, save and continue, change the text size, use the phone layout.
// Needs Playwright (npm i playwright). If axe-core is installed (npm i axe-core) an accessibility audit runs as well.
// It serves the repository itself; nothing else has to be running.
// Usage: node tests/ui-smoke.js        (exit code 1 if anything fails)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/plain' });
    res.end(fs.readFileSync(file));
});

let axeSource = null;
try { axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch (e) { /* optional */ }

(async () => {
    await new Promise(r => server.listen(0, r));
    const url = `http://localhost:${server.address().port}/index.html`;
    const browser = await chromium.launch();
    const errors = [];
    const open = async (viewport, colorScheme = 'light') => {
        const ctx = await browser.newContext({ viewport, colorScheme });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/cdnjs.cloudflare.com/**', r => r.abort());          // the PDF library is not needed here
        await page.goto(url);
        return { ctx, page };
    };
    const startBook = async page => {
        await page.click('text=The Curse of Hollow');
        await page.waitForSelector('text=Start Adventure');
        await page.click('text=Start Adventure');
        await page.waitForSelector('.text');
    };
    const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);

    try {
        // ------------------------------------------------------------------ desktop
        const { ctx, page } = await open({ width: 1180, height: 860 });
        await page.click('text=The Curse of Hollow');
        await page.waitForSelector('text=Start Adventure');
        assert.ok((await page.textContent('.intro')).includes('Eliza Hollow'), 'the introduction is shown before starting');
        await page.click('text=Start Adventure');
        await page.waitForSelector('.text');

        const labels = await page.$$eval('[data-opt]', bs => bs.map(b => b.textContent.trim()));
        assert.deepEqual(labels, ['Enter the Weeping Willow tavern', 'Investigate the cemetery', "Visit Mayor Hollow's manor"], 'options carry their real labels');
        assert.ok(!(await page.textContent('.text')).includes('Turn to'), 'no "Turn to N" in the text');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'page-title', 'focus moves to the page heading');

        await page.click('[data-opt="to-45"]');
        await page.waitForTimeout(100);
        assert.equal((await page.$$('[data-opt]')).length, 27, 'a 27-option menu is shown as buttons');
        assert.equal(await page.evaluate(() => scrollY), 0, 'a new section starts at the top');
        assert.ok(await noOverflow(page), 'no horizontal scrolling');

        // a pit trap: options wait for the roll; the dice are asked for; R rolls them
        await page.evaluate(() => game.goTo(245));
        await page.waitForSelector('.roll-box');
        assert.equal((await page.$$('[data-opt]')).length, 0, 'options wait for the roll');
        await page.click('.roll-box .btn');
        await page.waitForSelector('#roll-now');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'roll-now', 'focus goes to the Roll button');
        await page.keyboard.press('r');
        await page.waitForTimeout(100);
        assert.ok((await page.$$eval('.notice p', ps => ps.map(p => p.textContent))).some(t => /You rolled \d/.test(t)), 'the result is shown');
        assert.ok((await page.$$('.tray .die:not(.blank)')).length >= 1, 'the thrown die is shown as a die');
        assert.equal(await page.$('#roll-now'), null, 'the Roll button is gone once rolled');

        // a fight by hand: a round asks for your roll and the enemy's
        await page.evaluate(() => game.goTo(30));
        await page.click('text=Fight!');
        await page.click('text=Fight a round');
        const asks = [];
        for (let i = 0; i < 2; i++) { asks.push((await page.textContent('.rollrow.ask .what')).replace(/Roll (one|two) dice?/, '').trim()); await page.click('#roll-now'); await page.waitForTimeout(60); }
        assert.deepEqual(asks, ['Your attack', "SKELETON WARRIOR's attack"]);

        // auto-fight runs the rest of the fight; Continue moves on
        await page.evaluate(() => { game.stats.skill = 30; });
        await page.click('text=Auto-fight');
        await page.waitForSelector('text=Continue', { timeout: 20000 });
        await page.click('text=Continue');
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => game.currentSection), 155);
        assert.equal(await page.evaluate(() => game.autoRoll), false, 'auto-fight gives the dice choice back afterwards');

        // preferences
        await page.check('.toggle input');
        await page.click('button[aria-label="Larger text"]');
        assert.equal(await page.evaluate(() => document.documentElement.className), 'ts-2');
        const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('ff_prefs')));
        assert.deepEqual(prefs, { autoRoll: true, textSize: 2 }, 'the choices are remembered');

        // save, reload, continue
        await page.click('button:has-text("Save")');
        await page.waitForSelector('text=Game saved.');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ff_saves')).length), 1);
        await page.reload();
        await page.click('text=The Curse of Hollow');
        await page.waitForSelector('text=Saved games');
        assert.ok(await page.$('text=Continue ('), 'the autosave is offered');
        await page.click('text=Continue (');
        await page.waitForSelector('.text');
        assert.equal(await page.evaluate(() => game.currentSection), 155, 'continue puts you back where you were');
        await page.evaluate(() => { game.stats.stamina = 5; });
        await page.evaluate(() => ui.restart());
        await page.click('text=Saved games');
        const loaded = await page.evaluate(() => readSaves()[0].section);
        assert.equal(loaded, 155);
        await page.click('button:has-text("Load")');
        await page.waitForSelector('.text');
        assert.equal(await page.evaluate(() => game.stats.stamina), 20, 'loading a manual save restores it');

        // a second book in the new format plays
        await page.evaluate(() => ui.loadBook(null));
        await page.click('text=Example adventure');
        await page.waitForSelector('text=Start Adventure');
        await page.click('text=Start Adventure');
        await page.waitForSelector('.text');
        assert.ok((await page.$$('[data-opt]')).length > 0, 'the second book plays');

        // the old format still loads (upgraded in memory)
        await page.evaluate(() => ui.loadBook(null));
        await page.evaluate(() => loadBookFile('example-adventure.json'));
        await page.waitForSelector('text=Start Adventure');
        await page.click('text=Start Adventure');
        await page.waitForSelector('.text');
        assert.ok((await page.$$('[data-opt]')).length > 0, 'an old-format book plays');

        if (axeSource) {
            await page.evaluate(() => ui.loadBook(null));
            await page.addScriptTag({ content: axeSource });
            const res = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }));
            assert.deepEqual(res.violations.map(v => v.id), [], 'no accessibility violations on the first screen');
        }
        await ctx.close();

        // ------------------------------------------------------------------ phone
        const phone = await open({ width: 390, height: 780 });
        const pp = phone.page;
        await startBook(pp);
        assert.ok(await noOverflow(pp), 'the phone layout does not scroll sideways');
        assert.ok(await pp.isVisible('.statstrip'), 'the stats stay in view as a strip');
        assert.ok(await pp.evaluate(() => document.querySelector('.side').getBoundingClientRect().top >= innerHeight), 'the pack drawer starts closed (below the screen)');
        await pp.click('text=Pack');
        await pp.waitForTimeout(350);
        assert.ok(await pp.evaluate(() => document.querySelector('.side').getBoundingClientRect().top < innerHeight - 100), 'the pack opens as a drawer');
        assert.ok(await pp.isVisible('text=Rations'), 'the pack is readable');
        await pp.click('.closer');
        await pp.waitForTimeout(350);
        await pp.evaluate(() => game.goTo(388));
        await pp.waitForTimeout(100);
        assert.ok(await noOverflow(pp), 'a 36-option menu fits a phone');
        const w = await pp.$$eval('.opt', bs => Math.min(...bs.map(b => b.getBoundingClientRect().height)));
        assert.ok(w >= 44, `touch targets are at least 44px tall (smallest ${Math.round(w)}px)`);
        if (axeSource) {
            await pp.addScriptTag({ content: axeSource });
            const res = await pp.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }));
            assert.deepEqual(res.violations.map(v => v.id), [], 'no accessibility violations on a phone');
        }
        await phone.ctx.close();

        assert.deepEqual(errors, [], 'no JavaScript errors');
        console.log(`ui smoke test: ok${axeSource ? ' (with the accessibility audit)' : ' (axe-core not installed: no accessibility audit)'}`);
    } catch (e) {
        console.error('ui smoke test FAILED:', e.message, errors);
        process.exitCode = 1;
    } finally {
        await browser.close();
        server.close();
    }
})();
