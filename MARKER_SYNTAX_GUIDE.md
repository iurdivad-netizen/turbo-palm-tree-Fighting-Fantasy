> **Legacy guide (format v1).** For new books use [AUTHORING.md](AUTHORING.md); this file is kept for reference only.

# Adventure Marker Syntax Guide

This guide describes the inline marker syntax for game elements in adventure books. Markers provide precise, reliable detection while maintaining readability in plain text.

## Overview

Markers are **optional** enhancements to natural language. The parser supports both:
- **Inline Markers**: Explicit, reliable detection (recommended)
- **Natural Language**: Pattern-based detection (fallback)

When both exist, markers take precedence.

## Marker Format

All markers use the format: `{type: data}`

```
{marker-type: value | attribute=value | attribute=value}
```

## Combat Markers

### Basic Combat
```
{combat: GOBLIN | skill=6 | stamina=8}
```

### Advanced Combat with Routing
```
{combat: DRAGON | skill=12 | stamina=20 | onVictory=50 | onDefeat=99}
{combat: TROLL | skill=8 | stamina=10 | canFlee=true | fleeSection=15}
```

### Multiple Enemies
```
{combat: GOBLIN WARRIOR | skill=6 | stamina=7}
{combat: GOBLIN SHAMAN | skill=5 | stamina=6}
```

### Attributes
- `skill` (required): Enemy's SKILL stat
- `stamina` (required): Enemy's STAMINA stat
- `onVictory`: Section to go to after winning (optional)
- `onDefeat`: Section to go to if defeated (optional)
- `canFlee`: Whether player can flee (default: false)
- `fleeSection`: Section to go to when fleeing

### Example in Text
```
You enter the chamber. A {combat: STONE GUARDIAN | skill=9 | stamina=12 | onVictory=45}
blocks the doorway!
```

## Item Markers

### Basic Item
```
{item: magic sword}
{item: healing potion | type=potion}
{item: iron shield | type=armor}
```

### Item with Effects
```
{item: sword of flames | type=weapon | bonus=+2 skill}
{item: healing potion | type=potion | restore=+4 stamina}
{item: lucky charm | type=other | bonus=+1 luck}
```

### Treasure Marker
```
{treasure: 50 gold coins}
{treasure: 25 gold coins}
{treasure: ruby gem | type=treasure}
```

### Loot (Alias for Item)
```
{loot: ancient key | type=key}
{loot: mysterious scroll | type=other}
```

### Item Types
- `weapon`: Swords, axes, bows, etc.
- `armor`: Shields, helmets, armor, etc.
- `potion`: Healing potions, elixirs, etc.
- `treasure`: Gold, gems, valuables
- `key`: Keys (special category)
- `other`: Everything else

### Attributes
- `type`: Item category (optional, auto-detected if not specified)
- `bonus`: Stat modifier (e.g., `+2 skill`, `-1 stamina`)
- `restore`: Healing effect (e.g., `+4 stamina`)

### Example in Text
```
You search the chest and find a {item: silver dagger | type=weapon} and
{treasure: 30 gold coins}.
```

## Choice Markers

### Basic Choice
```
{choice: 5}
{choice: 12 | Go north}
{choice: 23 | Fight the monster}
```

### Conditional Choices
```
{choice: 45 | if: skill>7 | Use your strength}
{choice: 46 | if: hasItem=magic-key | Unlock the door}
{choice: 47 | if: luck>5 | Try your luck}
{choice: 48 | if: stamina>10 | Continue fighting}
```

### Attributes
- First value: Target section number (required)
- Second value: Choice text (optional, can be inferred from surrounding text)
- `if`: Condition for the choice to be available

### Condition Formats
- `skill>N`, `skill>=N`, `skill<N`, `skill<=N`
- `stamina>N`, `stamina>=N`, `stamina<N`, `stamina<=N`
- `luck>N`, `luck>=N`, `luck<N`, `luck<=N`
- `hasItem=item-id`: Requires specific item

### Example in Text
```
You reach a fork in the path.

If you go left, {choice: 10}.
If you go right, {choice: 15}.
If you have a rope, {choice: 20 | if: hasItem=rope | Climb down}.
```

## Action Markers

### Stat Modifications
```
{action: +2 stamina}
{action: -1 luck}
{action: +1 skill}
{action: -3 stamina | You are injured}
```

### Test Your Luck
```
{action: testLuck | success=10 | fail=11}
{action: testLuck | success=25 | fail=26 | Test your luck!}
```

### Remove Item
```
{action: removeItem=magic-key}
{action: removeItem=healing-potion | You drink the potion}
```

### Attributes
- Direct stat change: `+N stat` or `-N stat`
- `testLuck`: Initiates a luck test
- `success`: Section for luck test success
- `fail`: Section for luck test failure
- `removeItem`: Remove item from inventory

### Example in Text
```
You drink from the fountain. {action: +3 stamina}

You must test your luck! {action: testLuck | success=50 | fail=51}
```

## Section Markers

### Section Headers (Alternative Formats)
```
## Section 1
## SECTION 1
[1]
(1)
1.
**1**
Section 1:
```

All formats are supported. Markers are not needed for sections.

## Combining Markers

Multiple markers can appear in the same paragraph:

```
You defeat the guard and find {item: rusty key | type=key} and {treasure: 15 gold coins}.
You {action: +1 stamina | feel stronger}.

Will you {choice: 30 | open the door} or {choice: 31 | continue down the hallway}?
```

## Best Practices

### 1. Use Markers for Precision
```
✅ GOOD: You find a {item: healing potion | type=potion | restore=+4 stamina}.
❌ OKAY: You find a healing potion. (relies on pattern detection)
```

### 2. Keep Natural Flow
```
✅ GOOD: A {combat: GOBLIN | skill=6 | stamina=8} jumps out at you!
❌ AWKWARD: {combat: GOBLIN | skill=6 | stamina=8}
```

### 3. Combat Routing
```
✅ GOOD: {combat: TROLL | skill=8 | stamina=12 | onVictory=40 | onDefeat=99}
❌ INCOMPLETE: {combat: TROLL | skill=8 | stamina=12}
(Without routing, default behavior applies)
```

### 4. Descriptive Choice Text
```
✅ GOOD: {choice: 15 | Climb the mountain}
❌ OKAY: {choice: 15}
(Works, but less descriptive)
```

### 5. Conditional Choices
```
✅ GOOD: {choice: 50 | if: skill>8 | Force the door open}
✅ GOOD: {choice: 51 | if: hasItem=lockpick | Pick the lock}
```

## Migration from Pattern Detection

Existing adventures work without changes. To add markers:

### Before (Pattern Detection)
```
You find a magic sword and 50 gold coins.

GOBLIN SKILL 6 STAMINA 8

If you go north, turn to 5.
If you go south, turn to 10.
```

### After (With Markers)
```
You find a {item: magic sword | type=weapon} and {treasure: 50 gold coins}.

A {combat: GOBLIN | skill=6 | stamina=8 | onVictory=5} blocks your path!

If you go north, {choice: 5}.
If you go south, {choice: 10}.
```

## Backwards Compatibility

The system supports **both** natural language and markers:

1. **Markers present**: Parsed first, 100% reliable
2. **No markers**: Falls back to pattern detection
3. **Mixed**: Markers used where present, patterns for the rest

This allows gradual migration and supports both authoring styles.

## Parser Priority

When parsing a section, the system checks in this order:

1. **Inline markers** (highest priority)
2. **Pattern-based detection** (fallback)
3. **Natural language inference** (last resort)

## Examples by Use Case

### Simple Combat Encounter
```
You enter the arena. A {combat: GLADIATOR | skill=8 | stamina=10} challenges you!
```

### Combat with Multiple Enemies
```
You are ambushed!

{combat: BANDIT ARCHER | skill=6 | stamina=7}
{combat: BANDIT SWORDSMAN | skill=7 | stamina=8}
```

### Treasure Room
```
You search the room and discover:
- {treasure: 100 gold coins}
- {item: enchanted amulet | type=other | bonus=+1 luck}
- {item: healing potion | type=potion | restore=+4 stamina}
```

### Complex Choice Section
```
You reach a locked door.

{choice: 20 | if: hasItem=iron-key | Use the iron key}
{choice: 21 | if: skill>7 | Break down the door}
{choice: 22 | if: hasItem=lockpick | Pick the lock}
{choice: 23 | Turn back}
```

### Trap with Luck Test
```
You step on a pressure plate! {action: testLuck | success=30 | fail=31}
```

### Healing Fountain
```
You drink from the magical fountain. {action: +5 stamina} You feel refreshed!
```

## Advanced Features (Future)

Markers enable future features:
- Item durability: `{item: iron sword | durability=10}`
- Timed effects: `{item: speed potion | duration=3 sections}`
- Combat modifiers: `{combat: DRAGON | skill=12 | stamina=20 | fireBreath=true}`
- Quest tracking: `{action: completeQuest=save-the-village}`
- Custom variables: `{action: setVar=door_open | value=true}`

## Summary

**Use markers when you want:**
- ✅ Reliable, consistent parsing
- ✅ Complex combat scenarios
- ✅ Items with specific attributes
- ✅ Conditional choices
- ✅ Precise stat modifications

**Use natural language when you want:**
- ✅ Quick prototyping
- ✅ Simple, straightforward sections
- ✅ Traditional gamebook feel
- ✅ Minimal syntax in source text

The best adventures often use **both**: markers for game mechanics, natural language for narrative flow.
