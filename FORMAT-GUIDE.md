> **Legacy guide (format v1).** For new books use [AUTHORING.md](AUTHORING.md); this file is kept for reference only.

# Fighting Fantasy - Format Guide

This guide explains how to create adventures in different formats for the Fighting Fantasy web app.

## Supported Formats

The app supports four file formats:
1. **JSON** - Structured data format (recommended for full control)
2. **TXT** - Plain text format (easy to write)
3. **MD** - Markdown format (same as TXT with formatting)
4. **PDF** - PDF documents (converts to text and parses)

## JSON Format (Advanced)

JSON format gives you complete control over all game features.

### Structure

```json
{
  "id": "unique-adventure-id",
  "title": "Adventure Title",
  "author": "Your Name",
  "description": "Brief description",
  "startingSection": 1,
  "initialStats": {
    "skill": 8,
    "stamina": 20,
    "luck": 9
  },
  "startingItems": [
    {
      "id": "sword",
      "name": "Iron Sword",
      "description": "Your trusty blade",
      "type": "weapon"
    }
  ],
  "sections": [...]
}
```

### Section Structure

```json
{
  "id": 1,
  "title": "Section Title",
  "text": "The narrative text...",
  "choices": [
    {
      "text": "Choice description",
      "targetSection": 2,
      "conditions": {
        "requiresItem": "key",
        "requiresMinSkill": 7
      }
    }
  ],
  "combat": {
    "enemyName": "Goblin",
    "enemySkill": 5,
    "enemyStamina": 6,
    "onVictorySection": 3,
    "onDefeatSection": 999,
    "canFlee": true,
    "fleeSection": 1
  },
  "testLuck": {
    "successSection": 5,
    "failureSection": 6
  },
  "addItems": [...],
  "removeItems": ["item-id"],
  "modifyStats": {
    "skill": 1,
    "stamina": -2,
    "luck": -1
  },
  "isEnding": true,
  "endingType": "victory"
}
```

## Text Format (Simple)

Text format is easy to write and the parser will automatically convert it to the game structure.

### Basic Structure

```
Title: Your Adventure Title
Author: Your Name
Description: A brief description of your adventure
Initial SKILL: 8
Initial STAMINA: 20
Initial LUCK: 9

Section 1: First Section Title

Your narrative text goes here. You can write as much as you want.
The parser will automatically detect section numbers and create choices
when you reference other sections.

If you want to do something, turn to 2.
If you want to do something else, go to 3.

Section 2: Another Section

More narrative text here...
```

**Alternative: Standalone Numbers (Most Common in Real Books)**

Many imported gamebooks use standalone numbers without the "Section" word:

```
Title: Your Adventure Title
Author: Your Name
Initial SKILL: 8
Initial STAMINA: 20
Initial LUCK: 9

0

This is the introduction. Just a number on its own line works!

1

You begin your adventure here. The parser recognizes this format
automatically. This is the most common format in real Fighting Fantasy
book imports and PDFs.

If you want to continue, turn to 2

2

More adventure text here...
```

### Metadata (Optional)

Place these at the beginning of your file:

```
Title: The Adventure Name
Author: Author Name
Description: A short description
Initial SKILL: 7
Initial STAMINA: 18
Initial LUCK: 8
```

If not specified, defaults will be used.

### Section Headers

The parser recognizes these formats:

- `Section 1:` or `Section 1.`
- `SECTION 1:` or `SECTION 1.`
- `[1]` (brackets)
- `(1)` (parentheses)
- `1.` or `1:` (number with period/colon at start of line)
- `**1**` (Markdown bold - double asterisks)
- `1` (standalone number on its own line - **most common in real imports**)

### Creating Choices

The parser automatically creates choices when you use phrases like:

- "turn to X"
- "go to X"
- "proceed to X"
- "move to X"
- "continue to X"
- "return to X"
- "go to section X"

Examples:
```
If you want to fight, turn to 10.
To flee, go to 5.
You can also examine the room, turn to 7.
```

### Combat Encounters

Use this format to add combat:

```
A GOBLIN attacks you! SKILL 6 STAMINA 8
```

or

```
You must fight the TROLL. Skill 7, Stamina 10
```

The parser looks for:
- Enemy name (usually in CAPS before SKILL)
- Pattern: "SKILL X STAMINA Y" or "Skill X, Stamina Y"

### Stat Changes

Use phrases like:
- "Restore 4 STAMINA"
- "Lose 2 STAMINA"
- "Add 1 to your SKILL"
- "Subtract 1 from your LUCK"

Currently, explicit stat changes need to be tracked by the player, but you can mention them in the text.

### Endings

The parser automatically detects endings when sections contain:
- "you have won"
- "victory"
- "you have succeeded"
- "you have died"
- "you are dead"
- "game over"
- "the end"

Also, section 999 is treated as a defeat ending by default.

### Example Text Adventure

```
Title: The Dark Cave
Author: John Smith
Description: A short adventure in a mysterious cave
Initial SKILL: 7
Initial STAMINA: 18
Initial LUCK: 9

Section 1: The Entrance

You stand before a dark cave entrance. The air is cold and damp.
A torch burns on the wall nearby.

If you want to take the torch and enter, turn to 2.
If you want to enter without the torch, go to 3.

Section 2: With the Torch

You grab the torch and step into the cave. The flickering light
reveals ancient paintings on the walls. Ahead, the passage splits
into two tunnels.

To take the left tunnel, turn to 4.
To take the right tunnel, turn to 5.

Section 3: In the Darkness

Without the torch, you stumble in the darkness. You hit your head
on a low ceiling. Lose 2 STAMINA.

If you want to go back for the torch, turn to 2.
If you want to continue in darkness, turn to 6.

Section 4: The Left Tunnel

The left tunnel leads to a large chamber. In the center, a CAVE TROLL
blocks your path! SKILL 7 STAMINA 10

If you defeat the troll, turn to 7.

Section 5: The Right Tunnel

The right tunnel opens into a beautiful underground lake. Crystals
embedded in the ceiling sparkle like stars. You feel peaceful here.
Restore 4 STAMINA.

You see a path continuing ahead. Turn to 8.

Section 6: Lost in Darkness

Unable to see, you fall into a deep pit. Your adventure ends here.
You have died. The end.

Section 7: Troll Defeated

You have defeated the troll! Behind where it stood, you find a chest
containing gold and a magic sword. Add 2 to your SKILL.

A passage leads onward. Turn to 8.

Section 8: The Crystal Chamber

You enter a magnificent chamber filled with glowing crystals. In the
center is a pedestal with a golden crown. As you approach, a voice
echoes: "You have proven yourself worthy, adventurer."

You take the crown. You have won! Congratulations, your adventure
is complete. The end.

Section 999: Death

Your adventure ends in failure. Perhaps another adventurer will
have better luck. The end.
```

## Markdown Format

Markdown format works exactly like text format, but you can use Markdown formatting for emphasis:

```markdown
# The Adventure Title

**Author:** John Smith

**Description:** An exciting adventure

**Initial Stats:**
- SKILL: 8
- STAMINA: 20
- LUCK: 9

## Section 1: The Beginning

You find yourself in a *dark forest*. The trees loom overhead.

**Choices:**
- To go left, turn to **2**
- To go right, turn to **3**
```

The Markdown formatting will be preserved in the game text.

## PDF Format

PDF files are automatically converted to text and then parsed using the text format rules above. The parser has been enhanced to handle various PDF text formats.

**Supported Section Number Formats in PDFs:**
- `Section 1:` or `SECTION 1:`
- `[1]` (brackets)
- `(1)` (parentheses)
- `1.` or `1:` at the start of a line
- `**1**` (Markdown bold with double asterisks)
- `1` (standalone number on its own line - **works with most real gamebook PDFs**)

**Tips for PDFs:**
- The parser preserves line breaks and text structure from the PDF
- Section 0 is treated as intro/background (game starts at section 1)
- Use clear section headers - any of the formats above will work
- Ensure text is selectable (not scanned images or photos)
- PDF text extraction works best with clean, well-formatted PDFs
- Test with a text version first if you encounter issues

## Tips for Writing Adventures

### General Guidelines

1. **Number your sections clearly** - Use consistent numbering (Section 1, Section 2, etc.)
2. **Reference sections explicitly** - Always use phrases like "turn to X" so the parser can find choices
3. **Keep choices clear** - Make it obvious what each choice does
4. **Test your adventure** - Load it in the app and play through all paths

### Combat Tips

- Describe the enemy before stating its stats
- Use all caps for enemy names: "A GOBLIN appears"
- Always specify both SKILL and STAMINA
- The parser will automatically create combat encounters

### Narrative Tips

- Write in second person ("You see...", "You hear...")
- Be descriptive but concise
- Each section should be a complete scene
- End sections with clear choices or consequences

### Structure Tips

- **Section numbering convention:**
  - **Section 0** is treated as an **introduction** (background, rules, etc.)
    - When a book has section 0, it will be displayed first
    - Players see a "Start Adventure" button to begin the actual game
    - Section 0 is for reading only - no choices or combat
  - **Section 1** is where the **adventure actually starts**
    - This is always the default starting section for gameplay
    - Clicking "Start Adventure" from section 0 takes you to section 1
  - The parser automatically sets section 1 as the starting section (skips section 0)
- Start with an engaging opening (Section 1)
- Create multiple paths through your adventure
- Include at least one ending section
- Consider adding section 999 as a death/failure ending
- Test all paths to ensure no dead ends (unless intentional)

## Common Issues

### Parser Can't Find Sections

**Problem:** "Could not parse adventure from text file"

**Solutions:**
- Make sure you have clear section headers (Section 1:, Section 2:, etc.)
- Check that section numbers are integers
- Ensure there's at least one section in your file

### Combat Not Working

**Problem:** Combat encounters not detected

**Solutions:**
- Use the exact format: "SKILL X STAMINA Y" or "Skill X, Stamina Y"
- Put enemy name before the stats in CAPS
- Example: "Fight the GOBLIN! SKILL 5 STAMINA 6"

### Choices Not Appearing

**Problem:** No choices show up in the game

**Solutions:**
- Use standard phrases: "turn to", "go to", "proceed to"
- Always include the target section number
- Example: "If you want to fight, turn to 10."

### Stats Not Loading

**Problem:** Default stats used instead of yours

**Solutions:**
- Put metadata at the very beginning of the file
- Use exact format: "Initial SKILL: X"
- Make sure there's a colon after the stat name

## Converting Existing Books

If you have an existing Fighting Fantasy book or similar gamebook:

1. **Type or scan** the text into a text file
2. **Format section headers** - Make sure each section starts with "Section X:"
3. **Mark combat** - Ensure combat has format "SKILL X STAMINA Y"
4. **Check references** - Verify all "turn to X" references point to valid sections
5. **Add metadata** - Add Title, Author, and stats at the beginning
6. **Test** - Load in the app and test all paths

## Example Files

Check out these example files:
- `example-adventure.json` - Full JSON format with all features
- `example-adventure.txt` - Text format adventure

## Need Help?

- Check that your file follows one of the formats above
- Start with a simple 2-3 section adventure to test
- Use the example files as templates
- The JSON format gives you the most control if the parser isn't working as expected

---

Happy adventuring! Create amazing gamebook experiences and share them with others!
