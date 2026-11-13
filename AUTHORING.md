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
| `"saveBonus": {"amount": 1, "versus": "undead"}` | A **charm**, carried not worn. A saving throw (Test your Luck) succeeds on a roll of at most LUCK + amount. The best charm that applies counts; charms do not add up. With `versus`, it only counts in a fight against an enemy whose `tags` include that word (`"tags": ["undead"]` on the enemy); without it, it counts at traps too. The fight log says when a charm helped. |
| `"onUse": {"fightSave": 2}` | A **Use** button: +2 to saving throws for one whole fight (before or during it). |
| `"stealthBonus": 2` on an item, and `"stealth": true` on a Luck test (`"roll": {"kind": "luck", "stealth": true, ...}`) | The sneaking or hiding test gets +2 (the best stealth item counts). Mark every "sneak past", "hide" or "don't be noticed" test with `stealth: true`. |
| `"onUse": {"invisible": 5}` | A **Use** button: for that many moves (the current section counts) stealth tests pass with no roll and no LUCK spent, the player can always slip away from a fight, and their first blow gets +2 and ends it. |
| `"reveals": {"tag": "trap", "areas": ["catacombs"]}` on an item | A **map**. Give sections `"tags": ["trap"]` and an `"area"`; the options that lead to a tagged section in a covered area are marked ⚠ while the player carries the map. |
| `"text": "..."` on an item | A **Read** button that opens the text (a diary, a letter, a scroll). Works on any item, also on story items. |
| `"countsAs": ["brass-key", "iron-key"]` | A skeleton key: it satisfies conditions that ask for those ids (and is spent in their place). |
| a roll with `"tags": ["binding"]` and a charm with `saveBonus.versus: "binding"` | A ring or charm that helps one kind of test, not one kind of enemy. |
| `"type": "treasure"` | Listed under **Valuables**. Say in the description that its worth is already in the gold you were given. |
| a `key`/`other` item named in an option's `conditions` | Shown under **Story items**; the story asks for it at the right moment. |
| anything else | Shown under **Keepsakes** with its description. It has no effect on the rules, so say so in the description or do not give it. |

Rules of thumb for writing a book that works: never give a potion without `restore` or `onUse`; do not hand out an item by
entering a section that only *mentions* it ("Do you have the BRASS KEY?" is a condition, not a pickup); give different things
different ids (a torn map and a manor map are two ids, not "map" twice); say quantities with `qty`, not by repeating the grant;
use `unique: true` for things that exist once. `validate_adventure.py` checks all of this and lists the keepsakes.

## 3c. Optional Fighting Fantasy rules

A book can declare the classic rules it is written for, and the player can switch each one on or off on the book's page before starting (the book's own choice is the default; all are off unless chosen):

```json
"rules": { "luckInCombat": true, "randomStats": true, "eatOnlyBetweenFights": true, "packLimit": 8 }
```

| Rule | What the app does |
| --- | --- |
| `luckInCombat` | After a wound, in either direction, the player is asked whether to Test their Luck. Their blow: lucky +2 damage, unlucky 1 less. Its blow: lucky 1 less damage, unlucky 1 more. The test costs 1 LUCK like any other (charms help) and is made *before* the wound is applied, so it can save a life or finish an enemy. Auto-fight never asks. |
| `randomStats` | SKILL 1d6+6, STAMINA 2d6+12, LUCK 1d6+6 are rolled when the game starts; `initialStats` is then only a guide. |
| `eatOnlyBetweenFights` | Food (`type: food`) cannot be eaten while a fight is on; potions still can. |
| `packLimit` | At most this many items. Food, keys, gold and anything an option asks for (`requiresItem` and the like) never count, so the limit cannot lock the book. A find that does not fit is left lying: the pack shows it with Take (swap for something) and Leave it. The starting kit is never turned away. |

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

### Monster rules

Every field is optional and goes on the enemy (they are all listed in the `enemy` part of `book.schema.json`; the reader tells the player about each before the fight):

| Field | Rule |
| --- | --- |
| `damage: 3` | each of its wounds takes 3 STAMINA instead of 2 (armour takes off its bonus, never below 1); `ignoresArmor: true` skips the armour |
| `attackDice: 3` | it rolls three dice for its attack |
| `strikesFirst: true` | in round 1 you can only parry: a round you win does nothing |
| `tiesWound: true` | it wins a tied round |
| `regenerates: 1` | it recovers that much STAMINA after every round, up to its start |
| `onWound: {...}` | your wounds do more: `skillLoss` (with `luckTest` or `permanent`), `maxStaminaLoss` (the maximum falls for good), `staminaLoss` (poison: extra STAMINA), `luckLoss` |
| `spell: {"roll": "1d6", "on": [5, 6]}` | once per fight, before the first attack, it rolls; on those totals you lose your attack that round |
| `onHurt: {"luckTest": true, "enemyLuck": 7, "attackPenalty": 2}` | wounded but alive, it tests its luck (2d6 at or below `enemyLuck`); if lucky you lose 2 from your next attack only (a shapechanger) |
| `maxRounds: 3, onTimeoutSection: 40` | after that many rounds with nobody fallen the fight ends and the book moves on (collapsing rooms, chases) |
| `together: true` (on every enemy of the group) | they fight at the same time: you choose whom to attack, the others each roll against your attack every round and wound you if they win; a fallen target passes to the next |

Already there before: `effectiveWeapons` and `normalWeaponDamage` (immunities), `weakTo` (a weakness), `reviveOn` (rises again), `onStart` (a wail or a penalty at the start), `tags` (what it is, for charms).

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
| Do the choices make sense? (labels vs where they lead, promised finds, fights, coming back to the menu) | `python3 check_option_coherence.py book.v2.json` |
| See the book as a flowchart from the first section (layers, every option an arrow) | `python3 make_flowchart.py book.v2.json flow.html` |
| See the whole book as a network (hubs, dead-end branches, how the endings are reached) | `python3 make_book_map.py book.v2.json map.html` |
| Playable by bots, endings reachable | `node simulate_playthroughs.js book.v2.json 1000` |
| The page in a real browser (needs `npm i`) | `npm run test:ui` – run it on its own, not together with `node --test` |
