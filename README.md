# Fighting Fantasy - Standalone Web Apps

## Start here (current version)

* **Play:** open `index.html` (or serve the folder, e.g. `python3 -m http.server`, so books can be fetched). Choose a book; buttons sit inside the story text, dice can be rolled by hand (button or **R**) or automatically.
* **Write a book:** read [`AUTHORING.md`](AUTHORING.md) and start from `templates/minimal-book.v2.json`. The format is fixed by `book.schema.json` (v2).
* **Check a book:** `python3 validate_adventure.py book.v2.json`; stress-test it with `node simulate_playthroughs.js book.v2.json 1000`.
* **Tests:** `npm test` (engine, simulation fingerprint, docs); `npm run test:ui` on its own (needs `npm i` for Playwright).
* **Design record:** [`UI-AND-SCHEMA-DESIGN.md`](UI-AND-SCHEMA-DESIGN.md).

> Everything below this line describes the older single-file app and the v1 book format. It is kept for reference; where it disagrees with `AUTHORING.md`, `AUTHORING.md` is right.

---

Two complete standalone web applications for creating and playing Fighting Fantasy-style gamebook adventures. No installation, no build process - just open in your browser!

## 🚀 Quick Start

### Playing Adventures (Standalone HTML App)

1. Open `index.html` in any modern web browser
2. Click "Load Example Adventure" to try the demo, or upload your own
3. Supported formats: JSON, TXT, Markdown (MD), and PDF
4. No dependencies, no installation required!

### Creating Adventures (Formatter Tool)

1. Open `formatter.html` in your browser
2. Paste or upload your adventure text
3. Get instant validation and feedback
4. Convert to JSON format for the game app
5. Download your formatted adventure

## 📱 What's Included

### 1. Standalone HTML Game App (`index.html`)

A complete Fighting Fantasy game engine in a single HTML file:

**Features:**
- ✨ Fully standalone - works offline in any browser
- 📖 Multiple format support (JSON, TXT, Markdown, PDF)
- 🎮 Complete gameplay system:
  - Character stats tracking (SKILL, STAMINA, LUCK)
  - Dice-based combat system
  - Inventory management with item types
  - Journey map showing visited sections
  - Save/load using localStorage
  - Test Your Luck mechanics
  - Conditional choices
  - Multiple ending types
- 🎲 Classic Fighting Fantasy rules
- 📱 Mobile responsive

**How to Play:**
1. Open `index.html` in your browser
2. Load an adventure (try the included examples)
3. Start your quest and make choices
4. Save your progress anytime

### 2. Adventure Formatter Tool (`formatter.html`)

A comprehensive web-based tool for creating and validating adventures:

**Features:**
- ✅ Live validation with detailed feedback
- 🔄 Convert text to JSON format
- 📊 Adventure statistics and preview
- 🔍 Detect broken links and missing sections
- 📝 Multiple input formats (TXT, MD, JSON)
- 💾 Download formatted adventures
- 📚 Built-in examples and templates

**How to Use:**
1. Open `formatter.html` in your browser
2. Paste your adventure or load a file
3. Click "Validate" to check for errors
4. Click "Convert to JSON" when ready
5. Download your formatted adventure

### 3. CLI Formatter Tool (`formatAdventure.js`)

For advanced users and automation (requires Node.js):

```bash
# Validate an adventure
node formatAdventure.js validate my-adventure.txt

# Convert text to JSON
node formatAdventure.js convert my-adventure.txt output.json

# Check for common issues
node formatAdventure.js check my-adventure.txt
```

## 📝 Creating Adventures

Adventures can be written in **plain text** and automatically converted to JSON!

### Simple Text Format Example

```
Title: My Adventure
Author: Your Name
Initial SKILL: 8
Initial STAMINA: 20
Initial LUCK: 9

Section 1: The Beginning

Your adventure starts here. Write your narrative text.

If you want to go left, turn to 2.
If you want to go right, turn to 3.

Section 2: Left Path

You went left and found a GOBLIN! SKILL 5 STAMINA 6

If you defeat it, turn to 4.

Section 3: Right Path

You went right. The path leads to victory. Turn to 4.

Section 4: The End

You completed the adventure! You have won!
```

The formatter automatically:
- ✅ Detects section numbers
- ✅ Creates choices from "turn to" references
- ✅ Parses combat from "SKILL X STAMINA Y" patterns
- ✅ Identifies endings from keywords
- ✅ Validates all links and structure

### JSON Format (Advanced Control)

For full control over all game features, use JSON format:

```json
{
  "id": "unique-adventure-id",
  "title": "Your Adventure",
  "author": "Your Name",
  "description": "Brief description",
  "startingSection": 1,
  "initialStats": {
    "skill": 8,
    "stamina": 20,
    "luck": 9
  },
  "startingItems": [],
  "sections": [
    {
      "id": 1,
      "title": "The Beginning",
      "text": "Your adventure begins...",
      "choices": [
        {
          "text": "Go left",
          "targetSection": 2
        },
        {
          "text": "Go right",
          "targetSection": 3
        }
      ]
    }
  ]
}
```

## 📚 Documentation

Complete guides are included:

- **[README-HTML.md](./README-HTML.md)** - Detailed HTML app documentation
- **[FORMATTER_README.md](./FORMATTER_README.md)** - Formatter tool guide
- **[ADVENTURE_FORMAT_GUIDE.md](./ADVENTURE_FORMAT_GUIDE.md)** - Complete format specification
- **[FORMAT-GUIDE.md](./FORMAT-GUIDE.md)** - Quick format reference
- **[MARKER_SYNTAX_GUIDE.md](./MARKER_SYNTAX_GUIDE.md)** - Advanced markup syntax

## 🎮 Game Mechanics

### Combat System
1. Both combatants roll 2 dice
2. Add SKILL to dice roll for Attack Strength
3. Higher Attack Strength wins the round
4. Loser takes 2 STAMINA damage
5. Combat continues until one reaches 0 STAMINA

### Test Your Luck
- Roll 2 dice
- Success if roll ≤ current LUCK
- LUCK decreases by 1 after each test

### Stats
- **SKILL**: Combat effectiveness (rarely changes)
- **STAMINA**: Health points (0 = death)
- **LUCK**: Success in luck tests (decreases with use)

## 📦 Example Adventures

### Included Examples:

1. **The Cavern of Fear** (JSON format)
   - `example-adventure.json`
   - 24 interconnected sections
   - 3 unique enemies
   - Multiple paths and endings
   - Demonstrates all JSON features

2. **The Forest of Destiny** (Text format)
   - `example-adventure.txt`
   - Shows simple text structure
   - Combat encounters
   - Easy to read and modify

3. **Enhanced Example** (Advanced features)
   - `example-adventure-enhanced.json`
   - `example-adventure-enhanced.txt`
   - Demonstrates advanced gameplay elements

4. **CURSE OF HOLLOW'S END** (Complete adventure)
   - `CURSE_OF_HOLLOWS_END.json`
   - `CURSE_OF_HOLLOWS_END_FORMATTED.txt`
   - Full-length adventure example

## 🌐 Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Opera (latest)

## 🔧 File Structure

```
/
├── index.html                          # Standalone game app
├── formatter.html                      # Web-based formatter tool
├── formatAdventure.js                  # CLI formatter (Node.js)
├── README.md                           # This file
├── README-HTML.md                      # HTML app documentation
├── FORMATTER_README.md                 # Formatter documentation
├── ADVENTURE_FORMAT_GUIDE.md           # Complete format guide
├── FORMAT-GUIDE.md                     # Quick format reference
├── MARKER_SYNTAX_GUIDE.md              # Advanced syntax guide
├── example-adventure.json              # Example (JSON)
├── example-adventure.txt               # Example (text)
├── example-adventure-enhanced.json     # Example (enhanced)
├── example-adventure-enhanced.txt      # Example (enhanced text)
├── example-adventure-converted.json    # Example (converted)
├── CURSE_OF_HOLLOWS_END.json          # Full adventure
└── CURSE_OF_HOLLOWS_END_FORMATTED.txt # Full adventure (text)
```

## 🚀 Getting Started

### For Players:
1. Download or clone this repository
2. Open `index.html` in your browser
3. Try the example adventures
4. Upload your own or find more online

### For Adventure Creators:
1. Open `formatter.html` in your browser
2. Start with a template or example
3. Write your adventure in plain text
4. Validate and convert to JSON
5. Test in `index.html`
6. Share your adventure!

### For Developers (CLI Tool):
```bash
# Clone the repository
git clone [repository-url]

# Use the CLI formatter (requires Node.js)
node formatAdventure.js validate your-adventure.txt
node formatAdventure.js convert your-adventure.txt output.json
```

## ✨ Key Features

### No Installation Required
- Both apps are completely standalone
- No npm, no Node.js, no dependencies
- Just HTML files that work in any browser

### Multiple Formats Supported
- **JSON** - Full control over all features
- **Text** - Easy to write, automatically parsed
- **Markdown** - Use markdown formatting
- **PDF** - Upload PDF files (text-based)

### Complete Validation
- Detect broken links
- Find missing sections
- Identify unreachable content
- Check for dead ends
- Validate combat and choices

### Smart Conversion
- Automatic section detection
- Choice extraction from natural language
- Combat parsing from stat patterns
- Ending detection from keywords

## 🎯 Workflow

**Perfect Workflow for Creating Adventures:**

1. **Write** your adventure in plain text (easy and natural)
2. **Validate** using `formatter.html` (catch errors early)
3. **Convert** to JSON format (automatic)
4. **Test** in `index.html` (play through your adventure)
5. **Iterate** based on gameplay experience
6. **Share** your completed adventure!

## 💡 Tips for Creating Great Adventures

- Keep sections concise (200-300 words)
- Provide meaningful choices (2-4 per section)
- Balance combat difficulty (vary enemy stats)
- Create multiple endings (victory, defeat, neutral)
- Test all paths thoroughly
- Use conditional choices for replay value
- Include items for puzzle-solving
- Add Test Your Luck moments for excitement

## 🐛 Troubleshooting

### "Could not load example book" error:
- Ensure example files are in the same directory as the HTML files
- Check that JSON files have valid syntax

### "Could not parse adventure" error:
- Verify section headers are formatted correctly
- Ensure you have at least Section 1
- Check the FORMAT-GUIDE.md for correct syntax

### Validation errors in formatter:
- Read the error messages carefully
- Common issues: broken links, missing sections, invalid combat stats
- Use the "Check" feature to find potential issues

## 📄 License

MIT License - Free to use and modify for your own adventures!

## 🎮 Credits

Inspired by the classic Fighting Fantasy gamebooks by Steve Jackson and Ian Livingstone.

---

**Ready to start?** Open `index.html` to play or `formatter.html` to create!

**Need help?** Check the documentation files for detailed guides and examples.

**Have fun creating amazing adventures!** 🎲✨
