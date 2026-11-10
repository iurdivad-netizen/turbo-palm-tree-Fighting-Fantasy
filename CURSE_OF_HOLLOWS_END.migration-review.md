# Migration review: CURSE_OF_HOLLOWS_END.json -> CURSE_OF_HOLLOWS_END.v2.json

395 sections, 767 options, 277 labelled just 'Continue'.

Items for a human to check. The conversion changed no game logic (every destination, condition, effect, roll and combat is identical to v1); the only flags dropped are 'ending' marks on sections that still lead somewhere (listed below). Run check_v2_equivalence.py to prove it.

## Found while reading the text: logic that v1 already lacked (NOT changed by the migration): 3

- 24 | item check (Mayor's Ledger) without conditions: both branches are open to everyone
- 54 | item check (rope) without conditions: a player without rope can still pick the rope branch
- 164 | item check (rope) without conditions

## Sections that mix 'Continue' with other labels (check they read clearly): 0


## Labels longer than 60 characters: 2

- 155 | to-236 | Go to the left passage (toward candlelight and ritual chambers)
- 395 | to-362 | Face the Widow without the full binding (the incomplete confrontation)

## Options not referenced in the text (listed under it): combat continuations, rewritten choices: 18

- 29 | to-378 | Keep searching for the Silver Key
- 35 | to-111-2 | Take the vial with you to drink later
- 35 | to-111-3 | Leave the vial behind and continue
- 150 | to-155 | Edge around the trap and continue
- 245 | to-155 | Edge around the collapsed floor and continue
- 275 | to-301 | Continue
- 377 | to-355 | Return to the stairs
- 380 | to-355 | Return to the stairs
- 381 | to-388 | Return to your preparations
- 382 | to-388 | Return to your preparations
- 383 | to-388 | Return to your preparations
- 384 | to-388 | Return to your preparations
- 385 | to-388 | Return to your preparations
- 386 | to-388 | Return to your preparations
- 387 | to-388 | Return to your preparations
- 389 | to-388 | Return to your preparations
- 390 | to-388 | Return to your preparations
- 395 | to-388 | Back away from the doors and prepare further

## Roll prose cut from inside a paragraph (check the text reads well): 15

- 44 | roll trigger inside a paragraph
- 60 | roll trigger inside a paragraph
- 79 | roll trigger inside a paragraph
- 87 | roll trigger inside a paragraph
- 89 | roll trigger inside a paragraph
- 93 | roll trigger inside a paragraph
- 103 | roll trigger inside a paragraph
- 107 | roll trigger inside a paragraph
- 145 | roll trigger inside a paragraph
- 147 | roll trigger inside a paragraph
- 157 | roll trigger inside a paragraph
- 202 | roll trigger inside a paragraph
- 240 | roll trigger inside a paragraph
- 258 | roll trigger inside a paragraph
- 265 | roll trigger inside a paragraph

## Narrative about winning a fight, kept as combat.victoryText: 3

- 5 | The creature collapses with a final, soundless scream, its mummified form crumbl
- 266 | You surface, gasping and coughing. Lose 2 STAMINA from near-drowning
- 362 | She dissipates with a scream of rage... but you know it's temporary. Without pro

## 'Turn to N' fragments and stray stat blocks removed: 109

- 5 | Turn to 221 ...
- 5 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 15 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 22 | Turn to 298 ...
- 25 | 6 stat-block line(s) of the fight (the combat panel shows them)
- 30 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 32 | Turn to 221 ...
- 32 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 36 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 44 | Turn to 44 ...
- 44 | Turn to 301 ...
- 46 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 62 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 67 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 78 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 83 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 122 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 136 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 144 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 147 | Turn to 44 ...
- 169 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 177 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 179 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 180 | 6 stat-block line(s) of the fight (the combat panel shows them)
- 185 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 194 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 197 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 201 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 204 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 208 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 218 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 222 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 227 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 230 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 233 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 238 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 243 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 246 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 248 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 251 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 254 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 257 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 260 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 263 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 266 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 268 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 271 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 273 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 276 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 278 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 282 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 284 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 286 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 288 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 289 | 7 stat-block line(s) of the fight (the combat panel shows them)
- 291 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 293 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 296 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 302 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 306 | 1 stat-block line(s) of the fight (the combat panel shows them)
- ... and 49 more

## Sections whose v1 ending flag was dropped (they are not endings): 9

- 14
- 24
- 29
- 36
- 38
- 41
- 56
- 152
- 297
