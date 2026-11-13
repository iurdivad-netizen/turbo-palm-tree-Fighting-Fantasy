# Writing a book for the reader

This is the only guide you need for new books. The older guides (`FORMAT-GUIDE.md`, `ADVENTURE_FORMAT_GUIDE.md`,
`MARKER_SYNTAX_GUIDE.md`, `ADVENTURE-MECHANICS-GUIDE.md`, …) describe the old v1 format and are kept for reference only.

The contract is `book.schema.json` (format v2). The reader and the engine never guess: whatever the schema allows, they play.

## 1. The fast path

1. Copy `templates/minimal-book.v2.json` and edit it (5 sections: choices, a fight, a Luck test, three endings).
2. Check it: `python3 validate_adventure.py my-book.v2.json`
3. Play it: open `index.html`, load your file (or add a button for it).
4. Stress it: `node simulate_playthroughs.js my-book.v2.json 1000` plays 3 × 1000 games with bots and reports
   endings, deadly fights and dead ends.

Already have a v1 book (JSON from the old tools)? Convert it: `python3 migrate_to_v2.py old.json my-book.v2.json my-book.migration-review.md`.
The review lists everything the converter could not decide alone.

## 2. A section

```json
{ "id": 12, "title": "The Bridge",
  "text": "The planks are rotten. You may {{opt:back}} or {{opt:run}}.\n\nSecond paragraph.",
  "options": [ { "id": "back", "label": "turn back", "target": 1 },
               { "id": "run",  "label": "run across", "target": 14, "effects": { "modifyStats": { "stamina": -2 } } } ] }
```

* `text`: paragraphs separated by a blank line. **`{{opt:ID}}` puts that option's button inside the sentence**; options not
  mentioned are listed under the text. `{{roll}}` puts the dice there. Never write "Turn to 14" – the button replaces it.
* `options[]`: `id` (lowercase slug, unique in the section), `label` (3–160 characters; what the button says – never
  "Turn to N"), `target` (a section id), optional `conditions`, `effects`, `once`.
* A section with no exits must have an `ending`: `{ "type": "victory" | "defeat" | "neutral" }`. A section with exits must not.

## 3. Conditions and effects

Conditions (on an option, or on a roll): `requiresItem`, `requiresNoItem` (an id or a list), `requiresMissingAny`,
`requiresMinSkill`, `requiresMinStamina`, `requiresMinLuck`. An option that fails its conditions is shown disabled with the reason.

Effects (on an option, a section, a roll outcome, a fight victory or an item's `onUse`):
`modifyStats` (`{"stamina": -2}`; a value of `"max"` restores to the Initial score), `permanentStats` (changes the current
score **and** the Initial one), `maxStats` (only the Initial maximum), `addItems`, `removeItems`, `nextFightSkill` (`-1`: the next fight starts at -1 SKILL, for a wound that has not healed).
Section effects apply the first time the section is entered in a game.

`gold` (`{"gold": 30}`: gold is a number, not an item), `nextFightSkill` (`-1`: the next fight starts at -1 SKILL, for a wound
that has not healed; `+2`: a bonus, for a potion).

## 3b. Items: define each one once

Put every item in the book's `items` catalogue, **one definition per id**. Sections and `startingItems` then only name the id:

```json
"items": { "healing-potion": { "name": "Healing Potion", "type": "potion", "restore": "+4 stamina" },
           "silver-dagger":  { "name": "Silver Dagger",  "type": "weapon", "bonus": "+1 skill", "properties": ["silver"] } },
"startingItems": ["sword", { "id": "rations", "qty": 10 }]
...
"effects": { "gold": 30, "addItems": [{ "id": "healing-potion", "qty": 2 }, "silver-dagger"] }
```

What the app does with an item depends on what it says it is. This is the whole list; anything else is a keepsake:

| You write | The app does |
| --- | --- |
| `"type": "weapon"` with `bonus` (`"+1 skill"`) and `properties` (`magical`, `silver`, `crushing`) | The player can hold it; in a fight the screen shows what is in hand and what it does against *this* enemy. On automatic the best weapon for the enemy is used. |
| `"type": "armor"` with `bonus` (`"+1 defense"`) | One piece is worn (automatic: the best); enemy hits do that much less damage. Bonuses never add up. |
| `"restore": "+4 stamina"` (or luck, skill) | A **Use** button; the item is spent. |
| `"onUse": { ...effects }` | A **Use** button that applies any effects (e.g. `{"nextFightSkill": 2}`: +2 SKILL for one fight). |
| a `key`/`other` item named in an option's `conditions` | Shown under **Story items**; the story asks for it at the right moment. |
| anything else | Shown under **Keepsakes** with its description. It has no effect on the rules, so say so in the description or do not give it. |

Rules of thumb for writing a book that works: never give a potion without `restore` or `onUse`; do not hand out an item by
entering a section that only *mentions* it ("Do you have the BRASS KEY?" is a condition, not a pickup); give different things
different ids (a torn map and a manor map are two ids, not "map" twice); say quantities with `qty`, not by repeating the grant;
use `unique: true` for things that exist once. `validate_adventure.py` checks all of this and lists the keepsakes.

## 4. Dice

One `roll` per section, with `{{roll}}` where it belongs in the text.

* Luck test: `"roll": { "kind": "luck", "success": { "text": "…", "target": 4 }, "failure": { "text": "…", "target": 5, "effects": {…} } }`.
  An outcome with no `target` stays in the section.
* Dice table: `"roll": { "kind": "dice", "dice": "1d6", "outcomes": [ { "min": 1, "max": 3, "target": 7 }, { "min": 4, "max": 6, "target": 8 } ] }`.
  The outcomes must cover every possible total (the validator checks); an outcome may carry its own `luck` test.
* Flags: `once` (only the first visit), `gatesOptions` (options appear after the roll), `conditions` (the roll is only offered when they hold).

The player chooses: roll the dice by hand (button or **R**) or switch on auto-roll.

## 5. Fights

```json
"combat": { "enemyName": "GOBLIN", "enemySkill": 6, "enemyStamina": 5,
            "onVictorySection": 4, "onDefeatSection": 5, "victoryText": "The goblin falls." }
```

An array fights several enemies one after another. Optional: `canFlee` with `fleeSection` / `fleeMaxStamina` / `fleeTestLuck`,
`onWound`, `onStart`, `onVictoryEffects`, `reviveOn`, `effectiveWeapons`, `normalWeaponDamage`, `weakTo` – see the `enemy`
definition in the schema; the Curse book (`CURSE_OF_HOLLOWS_END.v2.json`) uses all of them.

## 6. Hand-written fixes: the sidecar

Do not edit a generated v2 file by hand if you will convert again. Put your corrections in `<book>.overrides.json` and re-run
the converter; the file is read automatically (or pass `--overrides`):

```json
{ "labels": { "24": { "to-127": "Search the ledger" } },
  "text":   { "35": [ { "replace": "old words", "with": "new words" } ] },
  "notes":  { "54": "Needs a condition on the key once the author decides." } }
```

`labels` rewrites an option's label (section → option id → label), `text` does exact replacements in a section's text,
`notes` are carried into the migration review. The review's "Labels still to write" list is your to-do list.

## 7. What the simulator needs to know: `<book>.sim.json` (optional)

Without it, bots just look for a victory ending. With it they play your book on purpose:

```json
{ "goalItems": ["silver-key"], "wantMagicalWeapon": false, "finalSection": 395,
  "avoidUntilReady": [395], "terminalLabels": { "neutral": "instant-death" },
  "analytics": { "gateSection": 395, "finalFightSection": 394, "keyItem": "silver-key" } }
```

See `CURSE_OF_HOLLOWS_END.sim.json`. Endings come from each section's `ending`, never from section numbers.

## 8. Checks before you ship

| Check | Command |
| --- | --- |
| Schema and cross-references (dead ends, unreachable targets, generic labels, dice coverage, items that can never be found) | `python3 validate_adventure.py book.v2.json` |
| Rules engine tests | `node --test` |
| Playable by bots, endings reachable | `node simulate_playthroughs.js book.v2.json 1000` |
| The page in a real browser (needs `npm i`) | `npm run test:ui` – run it on its own, not together with `node --test` |
