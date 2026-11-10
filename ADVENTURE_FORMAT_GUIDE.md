> **Legacy guide (format v1).** For new books use [AUTHORING.md](AUTHORING.md); this file is kept for reference only.

# Adventure Formatting Guide

Welcome to the Adventure Formatter! This guide will help you format your gamebook adventures properly for the app.

## ⭐ New Features

The formatter now supports even more flexible formats:

- **Optional Colons**: Use `Section 1` or `Section 1:` - both work!
- **Markdown Headers**: Support for `## SECTION 1 {#section-1}` format
- **Markdown Links**: Choices can use `[45](#section-45)` format
- **Mixed Formats**: Combine different styles in the same file
- **Auto-Combat**: Combat rounds are automatically simulated with visual feedback
- **Auto-Luck Tests**: Test Your Luck rolls happen automatically
- **Combat Rewards**: Defeated enemies can drop items for your inventory

Perfect for converting existing markdown documents or creating new adventures in your preferred format!

## Table of Contents

1. [Quick Start](#quick-start)
2. [Format Overview](#format-overview)
3. [Metadata](#metadata)
4. [Sections](#sections)
5. [Choices](#choices)
6. [Combat](#combat)
7. [Advanced Features](#advanced-features)
8. [Using the Formatter Tool](#using-the-formatter-tool)
9. [Examples](#examples)

---

## Quick Start

### Basic Structure

```
Title: Your Adventure Name
Author: Your Name
Description: A brief description of your adventure
Initial SKILL: 8
Initial STAMINA: 20
Initial LUCK: 9

Section 1: The Beginning

You stand at the entrance to a dark forest. A worn sign reads "Danger Ahead!"

If you want to enter the forest, turn to 2.
If you prefer to turn back, go to 3.

Section 2: Into the Forest

You venture into the forest. Suddenly, a GOBLIN jumps out! SKILL 6 STAMINA 5

If you defeat the goblin, turn to 4.

Section 999: Game Over

You have died. Your adventure ends here.
```

---

## Format Overview

The app supports multiple formats:

- **TXT** (`.txt`) - Plain text, easiest to write
- **MD** (`.md`) - Markdown format
- **JSON** (`.json`) - Structured data for advanced features
- **PDF** (`.pdf`) - Automatically converted to text

### Recommended: Start with TXT

Write your adventure in plain text format. It's the easiest to create and can be converted to JSON later.

---

## Metadata

Add metadata at the beginning of your file:

### Required

```
Title: Your Adventure Name
```

### Optional but Recommended

```
Author: Your Name
Description: A short description of your adventure
Initial SKILL: 8
Initial STAMINA: 20
Initial LUCK: 9
```

**Default Stats** (if not specified):
- SKILL: 6
- STAMINA: 14
- LUCK: 6

---

## Sections

Sections are the building blocks of your adventure. Each section has:
- An ID number
- Content/narrative text
- Choices (where to go next)

### Section Format Options

The app recognizes several formats. **You can mix different formats in the same file!**

#### Option 1: Plain Format (Most Flexible) ⭐
```
Section 1
Section 1:
Section 1.
SECTION 1
```
**Note:** Colons and punctuation are **completely optional**! Both `Section 1` and `Section 1:` work perfectly.

#### Option 2: Markdown Headers ⭐ NEW
```
## SECTION 1
## SECTION 1 {#section-1}
### Section 1
# SECTION 1 {#section-1}
```
- Any number of `#` symbols works
- Anchor tags `{#...}` are optional
- Perfect for markdown documents
- Case-insensitive (SECTION or Section)

#### Option 3: Brackets
```
[1]
[1] The Dark Cave
```

#### Option 4: Number with period
```
1.
1. The Dark Cave
```

#### Option 5: Parentheses
```
(1)
(1) The Dark Cave
```

#### Option 6: Markdown Bold
```
**1**
```

#### Option 7: Standalone number
```
1
```

### Special Sections

- **Section 0**: Introduction/background (optional, shown before game starts)
- **Section 1**: Starting section (required, where the game begins)
- **Section 999**: Traditional death/failure ending

### Section Example

```
Section 5: The Treasure Room

You enter a magnificent chamber filled with gold and jewels.
In the center sits a ornate chest.

If you want to open the chest, turn to 10.
If you want to leave the room, go to 3.
```

---

## Choices

Choices let players navigate between sections.

### Supported Choice Formats

#### Format 1: Traditional Text Choices
The app recognizes these choice phrases:

- `turn to X`
- `go to X`
- `proceed to X`
- `continue to X`
- `move to X`
- `head to X`
- `return to X`

**Examples:**
```
If you want to fight, turn to 15.
To run away, go to 8.
You may proceed to section 20.
Continue to 5 if you have a key.
```

#### Format 2: Markdown Link Choices ⭐ NEW
Use markdown link format for clickable choices:

```
[45](#section-45)
[127](#section-127)
```

**With descriptive text:**
```
Turn to [45](#section-45) to enter the Weeping Willow tavern
Turn to [127](#section-127) to investigate the cemetery
Turn to [234](#section-234) to visit Mayor Hollow's manor
```

This format is perfect for markdown documents and provides clickable links in markdown viewers.

#### Format 3: Mixed Formats
You can even mix both styles in the same adventure:

```
Section 10

You stand at a crossroads.

If you go left, turn to 5.
Go right: [15](#section-15)
Or return to [1](#section-1)
```

### Best Practices

- **1-4 choices per section** is ideal for gameplay
- Make choices clear and meaningful
- Every section should have at least one choice (unless it's an ending)
- Both traditional and markdown link formats work equally well

---

## Combat

Add combat encounters using this format:

```
ENEMY_NAME SKILL X STAMINA Y
```

### Examples

```
A GOBLIN attacks! SKILL 6 STAMINA 8

The DRAGON roars! SKILL 12 STAMINA 20

An ORC WARRIOR charges at you! SKILL 8 STAMINA 10
```

### Combat Section Example

```
Section 7: The Arena

You step into the arena. A massive TROLL appears! SKILL 9 STAMINA 15

If you defeat the troll, turn to 12.
```

### Combat Notes

- Enemy name should be in CAPITAL LETTERS
- Always include a victory section (where to go after winning)
- If the player loses, they automatically go to section 999 (death)
- **Combat is automatically simulated**: Rounds play out with 2-second delays
- **Pause/Resume**: Players can pause auto-combat and fight manually
- **Visual feedback**: See dice rolls, damage, and combat log in real-time

### Combat Rewards (JSON Format Only)

Defeated enemies can drop items that are automatically added to the player's inventory:

```json
{
  "id": 7,
  "text": "A fearsome troll blocks your path!",
  "combat": {
    "enemyName": "Troll",
    "enemySkill": 9,
    "enemyStamina": 15,
    "onVictorySection": 12,
    "onDefeatSection": 999,
    "rewardItems": [
      {
        "id": "troll-key",
        "name": "Rusty Key",
        "description": "Taken from the defeated troll",
        "type": "key"
      },
      {
        "id": "gold-coins",
        "name": "Gold Coins",
        "description": "20 gold pieces",
        "type": "treasure"
      }
    ]
  }
}
```

When the player defeats the enemy, all reward items are automatically added to their inventory with a notification in the combat log.

---

## Advanced Features

### Endings

The app automatically detects endings:

#### Detected by Section Number
- Section 999 = Death/Defeat
- Section 400 = Alternate ending

#### Detected by Keywords
The following phrases mark a section as an ending:
- "you have won"
- "victory"
- "you have succeeded"
- "the end"
- "you have died"
- "you are dead"
- "game over"

### Ending Types

- **Victory**: Player wins
- **Defeat**: Player loses/dies
- **Neutral**: Ambiguous or alternate ending

### Example Endings

```
Section 100: Victory!

You have won! The kingdom is saved and you are hailed as a hero.

---

Section 999: Defeat

You have died. Your quest ends in failure.
```

### Stat Modifications (Text Format)

You can modify player stats in your narrative:

```
You drink the potion. Restore 4 STAMINA points.

The trap injures you. Lose 2 STAMINA.

Your training pays off. Add 1 to your SKILL.
```

### Items

Items can be automatically detected from text format or explicitly defined in JSON format.

#### Text Format (Auto-Detection)

The converter automatically detects items from your narrative text using these patterns:

```
Section 1

You find a rusty sword lying on the ground.

Turn to section 2.

Section 2

You discover a healing potion and a golden key.

Turn to section 3.

Section 3

You defeat the goblin and find 50 gold coins. You also gain an enchanted shield.

Turn to section 4.
```

**Supported patterns:**
- "you find/discover/gain/obtain/receive/pick up/take/grab/acquire [item]"
- "[number] gold coins" or "[number] coins"
- Direct mentions like "a/an/the [adjective] [item-noun]"

**Recognized item types:**
- **Weapons:** sword, axe, bow, dagger, blade, staff, wand, mace, spear, crossbow
- **Armor:** shield, helmet, armor, mail, breastplate, gauntlet, boots
- **Potions:** potion, elixir, tonic, brew
- **Treasures:** gold, coins, gems, jewels, diamond, ruby, emerald, sapphire
- **Keys:** key
- **Other:** ring, amulet, scroll, map, book, rope, torch, lantern

**Supported adjectives:** healing, magic, enchanted, rusty, golden, silver, iron, bronze, steel, ancient, old, new, heavy, light, sharp, dull, bright, dark, mysterious, cursed, blessed, holy

#### JSON Format (Manual Definition)

For precise control over item properties, use JSON format:

```json
{
  "id": 5,
  "text": "You find a healing potion!",
  "addItems": [
    {
      "id": "healing-potion",
      "name": "Healing Potion",
      "description": "Restores 4 STAMINA points",
      "type": "potion"
    }
  ]
}
```

Item types: `weapon`, `armor`, `potion`, `treasure`, `key`, `other`

### Luck Tests (JSON Format Only)

Test Your Luck is a core mechanic where players roll 2d6 against their current Luck stat:

```json
{
  "id": 10,
  "text": "You attempt to jump across the chasm. Test your luck!",
  "testLuck": {
    "successSection": 15,
    "failureSection": 999,
    "successText": "You make it across safely!",
    "failureText": "You fall into the darkness..."
  }
}
```

**Automatic Luck Tests**:
- The dice roll happens automatically after 1.5 seconds
- Visual display shows the roll result vs. required Luck
- Success or failure is clearly indicated
- Players can pause the auto-roll if they want manual control
- Luck decreases by 1 after each test (automatically handled)

---

## Using the Formatter Tool

### Command Line Tool

The CLI tool helps validate and convert your adventures.

#### Installation

The tool is located at `formatAdventure.js` and uses Node.js.

#### Commands

**1. Validate your adventure:**
```bash
node formatAdventure.js validate my-adventure.txt
```

This checks for:
- Missing metadata
- Duplicate sections
- Broken links (choices pointing to non-existent sections)
- Unreachable sections
- Dead ends (sections without choices)

**2. Convert TXT to JSON:**
```bash
node formatAdventure.js convert my-adventure.txt
```

Or specify output file:
```bash
node formatAdventure.js convert my-adventure.txt output.json
```

**3. Check for common issues:**
```bash
node formatAdventure.js check my-adventure.txt
```

This identifies:
- Section numbering gaps
- Very short sections
- Sections with too many choices
- Combat without clear victory paths

### What the Validator Checks

✅ **Passes if:**
- Has a title
- Has at least one section
- Has section 1 (starting point)
- No duplicate section numbers
- All choice references point to existing sections

⚠️ **Warnings for:**
- Missing author
- Unreachable sections
- Dead ends (sections without choices that aren't endings)
- Large section numbering gaps

❌ **Fails if:**
- Missing title
- No sections found
- Missing section 1
- Duplicate section numbers
- Broken links (choices to non-existent sections)

---

## Examples

### Example 1: Simple Adventure

```
Title: The Cursed Amulet
Author: Jane Smith
Description: A short adventure in a haunted mansion
Initial SKILL: 7
Initial STAMINA: 18
Initial LUCK: 8

Section 0: Introduction

You are a brave adventurer who has heard tales of a cursed amulet
hidden in the old Ravencrest Mansion. Many have entered, none have returned.

Section 1: The Mansion Gates

You stand before the rusted iron gates of Ravencrest Mansion.
The building looms ominously in the moonlight.

If you want to enter through the front door, turn to 2.
If you prefer to search for a side entrance, go to 5.

Section 2: The Front Hall

The front door creaks open. Dust fills the air. You hear a noise
from upstairs.

To investigate the noise, turn to 10.
To search the ground floor first, go to 3.

Section 5: The Side Entrance

You find a small door hidden by overgrown vines. It leads to
the kitchen.

Turn to 3.

Section 3: The Kitchen

The kitchen is in disarray. A GHOST appears! SKILL 7 STAMINA 6

If you defeat the ghost, turn to 10.

Section 10: The Amulet

You find the cursed amulet on a pedestal. As you take it,
you feel its power. You have won!

Section 999: Death

The darkness claims you. You have died.
```

### Example 2: Adventure with Combat

```
Title: Dragon's Lair
Author: John Doe

Section 1: The Cave Entrance

You stand at the entrance to the dragon's lair. Smoke billows from within.

To enter boldly, turn to 2.
To proceed cautiously, turn to 3.

Section 2: Direct Approach

You march straight in. The DRAGON attacks immediately! SKILL 12 STAMINA 25

If you defeat the dragon, turn to 10.

Section 3: The Cautious Path

You sneak through a side tunnel and avoid the dragon. You find
the treasure unguarded!

Turn to 10.

Section 10: Victory

You have won! The dragon's treasure is yours!

Section 999: Defeat

The dragon's flames consume you. You have died.
```

### Example 3: Markdown Format (With New Features) ⭐

```markdown
Title: The Haunted Village
Author: Adventure Master
Description: A spooky adventure using markdown format
Initial SKILL: 8
Initial STAMINA: 20
Initial LUCK: 9

## SECTION 0 {#section-0}

Introduction

Welcome to Hollow Creek, a village shrouded in mystery and fear.
Strange occurrences have plagued the town, and you've been called
to investigate.

## SECTION 1 {#section-1}

The Town Square

You arrive in the town square. The evening mist creeps through
the cobblestone streets. Three locations catch your attention.

Turn to [45](#section-45) to enter the Weeping Willow tavern

Turn to [127](#section-127) to investigate the cemetery

Turn to [234](#section-234) to visit Mayor Hollow's manor

## SECTION 45 {#section-45}

The Weeping Willow Tavern

You push open the heavy wooden door. Inside, locals huddle around
tables, speaking in hushed tones. The bartender approaches.

"Looking for trouble, stranger?" he asks.

If you ask about the hauntings, turn to [100](#section-100)
Or leave and go to [1](#section-1)

## SECTION 127 {#section-127}

The Cemetery

The cemetery gates creak ominously. Ancient tombstones loom in
the fog. Suddenly, a GHOST appears! SKILL 7 STAMINA 10

If you defeat the ghost, turn to [200](#section-200)

## SECTION 234

Mayor Hollow's Manor

The grand manor looms before you. Dark windows stare down like
empty eyes. The front door is slightly ajar.

Turn to [300](#section-300) to enter
Or return to [1](#section-1)

## SECTION 100 {#section-100}

Information Gathered

The bartender leans close. "The old cemetery... that's where it
all started." You have learned valuable information!

Turn to [127](#section-127) to investigate

## SECTION 200 {#section-200}

Victory Over the Ghost

You defeated the ghost and found a mysterious key!

Turn to [234](#section-234) to use the key at the manor

Section 300

The Manor's Secret

Using the key, you unlock the manor's secret chamber and break
the curse! You have won! The village is saved!

Section 999

Game Over

The darkness claims you. You have died.
```

**Note:** This example shows:
- ✅ Markdown headers with anchors (`## SECTION 1 {#section-1}`)
- ✅ Sections without colons (`Section 300`)
- ✅ Markdown link choices (`[45](#section-45)`)
- ✅ Traditional choices mixed in
- ✅ Combat encounters
- ✅ Multiple endings

### Example 4: JSON Format (Advanced)

```json
{
  "id": "sample-adventure",
  "title": "The Lost Temple",
  "author": "Adventure Writer",
  "description": "An adventure in ancient ruins",
  "startingSection": 1,
  "initialStats": {
    "skill": 8,
    "stamina": 20,
    "luck": 9
  },
  "sections": [
    {
      "id": 1,
      "title": "Temple Entrance",
      "text": "You stand before ancient temple ruins.",
      "choices": [
        {
          "text": "Enter the temple",
          "targetSection": 2
        },
        {
          "text": "Search the perimeter",
          "targetSection": 3
        }
      ]
    },
    {
      "id": 2,
      "title": "The Guardian",
      "text": "A stone guardian comes to life!",
      "combat": {
        "enemyName": "Stone Guardian",
        "enemySkill": 8,
        "enemyStamina": 12,
        "onVictorySection": 10,
        "onDefeatSection": 999
      }
    },
    {
      "id": 10,
      "title": "The Treasure",
      "text": "You have found the lost treasure! You have won!",
      "isEnding": true,
      "endingType": "victory"
    },
    {
      "id": 999,
      "title": "Game Over",
      "text": "Your adventure ends here. You have died.",
      "isEnding": true,
      "endingType": "defeat"
    }
  ]
}
```

---

## Tips for Writing Great Adventures

### Structure
1. **Start simple** - Write in TXT format first
2. **Plan your story** - Map out major paths and endings
3. **Number wisely** - Leave gaps (1, 5, 10, 15...) for easy additions
4. **Test thoroughly** - Use the validator to check for issues

### Gameplay
1. **Balance choices** - 2-4 options per section is ideal
2. **Vary difficulty** - Mix easy and hard combat encounters
3. **Multiple paths** - Create different ways to reach endings
4. **Meaningful choices** - Make decisions matter

### Combat
1. **Balance stats** - SKILL 5-8, STAMINA 4-10 for normal enemies
2. **Boss fights** - SKILL 10-15, STAMINA 15-30
3. **Victory paths** - Always show where to go after winning

### Endings
1. **Multiple endings** - Victory, defeat, and alternate endings
2. **Clear outcomes** - Use victory/defeat keywords
3. **Section 999** - Reserve for standard death

---

## Common Mistakes to Avoid

❌ **Don't:**
- Forget section 1 (required starting point)
- Create sections without choices (unless it's an ending)
- Reference non-existent sections
- Use inconsistent section numbering
- Make sections too long (keep under 500 words)

✅ **Do:**
- Validate your adventure before submitting
- Use clear, consistent formatting
- Test all paths through your adventure
- Include metadata (title, author, stats)
- Create multiple endings

---

## Getting Help

If you need help:

1. **Run the validator**: `node formatAdventure.js validate your-file.txt`
2. **Check this guide**: Review the examples above
3. **Test in the app**: Load your adventure and play through it
4. **Ask for feedback**: Share with others for testing

---

## Submission Checklist

Before submitting your adventure:

- [ ] Has a title
- [ ] Has section 1 (starting point)
- [ ] All sections have content
- [ ] Choices link to existing sections
- [ ] Combat encounters have victory sections
- [ ] At least one ending exists
- [ ] Validated with the formatter tool
- [ ] Tested by playing through it

---

Happy writing! 🎲📚
