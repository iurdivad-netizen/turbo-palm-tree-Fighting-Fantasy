# Reader redesign: decisions, book format v2, build order

Status: **design agreed, nothing built yet.** Parked so it can be picked up later.

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

## Build order

1. **Schema + converter + validator (v2).** Write `book.schema.json`; extend `validate_adventure.py` to check it; write a v1 to v2 migration that takes labels from `CURSE_OF_HOLLOWS_END_FORMATTED.txt` (its `{choice: N | label}` markers and "Turn to N for ..." prose) and strips the option lines from the text. Acceptance: every option has a real label, no `Turn to N` left in any section text, validator passes.
2. **Engine/UI split.** Move game logic out of `index.html` into an engine module with the `requestRoll` hook; keep a thin adapter so the simulator runs unchanged. Acceptance: all browser tests and the 3,000-game simulation give the same results.
3. **New reader UI.** Inline buttons, dice and auto-roll, readable layout on desktop and phone, saved preferences. Acceptance: a long section (388, 234) reads top to bottom with no scrolling back; phone width works.
4. **Docs for authors:** how to convert a new book to v2 and validate it.

## Open questions (for later)

- How to convert a book when the source has no option labels at all? (Probably: the converter proposes labels, a human reviews them.)
- Markdown in `text` (bold, paragraphs)? Suggest a tiny subset: paragraphs and emphasis only.
- Save format: version it with `schemaVersion`.
- Should the UI be a single file (as now) or a small build? Single file is easier to host; decide in step 2.

## Known data issues carried over (not part of this redesign)

Tracked in `simulation-report.html`: section 22 (needs a carry-over penalty), 362 has no real ending, nine mid-game sections carry a wrong ending flag, sections 260-280 are unreachable (section 180 menu skipped), some Luck-test failures lead to rewards, LUCK supply and the Widow's final fight (see report).
