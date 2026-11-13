# Migration review: CURSE_OF_HOLLOWS_END.json -> CURSE_OF_HOLLOWS_END.v2.json

396 sections, 788 options, 34 labelled just 'Continue'.

Items for a human to check. The conversion changed no game logic (every destination, condition, effect, roll and combat is identical to v1); the only flags dropped are 'ending' marks on sections that still lead somewhere (listed below). Run check_v2_equivalence.py to prove it.

## Found while reading the text: logic that v1 already lacked (NOT changed by the migration): 0


## Sections that mix 'Continue' with other labels (check they read clearly): 0


## Labels longer than 60 characters: 6

- 45 | to-18 | A spectral hand passes through your chest (−3 STAMINA, −1 SKILL for good)
- 45 | to-55 | A Shadow drains your strength (−1 SKILL, −2 STAMINA for good)
- 155 | to-236 | Go to the left passage (toward candlelight and ritual chambers)
- 234 | to-116 | A Shadow drains your life force (−1 SKILL, −2 maximum STAMINA for good)
- 355 | to-163 | A Shadow saps your vitality (−1 SKILL, −1 maximum STAMINA for good)
- 395 | to-362 | Face the Widow without the full binding (the incomplete confrontation)

## Options not referenced in the text (listed under it): combat continuations, rewritten choices: 49

- 29 | to-378 | Keep searching for the Silver Key
- 35 | to-45-2 | Take the vial with you to drink later
- 35 | to-45-3 | Leave the vial behind and continue
- 45 | to-194 | Behind the bar: a ledger (and a fight)
- 111 | to-183 | A sheer cliff edge
- 111 | to-170 | Find Lydia, chained to a pillar
- 111 | to-181 | The bridge snaps beneath you
- 111 | to-186 | Sneak past praying cultists
- 150 | to-155 | Edge around the trap and continue
- 155 | to-97 | Visit the healing shrine
- 155 | to-138 | A passage strung with tripwires
- 155 | to-150 | A floor that looks solid (danger)
- 155 | to-160 | Cross a crumbling bridge
- 155 | to-169 | A Ghoul leaps from the shadows (fight)
- 155 | to-197 | A Skeleton Warrior attacks (fight)
- 155 | to-153 | Hide from approaching cultists
- 155 | to-157 | A heavily locked door
- 155 | to-187 | A trapped door
- 180 | to-161 | Search a dead cultist: a note
- 180 | to-193 | Search a fallen cultist: a medallion
- 221 | to-167 | The floor gives way: a spike pit
- 221 | to-199 | The floor gives way beneath you
- 245 | to-155 | Edge around the collapsed floor and continue
- 275 | to-301 | Continue
- 298 | to-148 | A Ghoul's paralysing claws
- 301 | to-137 | Climb a slippery shaft upward
- 301 | to-147 | A locked chest
- 301 | to-168 | Pick a lock to a staircase up
- 335 | to-179 | A Phantom Servant appears (fight)
- 355 | to-140 | A Shadow drains your essence (−1 SKILL for good)
- 355 | to-163 | A Shadow saps your vitality (−1 SKILL, −1 maximum STAMINA for good)
- 355 | to-185 | A Shadow in the dark (fight)
- 355 | to-381 | A Phantom Servant blocks the final passage (fight)
- 355 | to-383 | A Skeleton Warrior guards the way (fight)
- 355 | to-385 | A Ghoul, the last guardian (fight)
- 355 | to-387 | A Shadow attacks (fight)
- 355 | to-389 | A Phantom Servant materializes (fight)
- 377 | to-355 | Return to the stairs
- 380 | to-355 | Return to the stairs
- 381 | to-355 | Back to the upper hall
- 382 | to-388 | Return to your preparations
- 383 | to-355 | Back to the upper hall
- 384 | to-388 | Return to your preparations
- 385 | to-355 | Back to the upper hall
- 386 | to-388 | Return to your preparations
- 387 | to-355 | Back to the upper hall
- 389 | to-355 | Back to the upper hall
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

## 'Turn to N' fragments and stray stat blocks removed: 107

- 5 | Turn to 221 ...
- 5 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 15 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 25 | 6 stat-block line(s) of the fight (the combat panel shows them)
- 30 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 32 | Turn to 221 ...
- 32 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 36 | 1 stat-block line(s) of the fight (the combat panel shows them)
- 44 | Turn to 44 ...
- 44 | Turn to 234 ...
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
- 309 | 1 stat-block line(s) of the fight (the combat panel shows them)
- ... and 47 more

## Items defined differently in different sections (add them to the overrides file's "items"): 0


## Items taken from the sections' own definitions (not in the overrides file's "items"): 0


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
