> **Legacy guide (format v1).** For new books use [AUTHORING.md](AUTHORING.md); this file is kept for reference only.

# Adventure Formatter Tool

A comprehensive tool to help you format, validate, and convert gamebook adventures for the Fighting Fantasy app.

## 🎯 Quick Start

### Web Tool (Easiest)

Open `formatter.html` in your browser for a visual, user-friendly interface:

1. **Paste or load your adventure** - Use the text area or file upload
2. **Click "Validate"** - Check for format errors and issues
3. **Click "Convert to JSON"** - Get a structured JSON file ready for the app
4. **Download or copy** - Save your formatted adventure

**Try it now:** Open `formatter.html` in your browser!

### Command Line Tool

For advanced users and automation:

```bash
# Validate your adventure
node formatAdventure.js validate my-adventure.txt

# Convert TXT to JSON
node formatAdventure.js convert my-adventure.txt my-adventure.json

# Check for common issues
node formatAdventure.js check my-adventure.txt
```

## 📚 What This Tool Does

### ✅ Validation
- Checks for required metadata (title, author, stats)
- Verifies all sections are properly formatted
- Detects broken links (choices pointing to non-existent sections)
- Identifies unreachable sections
- Finds dead ends (sections without choices)
- Validates section numbering

### 🔄 Conversion
- Converts plain text adventures to JSON format
- Automatically detects:
  - Combat encounters
  - Choices and navigation
  - Endings (victory/defeat)
  - Section structure
- Preserves all metadata and content

### 🔍 Analysis
- Shows adventure statistics (sections, choices, combat, endings)
- Previews sections with important information
- Identifies potential issues (gaps in numbering, very short sections, etc.)
- Provides formatting recommendations

## 📝 Supported Formats

### Input Formats
- **TXT** - Plain text (easiest to write)
- **MD** - Markdown
- **JSON** - Already structured

### Output Format
- **JSON** - Structured format ready for the app

## 🎮 Adventure Format Basics

### Minimal Example

```
Title: My Adventure
Author: Your Name
Initial SKILL: 8
Initial STAMINA: 20
Initial LUCK: 9

Section 1: The Beginning

You start your adventure here.

If you want to continue, turn to 2.

Section 2: Victory

You have won! Congratulations!

Section 999: Game Over

You have died. The end.
```

### Key Elements

1. **Metadata** (at the top):
   ```
   Title: Your Adventure Name
   Author: Your Name
   Initial SKILL: 8
   Initial STAMINA: 20
   Initial LUCK: 9
   ```

2. **Sections** (multiple formats supported):
   ```
   Section 1: Title Here
   [1] Title Here
   1. Title Here
   ```

3. **Choices** (navigation):
   ```
   If you want to fight, turn to 5.
   To run away, go to 10.
   ```

4. **Combat**:
   ```
   A GOBLIN attacks! SKILL 6 STAMINA 8
   ```

5. **Endings**:
   - Section 999 = Traditional death
   - Keywords: "you have won", "victory", "you have died", "game over"

## 📖 Full Documentation

For complete formatting guidelines, examples, and best practices, see:

**[ADVENTURE_FORMAT_GUIDE.md](./ADVENTURE_FORMAT_GUIDE.md)**

This comprehensive guide includes:
- Detailed format specifications
- Multiple examples
- Advanced features (items, luck tests, stat modifications)
- Tips for writing great adventures
- Common mistakes to avoid
- Submission checklist

## 🚀 Getting Started

### For Non-Technical Users

1. **Open the web tool**: Double-click `formatter.html`
2. **Use an example**: Click "Simple Adventure" to load a template
3. **Edit the text**: Replace with your own adventure
4. **Validate**: Click "Validate" to check for errors
5. **Convert**: Click "Convert to JSON" when ready
6. **Download**: Save your formatted adventure

### For Developers

1. **Install Node.js** (if not already installed)
2. **Navigate to project folder**
   ```bash
   cd /path/to/turbo-palm-tree
   ```
3. **Run the CLI tool**
   ```bash
   node formatAdventure.js validate your-file.txt
   node formatAdventure.js convert your-file.txt output.json
   ```

## ✨ Features

### Web Tool
- ✅ Live validation with color-coded feedback
- ✅ Section-by-section preview
- ✅ Adventure statistics dashboard
- ✅ One-click JSON conversion
- ✅ Built-in examples
- ✅ Copy/download JSON output
- ✅ No installation required

### CLI Tool
- ✅ Batch processing capability
- ✅ Detailed validation reports
- ✅ Automated conversion
- ✅ CI/CD integration friendly
- ✅ Color-coded terminal output

## 🎯 Common Use Cases

### Writing a New Adventure
1. Start with the template example
2. Write your sections in plain text
3. Use the validator frequently to catch issues early
4. Convert to JSON when complete

### Converting Existing Adventures
1. Load your existing text file
2. Run validation to identify issues
3. Fix any broken links or missing sections
4. Convert to JSON format

### Quality Assurance
1. Use "Check" command to find potential issues
2. Review section numbering gaps
3. Identify unreachable sections
4. Balance choice distribution

## 🐛 Troubleshooting

### "No sections found"
- Make sure you use a recognized section format:
  - `Section 1:` or `[1]` or `1.` at the start of a line

### "Broken links"
- All choices must point to existing sections
- Use section 999 for death endings

### "Missing Section 1"
- Every adventure must start with Section 1
- This is where the game begins

### Combat not detected
- Use format: `ENEMY_NAME SKILL X STAMINA Y`
- Enemy name should be in CAPITALS
- Example: `GOBLIN SKILL 6 STAMINA 8`

## 📦 Files Included

- **`formatter.html`** - Web-based formatter (open in browser)
- **`formatAdventure.js`** - CLI tool (Node.js)
- **`ADVENTURE_FORMAT_GUIDE.md`** - Complete formatting guide
- **`FORMATTER_README.md`** - This file

## 🤝 Contributing

Found a bug or have a suggestion?
- The formatter validates against the same rules the app uses
- Report issues or contribute improvements via the repository

## 📄 License

This tool is part of the Fighting Fantasy gamebook app project.

## 🎲 Happy Writing!

Start creating amazing adventures today! Remember:
- Keep sections concise (200-300 words)
- Provide meaningful choices (2-4 per section)
- Balance combat difficulty
- Create multiple endings
- Test your adventure thoroughly

**Need help?** Check the full guide: [ADVENTURE_FORMAT_GUIDE.md](./ADVENTURE_FORMAT_GUIDE.md)

---

**Quick Links:**
- [Web Formatter](./formatter.html) - Open in browser
- [Format Guide](./ADVENTURE_FORMAT_GUIDE.md) - Complete documentation
- [Example Adventure](./example-adventure.txt) - See a working example
