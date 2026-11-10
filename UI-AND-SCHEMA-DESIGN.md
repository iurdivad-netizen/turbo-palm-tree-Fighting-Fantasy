# Reader redesign: decisions, book format v2, build order

Status: **all four steps are done** (book format v2; the engine split from the screen; the new reader; author docs and sidecar files).

## Why

Playtest feedback: the reader is hard to play. Three complaints, one cause:

1. Option text from the book is separate from the buttons, so the player scrolls back and forth.
2. There is no dice for the player to roll.
3. The interface should be reusable for future books.

Measured on `CURSE_OF_HOLLOWS_END.json`: 93% of the 767 buttons are labelled just "Turn to 245" (the real label is only in the prose), and 388 of 395 sections repeat their "Turn to N" lines inside the text. Section 388 has 36 options, 234 has 35, 341 has 34.

## Decisions (from the author)

| Question | Decision |
|---|---|
| Where do option buttons go? | **Inline within the text**, at the point the sentence offers the choice. |
| Dice | **Optional**: the player can roll the dice on screen, with an **auto-roll** mode. |
| Book contract | A **fixed JSON schema**; every future book is converted to it and validated against it. |

## Principles

- **One source of truth for each option label.** It lives on the option, never also in the prose.
- **The schema is the contract between three things:** the converter (produces it), the engine (plays it), the UI (shows it). The UI never reads raw prose for logic.
- **The engine stays headless.** `simulate_playthroughs.js` already runs the real game logic with no UI; keep that working at every step. It is the regression test for the whole redesign.
- **Every random event goes through one roll request**, so the UI can show a die and wait, or auto-resolve.

## Book format v2 (draft)

```jsonc
{
  "schemaVersion": 2,
  "id": "curse-of-hollows-end", "title": "...", "author": "...", "description": "...",
  "startingSection": 1,
  "initialStats": { "skill": 8, "stamina": 20, "luck": 9 },
  "startingItems": [ /* item objects */ ],
  "sections": [
    {
      "id": 155,
      "title": "The junction",                       // optional
      "text": "You reach a junction. {{roll:encounter}} Then you may follow {{opt:left}}, {{opt:center}} or {{opt:right}}.",
      "options": [
        { "id": "left",   "label": "the left passage toward the candlelight", "target": 236 },
        { "id": "center", "label": "the centre passage toward the manor",     "target": 258,
          "conditions": { "requiresItem": "brass-key" } }
      ],
      "roll": { /* dice table or Luck test, see below */ },
      "combat": { /* as today */ },
      "effects": { "modifyStats": {}, "permanentStats": {}, "maxStats": {}, "addItems": [], "removeItems": [] },
      "ending": { "type": "victory|defeat|neutral" }  // only on real endings
    }
  ]
}
```

- **Inline references:** `{{opt:ID}}` renders that option's button in the sentence; `{{roll:ID}}` renders the dice. An option not referenced in the text is shown in a short list under the text (a fallback, so nothing is ever hidden).
- **Labels are written to read inside a sentence** ("the left passage"), and a button shows the label, not "Turn to N".
- **Rolls** keep today's semantics (`once`, `gatesChoices` becomes "options appear after the roll", outcomes with effects, nested Luck tests), moved under one `roll` object with `kind: "luck" | "dice"`.
- **Endings** are explicit (`ending`), never inferred from words in the prose (that is how nine mid-game sections got a wrong "Victory!" flag).
- **Everything else is unchanged:** items, conditions (`requiresItem`, `requiresNoItem`, `requiresMissingAny`), combat rules, stat effects. Same meaning, so the simulator and the tests carry over.

## Dice

- All randomness (Luck test, dice table, each combat round) calls one `requestRoll({ dice: "1d6" | "2d6", reason })`.
- **UI mode:** shows a die, the player taps to roll, the result is shown, then the game continues.
- **Auto-roll:** resolves instantly (a setting, saved with the player's preferences). The simulator always uses this path, so it stays synchronous and fast.
- Combat rounds should have a "roll round" button and an "auto-fight" toggle so long fights do not need 20 taps.
- Accessibility: roll result is always printed as text, not only animated.

## Step 1 result (done)

| File | What it is |
|---|---|
| `book.schema.json` | The v2 contract (JSON Schema 2020-12). Strict: unknown keys are errors, so typos are caught. |
| `migrate_to_v2.py` | v1 -> v2 converter. Recovers each option's label from its own section's "Turn to N to ..." lines, replaces those lines with `{{opt:ID}}`, moves rolls under `roll`, groups effects under `effects`, makes endings explicit, writes `migration-review.md`. |
| `validate_adventure.py` | Now understands v2: the schema (needs `pip install jsonschema`, otherwise skipped with a note) plus cross-reference checks. |
| `check_v2_equivalence.py` | Proves a migration changed no game logic (395 of 395 sections identical). |
| `CURSE_OF_HOLLOWS_END.v2.json` | The converted book. |
| `migration-review.md` | What a human should check. |

Acceptance, as agreed: every option has a real label (the validator rejects "Turn to N" and duplicate labels in a section), no "Turn to N" is left in any text, the validator passes, and no game logic changed. The validator was tested against 12 deliberately broken copies and caught all 12.

Numbers on the Curse of Hollow's End: 767 options; 87% are referenced inline in the text (the rest, mostly combat continuations, are listed under it); average text per section 602 -> 504 characters; 277 options are labelled just "Continue" (single exits at the end of a sentence).

### How v2 differs from the draft above

- Rolls: `{{roll}}` (one per section, no id) instead of `{{roll:ID}}`. Luck roll = `{kind:"luck", success:{...}, failure:{...}}`; dice roll = `{kind:"dice", dice:"1d6", outcomes:[{min,max,text,target,effects,luck:{success,failure}}]}`. `gatesChoices` is now `gatesOptions`.
- Menu lines stay where the book put them, one `{{opt:ID}}` per line, consecutive lines form one list. Labels are sentence-case ("Search the cellar", "Go to the ballroom (ghostly dancers)").
- `combat[].victoryText` is new: the "If you win: ..." narrative, previously shown before the fight.
- Endings: exactly 4, 39, 65 (instant death), 400 (victory) and 999 (defeat). The 9 mid-game sections that v1 wrongly flagged as endings (14, 24, 29, 36, 38, 41, 56, 152, 297) no longer are.
- `TEXT_OVERRIDES` (1 section) and `LABEL_OVERRIDES` (43 labels) in `migrate_to_v2.py` are hand-written and specific to this book. They now live in `CURSE_OF_HOLLOWS_END.overrides.json` (step 4).

### Follow-ups found while reading the text (logic v1 already lacked, not changed)

- Sections 54 and 164 ("Do you have ROPE?") and 24 ("Do you have the Mayor's Ledger?") offer both branches to everyone: the choices carry no item conditions.
- Section 180's menu of 19 places is still skipped by the fight's victory jump (sections 260-280 unreachable).

## Step 2 result (done)

| File | What it is |
|---|---|
| `engine.js` | The rules, with no screen, no timers and no `alert()`. Plays v2 books (`Engine.upgradeBook()` upgrades old ones in memory). Works in the browser (`<script src="engine.js">` gives a global `Engine`) and in Node (`require`). |
| `index.html` | Now only the screen: it renders the engine's state and sends it what the player does. 2,890 -> about 2,100 lines; the file-import code (JSON, TXT, PDF) is unchanged and feeds `ui.loadBook()`. |
| `simulate_playthroughs.js` | Runs on the engine directly in Node (no browser needed). |
| `tests/engine.test.js` | 51 tests of the rules (small hand-made books with scripted dice, plus scenarios on the real book). |
| `tests/simulation.test.js` | The seeded 3,000-game simulation must reproduce the recorded results exactly (SHA-256 of every recorded field). |
| `tests/ui-smoke.js` | Drives the real page in Playwright (serves the repo itself). |

Run: `node --test` (about 25 seconds, the simulation test is most of it) and `node tests/ui-smoke.js` (needs Playwright).

**Acceptance, as agreed:** the simulation gives identical results. The engine reproduced the results recorded from the old in-browser logic in *every* field of all 3,000 games (260 KB), on both the original book (upgraded in memory) and the converted v2 book. That also confirms the v1 -> v2 migration changed no behaviour. `tests/simulation-baseline.json` keeps that fingerprint; refresh it with `tests/make-baseline.js` only after a deliberate change to the rules or the data.

### The engine API

```js
const game = Engine.create({ book, rng, autoRoll, autoAdvance, onEvent });
game.start();  game.reset();
game.optionStates()          // [{ option, enabled }]: what the player can see (locked shown disabled, "if you lack X" hidden)
game.chooseOption(id);  game.doRoll();  game.startCombat();  game.fightRound();  game.flee();
game.useItem(uid);  game.dropItem(uid);  game.advanceNow();
game.pendingRoll             // null, or { dice: '1d6'|'2d6', reason, label, who? } while waiting for the player's die
game.resolveRoll([3, 5]);    // the player's dice (values optional; the engine rolls if they are missing or invalid)
game.serialize();  game.restore(data);
// events: { type: 'message', text } (replaces alert), { type: 'roll-needed', request }, { type: 'change' }
```

- **Dice are pauses.** Every action that rolls (Luck test, dice table, each combat round, flee, revive, wound tests) is a generator that yields a roll request; a small driver resolves it at once (`autoRoll: true`, what the simulator uses) or parks it until `resolveRoll()`. A combat round asks for two rolls: yours, then the enemy's.
- **Navigation after a fight or flee** happens at once with `autoAdvance: true` (simulator) or waits for `advanceNow()` (the screen shows the log and a Continue button).
- **Dice order is part of the contract.** Dice are drawn in the same order as the old code, which is what makes the seeded results identical.

### What the screen does now (a first pass, not the redesign)

- Menu lines are buttons in the place the book listed them; `{{opt:ID}}` in a sentence is an inline button; options the text does not mention are listed under it; `{{roll}}` is where the dice box appears. Options of a rolled section wait for the roll.
- **Dice are player-rolled by default**, with an "Auto-roll dice" checkbox (remembered). A combat round is two clicks in that mode; "auto-fight" is a step 3 item.
- Results ("Lucky! (rolled 5) ...") appear in a notice box instead of a blocking `alert()`. Fights end with a Continue button instead of a timed jump.
- Not tested yet: layout on a phone (only a desktop screenshot was checked); keyboard use.

### Left for step 3

Done: see "Step 3 result".

## Step 3 result (done)

The page is now four small files and no build step: `index.html` (shell), `reader.css`, `reader.js` (the screen), `importers.js` (JSON/TXT/PDF import, moved unchanged), plus `engine.js`.

**Reading.** A serif story column (about 42 characters wide); menu lines are tiles in a grid (the 36-option menu at 388 is 18 rows on a desktop, not 36), options in a sentence are pills; locked options say why. Text size A-/A+ (remembered). Light and dark themes follow the system. The engine's converter now also strips the stat-block lines ("SKILL 6 STAMINA 4", enemy name headers) from fight sections, because the fight panel shows them.

**Dice.** A dice tray shows what is being asked ("Test your Luck - roll two dice"), then the thrown dice as drawn faces with the total; they tumble unless the system asks for reduced motion. Player-rolled by default, an "Auto-roll dice" checkbox (remembered), and the R key rolls. In a fight, each round shows both fighters with STAMINA bars; "Auto-fight" plays rounds by itself (it stops and hands back the decision when you may flee at low STAMINA, and gives the dice choice back afterwards). The engine now emits a `rolled` event with the dice values.

**Saving.** Autosave on every move, shown as "Continue" on the book card; manual saves (Save) are listed with Load and Delete.

**Phones.** A pinned strip shows SKILL, STAMINA and LUCK; the pack is a drawer opened from the strip. No sideways scrolling, 44 px touch targets.

**Accessibility.** The accessibility checker axe-core (WCAG 2.0/2.1 A and AA plus best practices) reports no violations on the first screen, the book card, a section, a 36-option menu, a roll being asked for, a rolled result, a fight, and the phone's pack drawer, in light and dark, at desktop and phone size (34 audits). It found and I fixed: missing landmarks and skip link, and a 2.4:1 contrast on a button in dark mode. Also: focus moves to the section heading on every new page and to the Roll button when dice are asked for; the fight log and results are announced politely; stat bars are `progressbar`s.

**Tests.** `node tests/ui-smoke.js` drives all of this in a real browser, including an axe audit if `axe-core` is installed. Run it on its own (the simulation test is memory-hungry).

**Not done / not verified.** Checked in an emulated phone only, not on a real device or with a screen reader. No dice sound. Saves are per browser (localStorage). Importing TXT/PDF still guesses structure and produces old-format books; use `migrate_to_v2.py` for a proper conversion.

## Step 4 result (done)

* **`AUTHORING.md`** is the one guide for new books (fast path, section/option/roll/combat reference, sidecars, checks). The v1-era guides carry a "legacy" banner; `README.md` starts with a "Start here" block.
* **`templates/minimal-book.v2.json`**: a five-section book that validates and plays (bots finish it).
* **Sidecar `<book>.overrides.json`** (labels, text replacements, notes) is read by `migrate_to_v2.py`; the Curse v2 file regenerates byte-identical from it. A second book (`example-adventure.json`, no overrides) converts and validates with no converter changes.
* **Simulator generalized**: endings come from each section's `ending`; goals, the final section and the avoid list come from optional `<book>.sim.json`. Guard: the Curse 3,000-game fingerprint is unchanged (`tests/simulation.test.js`).
* **Tests**: `tests/docs.test.js` keeps the guide true (template validates, sidecars point at real sections, named files exist). `package.json` adds `npm test` and `npm run test:ui`.
* **Not done**: the importers for TXT/PDF still produce v1 books (upgraded in memory); `make_simulation_report.py` is still written around the Curse book.

## Build order

1. **Schema + converter + validator (v2). DONE (see above).** Write `book.schema.json`; extend `validate_adventure.py` to check it; write a v1 to v2 migration that takes labels from `CURSE_OF_HOLLOWS_END_FORMATTED.txt` (its `{choice: N | label}` markers and "Turn to N for ..." prose) and strips the option lines from the text. Acceptance: every option has a real label, no `Turn to N` left in any section text, validator passes.
2. **Engine/UI split. DONE (see "Step 2 result").** Move game logic out of `index.html` into an engine module with the `requestRoll` hook; keep a thin adapter so the simulator runs unchanged. Acceptance: all browser tests and the 3,000-game simulation give the same results.
3. **New reader UI. DONE (see "Step 3 result").** Inline buttons, dice and auto-roll, readable layout on desktop and phone, saved preferences. Acceptance: a long section (388, 234) reads top to bottom with no scrolling back; phone width works.
4. **Docs for authors. DONE (see "Step 4 result").** How to write or convert a book, validate it and simulate it.

## Open questions (for later)

- How to convert a book when the source has no option labels at all? (Probably: the converter proposes labels, a human reviews them.)
- Markdown in `text` (bold, paragraphs)? Suggest a tiny subset: paragraphs and emphasis only.
- Save format: version it with `schemaVersion`.
- Should the UI be a single file (as now) or a small build? Single file is easier to host; decide in step 2.

## Known data issues carried over (not part of this redesign)

Tracked in `simulation-report.html`: section 22 (needs a carry-over penalty), 362 has no real ending, nine mid-game sections carry a wrong ending flag, sections 260-280 are unreachable (section 180 menu skipped), some Luck-test failures lead to rewards, LUCK supply and the Widow's final fight (see report).
