# Migration review: example-adventure.json -> example-adventure.v2.json

24 sections, 28 options, 0 labelled just 'Continue'.

Items for a human to check. The conversion changed no game logic (every destination, condition, effect, roll and combat is identical to v1); the only flags dropped are 'ending' marks on sections that still lead somewhere (listed below). Run check_v2_equivalence.py to prove it.

## Found while reading the text: logic that v1 already lacked (NOT changed by the migration): 0


## Sections that mix 'Continue' with other labels (check they read clearly): 0


## Labels longer than 60 characters: 0


## Options not referenced in the text (listed under it): combat continuations, rewritten choices: 28

- 1 | to-2 | Take the left path (the well-worn route)
- 1 | to-3 | Take the right path (through the cobwebs)
- 1 | to-4 | Search around the entrance before proceeding
- 3 | to-6 | Open the chest
- 3 | to-7 | Leave the chest and continue
- 4 | to-2 | Take the left path
- 4 | to-3 | Take the right path
- 5 | to-8 | Continue toward the light
- 5 | to-10 | Rest and recover (restore 2 STAMINA)
- 6 | to-7 | Continue down the path
- 7 | to-11 | Cross the bridge carefully
- 7 | to-12 | Try to swim across the river
- 7 | to-13 | Search for another way around
- 8 | to-14 | Examine the chest
- 8 | to-15 | Call out to the voice
- 8 | to-16 | Leave immediately
- 10 | to-8 | Continue to the treasure chamber
- 11 | to-8 | Enter the doorway
- 14 | to-18 | Use the rusty key (requires rusty key)
- 14 | to-19 | Try to force the lock (Test your Luck)
- 14 | to-16 | Leave the chest alone
- 17 | to-21 | Explore this new area
- 21 | to-23 | Drink from the pool (might restore health)
- 21 | to-24 | Take the coins and leave
- 22 | to-14 | Try again with the key if you have it
- 22 | to-16 | Give up and retreat
- 23 | to-8 | Search for a way back to the main chambers
- 24 | to-8 | Follow the passage

## Roll prose cut from inside a paragraph (check the text reads well): 2

- 12 | roll trigger inside a paragraph
- 19 | roll trigger inside a paragraph

## Narrative about winning a fight, kept as combat.victoryText: 0


## 'Turn to N' fragments and stray stat blocks removed: 0


## Items defined differently in different sections (add them to the overrides file's "items"): 0


## Items taken from the sections' own definitions (not in the overrides file's "items"): 0


## Sections whose v1 ending flag was dropped (they are not endings): 0

