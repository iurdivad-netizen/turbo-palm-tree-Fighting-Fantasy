# Complete Adventure Mechanics Guide for Standalone HTML App

This guide provides full details on how the standalone HTML app (`index.html`) processes adventures, including item detection, combat, magic weapons/armor, and item usage.

---

## Table of Contents

1. [Adventure File Loading](#adventure-file-loading)
2. [Item Detection System](#item-detection-system)
3. [Combat System](#combat-system)
4. [Magic Weapons & Armor](#magic-weapons--armor)
5. [Item Usage System](#item-usage-system)
6. [Choice Processing & Conditions](#choice-processing--conditions)
7. [Stat Modifications](#stat-modifications)
8. [Marker-Based vs Pattern-Based Detection](#marker-based-vs-pattern-based-detection)

---

## Adventure File Loading

The app supports multiple file formats:

- **JSON**: Direct adventure format (preferred)
- **TXT/MD**: Text-based adventures parsed using patterns
- **PDF**: Extracted text then parsed like TXT/MD

### Required Adventure Structure (JSON)

```json
{
  "id": "unique-adventure-id",
  "title": "Adventure Title",
  "author": "Author Name",
  "description": "Adventure description",
  "startingSection": 1,
  "initialStats": {
    "skill": 7,
    "stamina": 18,
    "luck": 8
  },
  "startingItems": [],
  "sections": [
    {
      "id": 1,
      "title": "Section Title (optional)",
      "text": "Section narrative text",
      "choices": [],
      "combat": null,
      "addItems": [],
      "removeItems": [],
      "modifyStats": {},
      "isEnding": false,
      "endingType": "victory|defeat|neutral"
    }
  ]
}
```

---

## Item Detection System

The app uses **TWO-TIER detection**: marker-based (priority) and pattern-based (fallback).

### Marker-Based Item Detection (Highest Priority)

Use inline markers in section text:

```
{item: Item Name | type=weapon | bonus=+1 skill}
{loot: Healing Potion | type=potion | restore=+4 stamina}
{treasure: 50 Gold Coins | type=treasure}
```

**Marker Format:**
- `{item: NAME | attribute=value | attribute=value}`
- `{loot: NAME | ...}` - same as item
- `{treasure: NAME | ...}` - defaults to treasure type

**Supported Attributes:**
- `type`: weapon, armor, potion, food, treasure, key, other
- `bonus`: +N skill/attack/defense (for weapons/armor)
- `restore`: +N stamina/skill/luck (for consumables)

**Example:**
```json
{
  "id": 10,
  "text": "You find a {item: Ancient Sword | type=weapon | bonus=+2 skill} and a {item: Healing Potion | type=potion | restore=+4 stamina}",
  "addItems": [
    {
      "id": "ancient-sword",
      "name": "Ancient Sword",
      "type": "weapon",
      "bonus": "+2 skill"
    },
    {
      "id": "healing-potion",
      "name": "Healing Potion",
      "type": "potion",
      "restore": "+4 stamina"
    }
  ]
}
```

### Pattern-Based Item Detection (34+ Patterns)

If no markers are used, the app automatically detects items using 34+ patterns:

#### Basic Patterns
1. **Coin quantities**: `50 gold coins`, `25 silver coins`
2. **Quantity + item**: `3 potions`, `5 gems`
3. **Action verbs**: `you find a sword`, `discover a key`, `gain a shield`
4. **Existence phrases**: `there is a potion`, `there are 3 gems`
5. **Observation**: `you see a sword`, `spot a key`, `notice a map`
6. **Container phrases**: `contains a potion`, `holds a key`
7. **Location phrases**: `on the table is a sword`, `in the chest lies a key`
8. **Item location**: `a sword lies on the ground`
9. **Equipment**: `armed with a sword`, `carrying a shield`, `wielding an axe`
10. **Stat modifiers**: `+2 sword`, `shield +3`

#### Magic Item Patterns (8 specialized patterns)
11. **"Of" pattern**: `Sword of Fire`, `Shield of Light`, `Ring of Power`
12. **Elemental prefix**: `Fire Sword`, `Ice Shield`, `Thunder Hammer`
13. **Plus notation**: `Sword +5`, `+3 Shield`, `Dagger +2`
14. **Legendary names**: `Excalibur`, `wielding Mjolnir`, `Stormbringer`
15. **Race/ownership**: `Dragon's Sword`, `Elf's Bow`, `Giant's Shield`
16. **Compound magic**: `Flameblade`, `Dragonbane`, `Frostblade`
17. **Bonus parenthetical**: `Sword of Light (+3 attack)`
18. **Explicit magic**: `Enchanted Sword`, `Magical Shield`, `Blessed Armor`

#### List & Combo Patterns
19. **Have possession**: `you have a sword`
20. **Offered items**: `he offers you a key`, `gives you a potion`
21. **Two items with "and"**: `sword and shield`
22. **Three items**: `sword, shield, and helmet`
23. **Comma-separated**: `sword, shield, helmet`
24. **"Or" connector**: `take the sword or shield`
25. **Slash-separated**: `sword/shield/helmet`
26. **Multiple after verbs**: `you find sword, shield, and potion`

#### Advanced Patterns
27-34. Additional patterns for reward items, possessive forms, commands, bullets, parentheses, stat values, etc.

**Auto-Type Detection:**
The app automatically determines item type based on keywords:
- **Weapon**: sword, axe, bow, dagger, blade, staff, wand, mace, spear, etc.
- **Armor**: shield, helmet, armor, mail, breastplate, gauntlets, boots, etc.
- **Potion**: potion, elixir, tonic, brew, flask, vial, draught
- **Treasure**: gold, coin, gem, jewel, diamond, ruby, emerald, loot
- **Key**: key
- **Other**: ring, amulet, scroll, map, book, rope, torch, etc.

---

## Combat System

### Marker-Based Combat (Highest Priority)

```
{combat: ENEMY NAME | skill=6 | stamina=10 | onVictory=5 | onDefeat=999 | canFlee=true | fleeSection=3}
```

**Marker Format:**
- `{combat: ENEMY NAME | skill=X | stamina=Y | ...}`

**Required Attributes:**
- `skill`: Enemy's skill value
- `stamina`: Enemy's stamina value

**Optional Attributes:**
- `onVictory`: Section to go to when you win (default: next section)
- `onDefeat`: Section to go to when you die (default: 999)
- `canFlee`: true/false - whether you can flee
- `fleeSection`: Section to go to if you flee

**Special combat rules (JSON only, set on each enemy in the `combat` entry or list):**
- `fleeMaxStamina`: Flee is only offered while your STAMINA is at or below this value
- `fleeTestLuck`: true - fleeing requires a Test Luck; if unlucky you stay in the fight
- `onWound`: `{ "skillLoss": 1, "permanent": true }` - each time this enemy wounds you, lose SKILL
  permanently (also lowers your Initial SKILL)
- `onWound`: `{ "skillLoss": 1, "luckTest": true }` - each wound triggers a Test Luck; if unlucky, lose
  SKILL for the rest of the combat only (restored afterwards)
- `reviveOn`: `[5, 6]` - when reduced to 0 STAMINA, roll one die; on a listed result the enemy
  survives with 1 STAMINA

**Item conditions on choices (JSON only):**
- `"conditions": { "requiresItem": "brass-key" }` - the choice is shown but locked until you own that item id.
- `"conditions": { "requiresNoItem": "brass-key" }` - the choice only appears while you do NOT own the item
  (use for "if you don't have it" branches).
- `testLuck` may also carry `"conditions"` and a `"label"`, e.g. a forced-door luck test that only appears
  without the key. `validate_adventure.py` reports items that a condition needs but no section gives.
- Items with `"unique": true`, or with a `bonus` (cloaks, magic weapons), are not collected twice.

**Weapon properties (JSON only):**
- Items of `type: "weapon"` may list `"properties": ["magical", "silver", "crushing"]`. If omitted, they are
  guessed from the item name (silver / magic, blessed, enchanted, holy / mace, club, hammer, flail, maul).
- Only one weapon is wielded at a time. The game picks the weapon that does the most damage to the current
  enemy, then the largest SKILL `bonus`. Bonuses from several weapons do not stack.
- `effectiveWeapons: ["magical", "silver"]` with `normalWeaponDamage: 1` on an enemy: weapons without one of
  those properties deal 1 damage per hit instead of 2 (Incorporeal).
- `weakTo: { "property": "crushing", "damage": 3 }` on an enemy: weapons with that property deal 3 damage.
- `normalWeaponDamage: 0` with `effectiveWeapons` makes the enemy fully immune to other weapons (your blows pass
  through harmlessly). Make sure the book gives the player a way to obtain a qualifying weapon.
- `onStart: { "luckTest": true, "skillLoss": 2 }`: when the fight with this enemy begins, Test Luck; if unlucky,
  lose SKILL for the whole battle.
- `note`: optional free text shown in the combat panel. Every special rule above is also listed there automatically.

Example (a Zombie that may refuse to stay down, with a luck-tested escape):
```json
{ "enemyName": "ZOMBIE 1", "enemySkill": 5, "enemyStamina": 6,
  "reviveOn": [5, 6], "canFlee": true, "fleeSection": 346,
  "fleeMaxStamina": 4, "fleeTestLuck": true,
  "onVictorySection": 259, "onDefeatSection": 999 }
```

**Example:**
```json
{
  "id": 15,
  "text": "A {combat: CAVE TROLL | skill=8 | stamina=12 | onVictory=20 | canFlee=true | fleeSection=14} blocks your path!",
  "combat": {
    "enemyName": "CAVE TROLL",
    "enemySkill": 8,
    "enemyStamina": 12,
    "onVictorySection": 20,
    "onDefeatSection": 999,
    "canFlee": true,
    "fleeSection": 14
  }
}
```

### Pattern-Based Combat (24+ Patterns)

If no markers, the app detects combat using 24+ patterns:

1. **Classic format**: `GOBLIN SKILL 5 STAMINA 7`
2. **Reversed**: `GOBLIN STAMINA 7 SKILL 5`
3. **Abbreviations**: `GOBLIN SK 5 ST 7`
4. **Natural language**: `fight a Goblin (skill 5, stamina 7)`
5. **Stats first**: `SKILL 5 STAMINA 7 - Goblin`
6. **Multi-line**: Enemy name on one line, stats on next
7. **Bullets**: `• Goblin: Skill 5, Stamina 7`
8. **Table format**: `Enemy: Goblin\nSkill: 5\nStamina: 7`
9. **JSON-like**: `"enemy": "Goblin", "skill": 5, "stamina": 7`
10. **Lowercase**: `goblin skill 5 stamina 7` (auto-capitalized)
11. **HP instead**: `skill 5 HP 10`
12. **Ratio format**: `Goblin (5/10)` = skill 5, stamina 10
13-24. Additional patterns for equals, colons, brackets, pipes, dashes, sequential, ordinals, numbered lists, waves, etc.

### Multiple Combats

The app supports fighting multiple enemies in sequence:

```json
{
  "id": 25,
  "text": "You must fight two goblins!\n{combat: GOBLIN 1 | skill=5 | stamina=6}\n{combat: GOBLIN 2 | skill=6 | stamina=7}",
  "combat": [
    {
      "enemyName": "GOBLIN 1",
      "enemySkill": 5,
      "enemyStamina": 6
    },
    {
      "enemyName": "GOBLIN 2",
      "enemySkill": 6,
      "enemyStamina": 7
    }
  ]
}
```

The player must defeat all enemies in order before proceeding.

### Combat Resolution

**Combat Round Process:**
1. Player rolls 2 dice + SKILL + attack bonus (from weapons)
2. Enemy rolls 2 dice + SKILL
3. Higher total wins the round
4. Winner deals 2 damage (defender takes reduced damage if armor bonus)
5. Combat continues until one side reaches 0 STAMINA

**Attack Bonus (Magic Weapons):**
```javascript
// Calculated from all weapons in inventory
calculateAttackBonus() {
  return inventory.reduce((total, item) => {
    if (item.type === 'weapon' && item.bonus) {
      // Extracts +N from "+N skill", "+N attack", etc.
      const match = item.bonus.match(/([+-]\d+)/);
      if (match) return total + parseInt(match[1]);
    }
    return total;
  }, 0);
}
```

**Defense Bonus (Magic Armor):**
```javascript
// Calculated from all armor in inventory
calculateDefenseBonus() {
  return inventory.reduce((total, item) => {
    if (item.type === 'armor' && item.bonus) {
      // Extracts +N from "+N defense", "+N armor", etc.
      const match = item.bonus.match(/([+-]\d+)/);
      if (match) return total + parseInt(match[1]);
    }
    return total;
  }, 0);
}
```

**Combat Log Example:**
```
⚔️ Combat begins with CAVE TROLL!
CAVE TROLL: SKILL 8, STAMINA 12

Round 1:
You rolled 7 + 6 SKILL + 2 (weapon bonus) = 15
CAVE TROLL rolled 8 + 8 SKILL = 16
💔 CAVE TROLL hits you for 1 damage! (reduced from 2 by 1 armor bonus)

Round 2:
You rolled 10 + 6 SKILL + 2 (weapon bonus) = 18
CAVE TROLL rolled 6 + 8 SKILL = 14
💥 You hit CAVE TROLL for 2 damage! (10 STAMINA remaining)
```

---

## Magic Weapons & Armor

### How Magic Items Work

Magic weapons and armor are **passive bonuses** - they work automatically when in your inventory.

**Weapon Bonuses:**
- Applied to **attack strength** during combat
- Format: `+N skill`, `+N attack`, or just `+N`
- Example: `Ancient Sword (+2 skill)` adds +2 to all attack rolls

**Armor Bonuses:**
- Reduce **damage taken** during combat
- Format: `+N defense`, `+N armor`, or just `+N`
- Example: `Steel Shield (+1 defense)` reduces damage by 1 (minimum 1 damage)

**Stacking:**
Multiple weapons/armor stack their bonuses:
- 2 weapons with +1 each = +2 total attack bonus
- 2 armor pieces with +1 each = +2 total defense bonus

### Creating Magic Items

**In JSON:**
```json
{
  "addItems": [
    {
      "id": "flaming-sword",
      "name": "Flaming Sword",
      "type": "weapon",
      "bonus": "+3 skill",
      "description": "A sword wreathed in magical flames"
    },
    {
      "id": "dragon-shield",
      "name": "Dragon Shield",
      "type": "armor",
      "bonus": "+2 defense",
      "description": "A shield made from dragon scales"
    }
  ]
}
```

**Using Markers:**
```
You find a {item: Flaming Sword | type=weapon | bonus=+3 skill} and a {item: Dragon Shield | type=armor | bonus=+2 defense}!
```

**Pattern Detection:**
The app automatically detects magic items from text:
- `Sword of Fire` (detected as weapon with "of Power" pattern)
- `+3 Shield` (detected with plus notation)
- `Enchanted Armor` (detected with magic keywords)

---

## Item Usage System

### Consumable Items

Items with a `restore` property can be used from inventory:

**Restore Format:**
- `+N stamina` - restores stamina
- `+N skill` - restores skill
- `+N luck` - restores luck
- `-N stamina` - negative effects possible too

**Example Items:**
```json
{
  "id": "healing-potion",
  "name": "Healing Potion",
  "type": "potion",
  "restore": "+4 stamina",
  "description": "Restores 4 STAMINA when consumed"
}
```

```json
{
  "id": "meal",
  "name": "Provisions",
  "type": "food",
  "restore": "+3 stamina",
  "description": "A hearty meal"
}
```

### Using Items

**From Inventory UI:**
1. Items with `restore` property show a "Use" button
2. Clicking "Use" applies the restoration
3. Consumable items (type: potion, food) are removed after use
4. Other items with restore can be used repeatedly

**Use Item Function:**
```javascript
useItem(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item || !item.restore) return;

  // Parse restore: "+4 stamina" -> amount=4, stat="stamina"
  const match = item.restore.match(/([+-]\d+)\s*(\w+)/);
  if (match) {
    const amount = parseInt(match[1]);
    const stat = match[2].toLowerCase();

    // Apply restoration
    if (stat === 'stamina' || stat === 'skill' || stat === 'luck') {
      modifyStats({ [stat]: amount });

      // Remove if consumable
      if (item.type === 'potion' || item.type === 'food') {
        removeItem(itemId);
      }
    }
  }
}
```

**UI Display:**
Inventory shows items with visual indicators:
- ⚔️ Weapons (with ⚡ bonus if present)
- 🛡️ Armor (with ⚡ bonus if present)
- 🧪 Potions (with ✨ restore if present)
- 🍞 Food (with ✨ restore if present)
- 💎 Treasure
- 🔑 Keys
- 📦 Other items

---

## Choice Processing & Conditions

### Basic Choices

**In JSON:**
```json
{
  "choices": [
    {
      "text": "Enter the cave",
      "targetSection": 10
    },
    {
      "text": "Continue down the path",
      "targetSection": 15
    }
  ]
}
```

**Using Markers:**
```
{choice: 10 | Enter the cave}
{choice: 15 | Continue down the path}
```

**Pattern Detection:**
The app auto-detects choices from phrases like:
- `turn to 10`
- `go to section 15`
- `proceed to 20`
- `return to 5`

### Conditional Choices

Choices can require items or stat minimums:

**Item Requirements:**
```json
{
  "text": "Use the key to unlock the door",
  "targetSection": 25,
  "conditions": {
    "requiresItem": "rusty-key"
  }
}
```

**Marker:**
```
{choice: 25 | if: hasItem=rusty-key | Use the key to unlock the door}
```

**Stat Requirements:**
```json
{
  "text": "Force the door open (requires SKILL 8+)",
  "targetSection": 30,
  "conditions": {
    "requiresMinSkill": 8
  }
}
```

**Marker:**
```
{choice: 30 | if: skill>=8 | Force the door open}
```

**Validation:**
```javascript
canMakeChoice(choice) {
  if (!choice.conditions) return true;

  const c = choice.conditions;
  if (c.requiresItem && !hasItem(c.requiresItem)) return false;
  if (c.requiresMinSkill && stats.skill < c.requiresMinSkill) return false;
  if (c.requiresMinStamina && stats.stamina < c.requiresMinStamina) return false;
  if (c.requiresMinLuck && stats.luck < c.requiresMinLuck) return false;

  return true;
}
```

Disabled choices appear grayed out with "(requires conditions)" label.

---

## Stat Modifications

### Section-Level Stat Changes

Sections can modify stats when entered:

**In JSON:**
```json
{
  "id": 40,
  "text": "You drink from the magical fountain and feel refreshed!",
  "modifyStats": {
    "stamina": 5,
    "luck": 1
  }
}
```

**Using Markers:**
```
{action: +5 stamina | You drink from the fountain}
{action: -2 skill | The poison weakens you}
```

**Note:** Markers in text are informative; actual stat changes come from the `modifyStats` property.

### Combat Damage

**Player Hit:** Loses 2 STAMINA (reduced by armor bonus)
**Enemy Hit:** Loses 2 STAMINA

**Minimum Damage:** Always at least 1 damage, even with armor

### Luck Tests

**Test Luck Mechanism:**
1. Roll 2 dice
2. If roll ≤ current LUCK: Success
3. Reduce LUCK by 1 (every test costs luck)

**In JSON:**
```json
{
  "id": 50,
  "testLuck": {
    "successSection": 51,
    "failureSection": 52,
    "successText": "You dodge the trap!",
    "failureText": "The trap hits you!"
  }
}
```

---

## Marker-Based vs Pattern-Based Detection

### Detection Priority

1. **Marker-Based** (highest priority)
   - Explicit, unambiguous
   - Full control over properties
   - Recommended for authors

2. **Pattern-Based** (fallback)
   - Automatic detection
   - May miss edge cases
   - Good for quick authoring

### When to Use Each

**Use Markers When:**
- You need precise control
- Complex items/combat with special properties
- Conditional choices
- Multiple similar items that might confuse pattern detection

**Use Patterns When:**
- Quick prototyping
- Simple adventures
- Standard item/combat formats
- Natural narrative text

### Mixing Both

You can mix markers and patterns in the same adventure:
- Markers for important/complex items
- Patterns for background/flavor items

**Example:**
```json
{
  "id": 60,
  "text": "The chest contains a {item: Legendary Sword +5 | type=weapon | bonus=+5 skill} and 50 gold coins.",
  "addItems": [
    {
      "id": "legendary-sword-5",
      "name": "Legendary Sword +5",
      "type": "weapon",
      "bonus": "+5 skill"
    },
    {
      "id": "50-gold-coins",
      "name": "50 Gold Coins",
      "type": "treasure"
    }
  ]
}
```

The Legendary Sword is defined with a marker for precision, while "50 gold coins" is auto-detected by pattern matching.

---

## Item ID Generation

**Automatic ID Creation:**
Items detected by patterns or markers get IDs automatically:

```javascript
// "Ancient Sword" -> "ancient-sword"
// "Healing Potion +4" -> "healing-potion-4"
const itemId = itemName.toLowerCase().replace(/\s+/g, '-');
```

**Manual IDs in JSON:**
For precise control, specify IDs manually in `addItems`:

```json
{
  "addItems": [
    {
      "id": "sword-of-destiny",  // Custom ID for referencing
      "name": "Sword of Destiny",
      "type": "weapon",
      "bonus": "+3 skill"
    }
  ]
}
```

Then reference in choices:
```json
{
  "text": "Use the Sword of Destiny",
  "conditions": {
    "requiresItem": "sword-of-destiny"
  }
}
```

---

## Complete Example Adventure

Here's a complete example showing all mechanics:

```json
{
  "id": "example-adventure",
  "title": "The Dungeon Quest",
  "author": "Adventure Author",
  "description": "A challenging dungeon adventure",
  "startingSection": 1,
  "initialStats": {
    "skill": 8,
    "stamina": 20,
    "luck": 9
  },
  "startingItems": [
    {
      "id": "rusty-sword",
      "name": "Rusty Sword",
      "type": "weapon",
      "bonus": "+1 skill"
    }
  ],
  "sections": [
    {
      "id": 1,
      "text": "You stand before the dungeon entrance. A {item: torch | type=other} burns on the wall. Do you take it?",
      "choices": [
        {"text": "Take the torch and enter", "targetSection": 2},
        {"text": "Enter without it", "targetSection": 3}
      ],
      "addItems": [
        {"id": "torch", "name": "Torch", "type": "other"}
      ]
    },
    {
      "id": 2,
      "text": "The torch illuminates a {combat: GOBLIN GUARD | skill=6 | stamina=8 | onVictory=4}!",
      "combat": {
        "enemyName": "GOBLIN GUARD",
        "enemySkill": 6,
        "enemyStamina": 8,
        "onVictorySection": 4
      }
    },
    {
      "id": 4,
      "text": "You defeated the goblin! You find a {item: Steel Sword | type=weapon | bonus=+2 skill} and a {item: Healing Potion | type=potion | restore=+4 stamina}.",
      "choices": [
        {"text": "Continue deeper", "targetSection": 5},
        {"text": "Use magic door (requires key)", "targetSection": 6, "conditions": {"requiresItem": "magic-key"}}
      ],
      "addItems": [
        {"id": "steel-sword", "name": "Steel Sword", "type": "weapon", "bonus": "+2 skill"},
        {"id": "healing-potion", "name": "Healing Potion", "type": "potion", "restore": "+4 stamina"}
      ]
    },
    {
      "id": 5,
      "text": "You find the treasure room! 100 gold coins and a {item: Magic Key | type=key}!",
      "isEnding": true,
      "endingType": "victory",
      "addItems": [
        {"id": "100-gold-coins", "name": "100 Gold Coins", "type": "treasure"},
        {"id": "magic-key", "name": "Magic Key", "type": "key"}
      ]
    }
  ]
}
```

---

## Summary

**Key Points:**

1. **Items**: Use markers for precision, patterns for convenience. Auto-type detection works for standard items.

2. **Combat**: Supports single or multiple enemies. Attack/defense bonuses from equipment apply automatically.

3. **Magic Items**: Weapons add to attack, armor reduces damage. All items in inventory contribute bonuses.

4. **Consumables**: Items with `restore` can be used from inventory. Potions/food are removed after use.

5. **Choices**: Can be conditional based on items or stats. Disabled choices shown but not selectable.

6. **Detection Order**: Markers → Patterns → Auto-type → Defaults

**Best Practices:**

- Use markers for important/unique items
- Use markers for combat with special properties (flee, custom sections)
- Use conditional choices for branching storylines
- Provide healing items for long adventures
- Balance combat with player's starting stats
- Test all choice conditions work as expected

---

*This guide covers the complete mechanics of the standalone HTML app as of the current version. For questions or issues, refer to the source code in `index.html`.*
