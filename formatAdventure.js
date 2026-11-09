#!/usr/bin/env node

/**
 * Adventure Formatter Tool
 *
 * This tool helps users format their adventures/books properly for the app.
 * It validates format, identifies issues, and can convert between TXT and JSON formats.
 *
 * Usage:
 *   node formatAdventure.js validate <file>           - Validate an adventure file
 *   node formatAdventure.js convert <file> [output]   - Convert TXT to JSON
 *   node formatAdventure.js check <file>              - Check for common issues
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function parseMetadata(text) {
  const metadata = {
    title: '',
    author: '',
    description: '',
    initialSkill: 6,
    initialStamina: 14,
    initialLuck: 6,
  };

  const titleMatch = text.match(/(?:Title|TITLE|Adventure):\s*(.+)/i);
  const authorMatch = text.match(/(?:Author|By):\s*(.+)/i);
  const descMatch = text.match(/(?:Description|Desc):\s*(.+)/i);
  const skillMatch = text.match(/(?:Initial\s+)?SKILL:\s*(\d+)/i);
  const staminaMatch = text.match(/(?:Initial\s+)?STAMINA:\s*(\d+)/i);
  const luckMatch = text.match(/(?:Initial\s+)?LUCK:\s*(\d+)/i);

  if (titleMatch) metadata.title = titleMatch[1].trim();
  if (authorMatch) metadata.author = authorMatch[1].trim();
  if (descMatch) metadata.description = descMatch[1].trim();
  if (skillMatch) metadata.initialSkill = parseInt(skillMatch[1]);
  if (staminaMatch) metadata.initialStamina = parseInt(staminaMatch[1]);
  if (luckMatch) metadata.initialLuck = parseInt(luckMatch[1]);

  return metadata;
}

function findSections(text) {
  // Matches various section header formats. Colons and punctuation are OPTIONAL.
  // Supported formats: "Section 1", "Section 1:", "## SECTION 1 {#section-1}", "[1]", "(1)", "1.", "**1**", etc.
  const sectionRegex = /(?:^#+\s*(?:Section|SECTION)\s+(\d+)(?:\s*\{[^}]*\})?|^(?:Section|SECTION)\s+(\d+)\s*(?:\]|:|\.|–|—)?|^\s*\[(\d+)\]|^\s*\((\d+)\)|^(\d+)[\.:]\s|^\s*\*\*(\d+)\*\*|^\s*(\d+)\s*$)/gim;
  const sections = [];
  let match;

  while ((match = sectionRegex.exec(text)) !== null) {
    const sectionNum = parseInt(match[1] || match[2] || match[3] || match[4] || match[5] || match[6] || match[7]);
    sections.push({
      id: sectionNum,
      position: match.index,
      matchText: match[0],
      weak: !!match[5],
      explicit: !!(match[1] || match[2]),
    });
  }

  // A bare "1." / "1:" line is ambiguous: it is also how numbered lists inside a section are
  // written. If the text uses explicit "Section N" headers, ignore the bare form so list items
  // don't become duplicate sections.
  if (sections.some(s => s.explicit)) {
    return sections.filter(s => !s.weak);
  }

  return sections;
}

function parseCondition(conditionStr) {
  const conditions = {};

  // Parse skill/stamina/luck conditions: skill>7, stamina>=10, luck<5
  const statMatch = conditionStr.match(/(skill|stamina|luck)\s*([><=]+)\s*(\d+)/i);
  if (statMatch) {
    const stat = statMatch[1].toLowerCase();
    const operator = statMatch[2];
    const value = parseInt(statMatch[3]);

    if (operator === '>') {
      conditions[`requiresMin${stat.charAt(0).toUpperCase() + stat.slice(1)}`] = value + 1;
    } else if (operator === '>=') {
      conditions[`requiresMin${stat.charAt(0).toUpperCase() + stat.slice(1)}`] = value;
    } else if (operator === '<') {
      conditions[`requiresMax${stat.charAt(0).toUpperCase() + stat.slice(1)}`] = value - 1;
    } else if (operator === '<=') {
      conditions[`requiresMax${stat.charAt(0).toUpperCase() + stat.slice(1)}`] = value;
    }
  }

  // Parse item requirement: hasItem=magic-key
  const itemMatch = conditionStr.match(/hasItem\s*=\s*([a-z0-9-]+)/i);
  if (itemMatch) {
    conditions.requiresItem = itemMatch[1];
  }

  return Object.keys(conditions).length > 0 ? conditions : undefined;
}

function extractSectionContent(text, sections) {
  const parsed = [];

  for (let i = 0; i < sections.length; i++) {
    const current = sections[i];
    const next = sections[i + 1];

    const startPos = current.position + current.matchText.length;
    const endPos = next ? next.position : text.length;
    const content = text.substring(startPos, endPos).trim();

    // Extract title (first line if it exists)
    const lines = content.split('\n');
    const titleMatch = lines[0]?.match(/^([^\n]+?)(?:\n|$)/);
    const title = titleMatch && titleMatch[1].length < 100 ? titleMatch[1].trim() : '';

    // Extract choices
    // FIRST: Try marker-based choices
    const choiceMarkers = parseMarkers(content, 'choice');
    const choices = [];

    for (const marker of choiceMarkers) {
      const targetSection = parseInt(marker.value);
      const choice = {
        targetSection: targetSection,
        text: marker.attributes.text || marker.value,
      };

      // Add conditions if present
      if (marker.attributes.if) {
        choice.conditions = parseCondition(marker.attributes.if);
      }

      choices.push(choice);
    }

    // SECOND: Fall back to pattern detection
    const choiceRegex = /(?:(?:turn|go|proceed|move|continue|head|return)(?:\s+(?:to|back to|forward to))?\s+(?:section\s+)?(\d+)|\[(\d+)\]\([^\)]*\))/gi;
    let choiceMatch;

    while ((choiceMatch = choiceRegex.exec(content)) !== null) {
      const targetSection = parseInt(choiceMatch[1] || choiceMatch[2]);
      // Avoid duplicates from markers
      if (!choices.some(c => c.targetSection === targetSection)) {
        choices.push({
          targetSection: targetSection,
          text: choiceMatch[0],
        });
      }
    }

    // Extract combat
    // FIRST: Try marker-based combat
    const combatMarkers = parseMarkers(content, 'combat');
    let combat = null;

    if (combatMarkers.length > 0) {
      // Support multiple enemies
      const combatArray = combatMarkers.map(marker => {
        const combatData = {
          enemyName: marker.value,
          enemySkill: parseInt(marker.attributes.skill),
          enemyStamina: parseInt(marker.attributes.stamina),
        };

        // Optional attributes
        if (marker.attributes.onVictory) {
          combatData.onVictorySection = parseInt(marker.attributes.onVictory);
        }
        if (marker.attributes.onDefeat) {
          combatData.onDefeatSection = parseInt(marker.attributes.onDefeat);
        }
        if (marker.attributes.canFlee === 'true') {
          combatData.canFlee = true;
          if (marker.attributes.fleeSection) {
            combatData.fleeSection = parseInt(marker.attributes.fleeSection);
          }
        }

        return combatData;
      });

      combat = combatArray.length === 1 ? combatArray[0] : combatArray;
    }

    // SECOND: Fall back to pattern detection if no marker combat found
    if (!combat) {
      const combatMatch = content.match(/([A-Z\s]+?)\s+(?:SKILL|Skill)\s+(\d+)(?:,|\s+)(?:STAMINA|Stamina)\s+(\d+)/i);

      if (combatMatch) {
        combat = {
          enemyName: combatMatch[1].trim(),
          enemySkill: parseInt(combatMatch[2]),
          enemyStamina: parseInt(combatMatch[3]),
        };
      }
    }

    // Extract items
    const items = extractItems(content);

    // Check for endings
    const endingMatch = content.match(/(?:you have won|victory|you have succeeded|the end|you have died|you are dead|game over)/i);
    const isEnding = current.id === 999 || current.id === 400 || endingMatch !== null;

    parsed.push({
      id: current.id,
      title,
      text: content,
      choices,
      combat,
      items,
      isEnding,
      lineNumber: text.substring(0, current.position).split('\n').length,
    });
  }

  return parsed;
}

function parseMarkers(content, type) {
  const results = [];

  // Marker format: {type: data | attr=value | attr=value}
  const markerRegex = new RegExp(`\\{(${type}):\\s*([^}]+)\\}`, 'gi');
  let match;

  while ((match = markerRegex.exec(content)) !== null) {
    const markerType = match[1].toLowerCase();
    const markerData = match[2];

    // Parse attributes separated by |
    const parts = markerData.split('|').map(p => p.trim());
    const mainValue = parts[0];
    const attributes = {};

    // Parse key=value attributes
    for (let i = 1; i < parts.length; i++) {
      const attrMatch = parts[i].match(/^(\w+)=(.+)$/);
      if (attrMatch) {
        attributes[attrMatch[1].trim()] = attrMatch[2].trim();
      } else {
        // If no =, treat as description or text
        attributes.text = parts[i];
      }
    }

    results.push({
      type: markerType,
      value: mainValue,
      attributes,
      fullMatch: match[0],
      index: match.index,
    });
  }

  return results;
}

function extractItemsFromMarkers(content) {
  const items = [];
  const processedItems = new Set();

  // Extract {item:...}, {loot:...}, and {treasure:...} markers
  const itemMarkers = parseMarkers(content, 'item|loot|treasure');

  for (const marker of itemMarkers) {
    const itemName = marker.value;
    const itemId = itemName.toLowerCase().replace(/\s+/g, '-');

    if (processedItems.has(itemId)) continue;
    processedItems.add(itemId);

    // Determine type from marker attributes or marker type
    let itemType = marker.attributes.type || 'other';
    if (marker.type === 'treasure') {
      itemType = 'treasure';
    } else if (marker.type === 'loot' && !marker.attributes.type) {
      itemType = 'other';
    }

    // Auto-detect type from item name if not specified
    if (!marker.attributes.type || itemType === 'other') {
      const lowerName = itemName.toLowerCase();
      if (lowerName.includes('sword') || lowerName.includes('axe') || lowerName.includes('bow') ||
          lowerName.includes('dagger') || lowerName.includes('weapon')) {
        itemType = 'weapon';
      } else if (lowerName.includes('shield') || lowerName.includes('armor') || lowerName.includes('helmet')) {
        itemType = 'armor';
      } else if (lowerName.includes('potion') || lowerName.includes('elixir')) {
        itemType = 'potion';
      } else if (lowerName.includes('key')) {
        itemType = 'key';
      } else if (lowerName.includes('gold') || lowerName.includes('coin') || lowerName.includes('gem') ||
                 lowerName.includes('treasure')) {
        itemType = 'treasure';
      }
    }

    // Capitalize item name
    const capitalizedName = itemName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    const item = {
      id: itemId,
      name: capitalizedName,
      type: itemType,
    };

    // Add bonus/restore if specified
    if (marker.attributes.bonus) {
      item.bonus = marker.attributes.bonus;
    }
    if (marker.attributes.restore) {
      item.restore = marker.attributes.restore;
    }

    items.push(item);
  }

  return items;
}

function extractItems(content) {
  const items = [];

  // FIRST: Try to extract items from markers (highest priority)
  const markerItems = extractItemsFromMarkers(content);
  items.push(...markerItems);

  // SECOND: Fall back to pattern detection for unmarked items
  // Define item keywords for better detection
  const itemNouns = [
    'sword', 'axe', 'bow', 'dagger', 'blade', 'staff', 'wand', 'mace', 'spear', 'crossbow',
    'shield', 'helmet', 'armor', 'mail', 'breastplate', 'gauntlet', 'boots',
    'potion', 'elixir', 'tonic', 'brew',
    'key', 'ring', 'amulet', 'scroll', 'map', 'book', 'rope', 'torch', 'lantern',
    'treasure', 'loot', 'gems', 'jewels', 'diamond', 'ruby', 'emerald', 'sapphire'
  ];

  const adjectives = [
    'healing', 'magic', 'enchanted', 'rusty', 'golden', 'silver', 'iron', 'bronze',
    'steel', 'ancient', 'old', 'new', 'heavy', 'light', 'sharp', 'dull', 'bright',
    'dark', 'mysterious', 'cursed', 'blessed', 'holy'
  ];

  const itemTypeKeywords = {
    weapon: ['sword', 'axe', 'bow', 'dagger', 'blade', 'staff', 'wand', 'mace', 'spear', 'crossbow'],
    armor: ['shield', 'helmet', 'armor', 'mail', 'breastplate', 'gauntlet', 'boots'],
    potion: ['potion', 'elixir', 'tonic', 'brew'],
    treasure: ['gold', 'coins', 'gems', 'treasure', 'jewel', 'jewels', 'diamond', 'ruby', 'emerald', 'loot', 'sapphire'],
    key: ['key'],
    other: ['ring', 'amulet', 'scroll', 'map', 'book', 'rope', 'torch', 'lantern'],
  };

  // Track already-processed items (including those from markers)
  const processedItems = new Set(markerItems.map(item => item.id));

  // Pattern 1: "[number] gold coins" or "[number] coins"
  const goldPattern = /(\d+)\s+(?:gold\s+)?coins?/gi;
  let match;
  while ((match = goldPattern.exec(content)) !== null) {
    const count = match[1];
    const itemId = `${count}-gold-coins`;
    if (!processedItems.has(itemId)) {
      processedItems.add(itemId);
      items.push({
        id: itemId,
        name: `${count} Gold Coins`,
        type: 'treasure',
      });
    }
  }

  // Pattern 2: "you [verb] (a/an/the) [adjective?] [item-noun]"
  const actionVerbs = 'find|discover|gain|obtain|receive|pick\\s+up|take|grab|acquire';
  const adjectivePattern = `(?:${adjectives.join('|')})?`;
  const itemPattern = `(?:${itemNouns.join('|')})`;

  const actionItemRegex = new RegExp(
    `(?:you\\s+(?:${actionVerbs})\\s+(?:a|an|the)?\\s*)` +
    `(${adjectivePattern}\\s*${itemPattern})`,
    'gi'
  );

  while ((match = actionItemRegex.exec(content)) !== null) {
    let itemName = match[1].trim();

    // Skip if empty
    if (!itemName) continue;

    // Clean up multiple spaces
    itemName = itemName.replace(/\s+/g, ' ');

    // Generate item ID
    const itemId = itemName.toLowerCase().replace(/\s+/g, '-');

    // Avoid duplicates
    if (processedItems.has(itemId)) {
      continue;
    }
    processedItems.add(itemId);

    // Determine item type (check for exact noun matches first, prioritizing specific types)
    let itemType = 'other';
    const lowerItemName = itemName.toLowerCase();
    const words = lowerItemName.split(/\s+/);

    // Check last word first (usually the noun)
    const lastWord = words[words.length - 1];
    let typeFound = false;

    for (const [type, keywords] of Object.entries(itemTypeKeywords)) {
      if (keywords.includes(lastWord)) {
        itemType = type;
        typeFound = true;
        break;
      }
    }

    // If no exact match on last word, check all words
    if (!typeFound) {
      for (const [type, keywords] of Object.entries(itemTypeKeywords)) {
        if (keywords.some(keyword => lowerItemName.includes(keyword))) {
          itemType = type;
          break;
        }
      }
    }

    // Capitalize item name properly
    const capitalizedName = itemName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    items.push({
      id: itemId,
      name: capitalizedName,
      type: itemType,
    });
  }

  // Pattern 3: Direct mentions "a/an/the [adjective?] [item-noun]" (without action verbs)
  const directItemRegex = new RegExp(
    `\\b(?:a|an|the)\\s+(${adjectivePattern}\\s*${itemPattern})\\b`,
    'gi'
  );

  while ((match = directItemRegex.exec(content)) !== null) {
    let itemName = match[1].trim();

    // Skip if empty
    if (!itemName) continue;

    // Clean up multiple spaces
    itemName = itemName.replace(/\s+/g, ' ');

    // Generate item ID
    const itemId = itemName.toLowerCase().replace(/\s+/g, '-');

    // Avoid duplicates
    if (processedItems.has(itemId)) {
      continue;
    }
    processedItems.add(itemId);

    // Determine item type (check for exact noun matches first, prioritizing specific types)
    let itemType = 'other';
    const lowerItemName = itemName.toLowerCase();
    const words = lowerItemName.split(/\s+/);

    // Check last word first (usually the noun)
    const lastWord = words[words.length - 1];
    let typeFound = false;

    for (const [type, keywords] of Object.entries(itemTypeKeywords)) {
      if (keywords.includes(lastWord)) {
        itemType = type;
        typeFound = true;
        break;
      }
    }

    // If no exact match on last word, check all words
    if (!typeFound) {
      for (const [type, keywords] of Object.entries(itemTypeKeywords)) {
        if (keywords.some(keyword => lowerItemName.includes(keyword))) {
          itemType = type;
          break;
        }
      }
    }

    // Capitalize item name properly
    const capitalizedName = itemName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    items.push({
      id: itemId,
      name: capitalizedName,
      type: itemType,
    });
  }

  return items;
}

function listItems(filePath) {
  log('\n📦 Listing All Items...', 'cyan');
  log('='.repeat(50), 'cyan');

  // Read the JSON file
  let adventure;
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    adventure = JSON.parse(data);
  } catch (error) {
    log(`❌ Error reading JSON file: ${error.message}`, 'red');
    return;
  }

  // Collect all items from all sections
  const allItems = new Map(); // Use Map to avoid duplicates by ID
  let totalItemOccurrences = 0;

  if (adventure.sections) {
    adventure.sections.forEach(section => {
      if (section.addItems && Array.isArray(section.addItems)) {
        section.addItems.forEach(item => {
          totalItemOccurrences++;

          // Track which sections have this item
          if (allItems.has(item.id)) {
            const existing = allItems.get(item.id);
            existing.sections.push(section.id);
          } else {
            allItems.set(item.id, {
              ...item,
              sections: [section.id],
            });
          }
        });
      }
    });
  }

  if (allItems.size === 0) {
    log('\n⚠️  No items found in this adventure.', 'yellow');
    log('='.repeat(50) + '\n', 'cyan');
    return;
  }

  // Display items in a formatted table
  log(`\n✅ Found ${allItems.size} unique items (${totalItemOccurrences} total occurrences)\n`, 'green');

  // Header
  log('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan');
  log('│ ID                      │ Name            │ Type      │ Stats/Bonus       │', 'cyan');
  log('├─────────────────────────────────────────────────────────────────────────────┤', 'cyan');

  // Sort items by ID for consistent display
  const sortedItems = Array.from(allItems.values()).sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  sortedItems.forEach(item => {
    const id = (item.id || 'unknown').padEnd(23).substring(0, 23);
    const name = (item.name || 'Unknown').padEnd(15).substring(0, 15);
    const type = (item.type || 'other').padEnd(9).substring(0, 9);

    // Build stats string
    let stats = '';
    if (item.bonus) stats += `Bonus: ${item.bonus}`;
    if (item.restore) stats += (stats ? ', ' : '') + `Restore: ${item.restore}`;
    if (!stats) stats = '-';
    stats = stats.padEnd(17).substring(0, 17);

    log(`│ ${id} │ ${name} │ ${type} │ ${stats} │`, 'reset');

    // Show sections where this item appears
    const sectionList = item.sections.join(', ');
    const sectionStr = `  Found in section${item.sections.length > 1 ? 's' : ''}: ${sectionList}`;
    log(`│ ${sectionStr.padEnd(75).substring(0, 75)} │`, 'blue');
    log('├─────────────────────────────────────────────────────────────────────────────┤', 'cyan');
  });

  log('└─────────────────────────────────────────────────────────────────────────────┘\n', 'cyan');

  // Summary by type
  const typeCount = {};
  sortedItems.forEach(item => {
    const type = item.type || 'other';
    typeCount[type] = (typeCount[type] || 0) + 1;
  });

  log('Summary by Type:', 'bold');
  Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    log(`  ${type.padEnd(10)}: ${count}`, 'blue');
  });

  log('\n' + '='.repeat(50) + '\n', 'cyan');
}

function updateItem(filePath, itemId, updates) {
  log('\n🔧 Updating Item...', 'cyan');
  log('='.repeat(50), 'cyan');

  // Read the JSON file
  let adventure;
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    adventure = JSON.parse(data);
  } catch (error) {
    log(`❌ Error reading JSON file: ${error.message}`, 'red');
    return;
  }

  // Track how many items were updated
  let updatedCount = 0;
  let sectionsUpdated = [];

  // Find and update items in all sections
  if (adventure.sections) {
    adventure.sections.forEach(section => {
      if (section.addItems && Array.isArray(section.addItems)) {
        section.addItems.forEach(item => {
          if (item.id === itemId) {
            // Apply updates
            if (updates.name !== undefined) item.name = updates.name;
            if (updates.type !== undefined) item.type = updates.type;
            if (updates.bonus !== undefined) {
              if (updates.bonus === 'remove') {
                delete item.bonus;
              } else {
                item.bonus = updates.bonus;
              }
            }
            if (updates.restore !== undefined) {
              if (updates.restore === 'remove') {
                delete item.restore;
              } else {
                item.restore = updates.restore;
              }
            }

            updatedCount++;
            sectionsUpdated.push(section.id);
          }
        });
      }
    });
  }

  if (updatedCount === 0) {
    log(`\n❌ Item with ID "${itemId}" not found in the adventure.`, 'red');
    log('='.repeat(50) + '\n', 'cyan');
    return;
  }

  // Write back to file
  try {
    fs.writeFileSync(filePath, JSON.stringify(adventure, null, 2));
    log(`\n✅ Successfully updated ${updatedCount} occurrence${updatedCount > 1 ? 's' : ''} of item "${itemId}"`, 'green');
    log(`   Updated in section${sectionsUpdated.length > 1 ? 's' : ''}: ${sectionsUpdated.join(', ')}`, 'blue');

    // Show what was changed
    log('\nChanges applied:', 'cyan');
    if (updates.name !== undefined) log(`  name: "${updates.name}"`, 'green');
    if (updates.type !== undefined) log(`  type: "${updates.type}"`, 'green');
    if (updates.bonus !== undefined) {
      if (updates.bonus === 'remove') {
        log(`  bonus: [removed]`, 'yellow');
      } else {
        log(`  bonus: "${updates.bonus}"`, 'green');
      }
    }
    if (updates.restore !== undefined) {
      if (updates.restore === 'remove') {
        log(`  restore: [removed]`, 'yellow');
      } else {
        log(`  restore: "${updates.restore}"`, 'green');
      }
    }

    log(`\n📄 File saved: ${filePath}`, 'green');
  } catch (error) {
    log(`\n❌ Error writing file: ${error.message}`, 'red');
  }

  log('='.repeat(50) + '\n', 'cyan');
}

function validateAdventure(filePath) {
  log('\n📚 Validating Adventure File...', 'cyan');
  log('='.repeat(50), 'cyan');

  const text = fs.readFileSync(filePath, 'utf-8');
  const metadata = parseMetadata(text);
  const sections = findSections(text);
  const parsedSections = extractSectionContent(text, sections);

  const issues = [];
  const warnings = [];

  // Check metadata
  if (!metadata.title) {
    issues.push('❌ Missing title (add "Title: Your Adventure Name")');
  } else {
    log(`✅ Title: ${metadata.title}`, 'green');
  }

  if (!metadata.author) {
    warnings.push('⚠️  Missing author (optional: add "Author: Your Name")');
  } else {
    log(`✅ Author: ${metadata.author}`, 'green');
  }

  log(`✅ Initial Stats - SKILL: ${metadata.initialSkill}, STAMINA: ${metadata.initialStamina}, LUCK: ${metadata.initialLuck}`, 'green');

  // Check sections
  if (parsedSections.length === 0) {
    issues.push('❌ No sections found! Use format "Section 1", "Section 1:", "## SECTION 1", "[1]", or "1." to mark sections');
  } else {
    log(`\n✅ Found ${parsedSections.length} sections`, 'green');
  }

  // Check for section 1
  const hasSection1 = parsedSections.some(s => s.id === 1);
  if (!hasSection1 && parsedSections.length > 0) {
    issues.push('❌ Missing Section 1 (starting section). Adventures should start with section 1.');
  }

  // Check for duplicate sections
  const sectionIds = parsedSections.map(s => s.id);
  const duplicates = sectionIds.filter((id, index) => sectionIds.indexOf(id) !== index);

  if (duplicates.length > 0) {
    issues.push(`❌ Duplicate sections found: ${[...new Set(duplicates)].join(', ')}`);
  }

  // Validate choice references
  const allIds = new Set(sectionIds);
  const unreferencedSections = new Set(sectionIds);
  const brokenLinks = [];

  parsedSections.forEach(section => {
    section.choices.forEach(choice => {
      unreferencedSections.delete(choice.targetSection);

      if (!allIds.has(choice.targetSection) && choice.targetSection !== 999) {
        brokenLinks.push(`Section ${section.id} → ${choice.targetSection} (missing)`);
      }
    });
  });

  if (brokenLinks.length > 0) {
    issues.push(`❌ Broken links found:\n   ${brokenLinks.slice(0, 5).join('\n   ')}${brokenLinks.length > 5 ? `\n   ... and ${brokenLinks.length - 5} more` : ''}`);
  }

  // Check for unreachable sections (except section 1 and 0)
  const unreachable = [...unreferencedSections].filter(id => id !== 1 && id !== 0);
  if (unreachable.length > 0) {
    warnings.push(`⚠️  Unreachable sections (not linked from anywhere): ${unreachable.slice(0, 5).join(', ')}${unreachable.length > 5 ? ` ... and ${unreachable.length - 5} more` : ''}`);
  }

  // Check for sections without choices (dead ends)
  const deadEnds = parsedSections.filter(s => s.choices.length === 0 && !s.isEnding);
  if (deadEnds.length > 0) {
    warnings.push(`⚠️  Sections without choices (potential dead ends): ${deadEnds.slice(0, 3).map(s => s.id).join(', ')}${deadEnds.length > 3 ? ` ... and ${deadEnds.length - 3} more` : ''}`);
  }

  // Display results
  log('\n' + '='.repeat(50), 'cyan');

  if (issues.length === 0) {
    log('\n✅ VALIDATION PASSED!', 'green');
    log('Your adventure is properly formatted and ready to use!', 'green');
  } else {
    log('\n❌ VALIDATION FAILED', 'red');
    log('\nCritical Issues:', 'red');
    issues.forEach(issue => log(issue, 'red'));
  }

  if (warnings.length > 0) {
    log('\nWarnings:', 'yellow');
    warnings.forEach(warning => log(warning, 'yellow'));
  }

  // Summary
  log('\n' + '='.repeat(50), 'cyan');
  log('Summary:', 'cyan');
  log(`  Sections: ${parsedSections.length}`, 'blue');
  log(`  Total choices: ${parsedSections.reduce((sum, s) => sum + s.choices.length, 0)}`, 'blue');
  log(`  Combat encounters: ${parsedSections.filter(s => s.combat).length}`, 'blue');
  log(`  Items detected: ${parsedSections.reduce((sum, s) => sum + (s.items ? s.items.length : 0), 0)}`, 'blue');
  log(`  Endings: ${parsedSections.filter(s => s.isEnding).length}`, 'blue');
  log('='.repeat(50) + '\n', 'cyan');

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    metadata,
    sections: parsedSections,
  };
}

function convertToJSON(filePath, outputPath) {
  log('\n🔄 Converting Adventure to JSON...', 'cyan');
  log('='.repeat(50), 'cyan');

  const text = fs.readFileSync(filePath, 'utf-8');
  const metadata = parseMetadata(text);
  const sections = findSections(text);
  const parsedSections = extractSectionContent(text, sections);

  // Build JSON structure
  const jsonAdventure = {
    id: metadata.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    title: metadata.title,
    author: metadata.author,
    description: metadata.description,
    startingSection: 1,
    initialStats: {
      skill: metadata.initialSkill,
      stamina: metadata.initialStamina,
      luck: metadata.initialLuck,
    },
    sections: parsedSections.map(section => {
      const jsonSection = {
        id: section.id,
        text: section.text,
      };

      if (section.title) {
        jsonSection.title = section.title;
      }

      if (section.choices.length > 0) {
        jsonSection.choices = section.choices.map(choice => ({
          text: choice.text,
          targetSection: choice.targetSection,
        }));
      }

      if (section.combat) {
        jsonSection.combat = {
          enemyName: section.combat.enemyName,
          enemySkill: section.combat.enemySkill,
          enemyStamina: section.combat.enemyStamina,
          onVictorySection: section.choices[0]?.targetSection || section.id + 1,
          onDefeatSection: 999,
        };
      }

      if (section.items && section.items.length > 0) {
        jsonSection.addItems = section.items;
      }

      if (section.isEnding) {
        jsonSection.isEnding = true;

        // Determine ending type
        if (section.id === 999 || section.text.match(/you have died|you are dead|game over/i)) {
          jsonSection.endingType = 'defeat';
        } else if (section.text.match(/you have won|victory|you have succeeded/i)) {
          jsonSection.endingType = 'victory';
        } else {
          jsonSection.endingType = 'neutral';
        }
      }

      return jsonSection;
    }),
  };

  // Determine output path
  const output = outputPath || filePath.replace(/\.(txt|md)$/i, '.json');

  fs.writeFileSync(output, JSON.stringify(jsonAdventure, null, 2));

  log(`\n✅ Successfully converted to JSON!`, 'green');
  log(`📄 Output file: ${output}`, 'green');
  log('='.repeat(50) + '\n', 'cyan');

  return jsonAdventure;
}

function checkForIssues(filePath) {
  log('\n🔍 Checking for Common Issues...', 'cyan');
  log('='.repeat(50), 'cyan');

  const text = fs.readFileSync(filePath, 'utf-8');
  const sections = findSections(text);
  const parsedSections = extractSectionContent(text, sections);

  const issues = [];

  // Check section numbering gaps
  const sortedIds = [...new Set(parsedSections.map(s => s.id))].sort((a, b) => a - b);
  const gaps = [];

  for (let i = 0; i < sortedIds.length - 1; i++) {
    const diff = sortedIds[i + 1] - sortedIds[i];
    if (diff > 1) {
      gaps.push(`Gap between section ${sortedIds[i]} and ${sortedIds[i + 1]} (${diff - 1} sections missing)`);
    }
  }

  if (gaps.length > 0) {
    log('\n⚠️  Section numbering gaps:', 'yellow');
    gaps.forEach(gap => log(`   ${gap}`, 'yellow'));
  }

  // Check for very short sections
  const shortSections = parsedSections.filter(s => s.text.length < 50);
  if (shortSections.length > 0) {
    log('\n⚠️  Very short sections (might need more content):', 'yellow');
    shortSections.slice(0, 5).forEach(s => {
      log(`   Section ${s.id}: "${s.text.substring(0, 40)}..."`, 'yellow');
    });
  }

  // Check for sections with many choices
  const manyChoices = parsedSections.filter(s => s.choices.length > 4);
  if (manyChoices.length > 0) {
    log('\n💡 Sections with many choices (consider splitting):', 'blue');
    manyChoices.forEach(s => {
      log(`   Section ${s.id}: ${s.choices.length} choices`, 'blue');
    });
  }

  // Check for combat without victory section
  const combatNoVictory = parsedSections.filter(s => s.combat && s.choices.length === 0);
  if (combatNoVictory.length > 0) {
    log('\n⚠️  Combat encounters without clear victory path:', 'yellow');
    combatNoVictory.forEach(s => {
      log(`   Section ${s.id}: ${s.combat.enemyName}`, 'yellow');
    });
  }

  // Format recommendations
  log('\n💡 Format Recommendations:', 'blue');
  log('   ✓ Use consistent section headers (e.g., "Section 1", "Section 1:", "## SECTION 1", or "[1]")', 'blue');
  log('   ✓ Colons are optional: both "Section 1" and "Section 1:" work', 'blue');
  log('   ✓ Markdown headers work: "## SECTION 1" or "## SECTION 1 {#section-1}"', 'blue');
  log('   ✓ Each section should have 1-4 choices for good gameplay', 'blue');
  log('   ✓ Include at least one ending (section 999 is traditional death)', 'blue');
  log('   ✓ For combat: "ENEMY_NAME SKILL X STAMINA Y"', 'blue');
  log('   ✓ For choices: "turn to X", "go to X", or markdown "[X](#section-X)"', 'blue');
  log('   ✓ For items: "you find a sword", "you discover 50 gold coins", etc.', 'blue');

  log('\n' + '='.repeat(50) + '\n', 'cyan');
}

function showHelp() {
  log('\n📚 Adventure Formatter Tool', 'cyan');
  log('='.repeat(50), 'cyan');
  log('\nThis tool helps format adventures for the gamebook app.', 'reset');
  log('\nUsage:', 'bold');
  log('  node formatAdventure.js validate <file>           - Validate adventure format', 'reset');
  log('  node formatAdventure.js convert <file> [output]   - Convert TXT to JSON', 'reset');
  log('  node formatAdventure.js check <file>              - Check for common issues', 'reset');
  log('  node formatAdventure.js list-items <file>         - List all items in JSON adventure', 'reset');
  log('  node formatAdventure.js update-item <file> <id>   - Update item properties', 'reset');
  log('\nExamples:', 'bold');
  log('  node formatAdventure.js validate my-adventure.txt', 'reset');
  log('  node formatAdventure.js convert my-adventure.txt my-adventure.json', 'reset');
  log('  node formatAdventure.js check my-adventure.txt', 'reset');
  log('  node formatAdventure.js list-items my-adventure.json', 'reset');
  log('  node formatAdventure.js update-item my-adventure.json silver-key --name="Golden Key"', 'reset');
  log('  node formatAdventure.js update-item my-adventure.json sword --type=weapon --bonus="+2"', 'reset');
  log('\nItem Update Options:', 'bold');
  log('  --name="New Name"    - Update the item name', 'reset');
  log('  --type=<type>        - Update type (weapon, armor, potion, key, treasure, other)', 'reset');
  log('  --bonus=<value>      - Add/update bonus (e.g., "+2", "+1d6")', 'reset');
  log('  --restore=<value>    - Add/update restore value (e.g., "2d6", "4")', 'reset');
  log('  --bonus=remove       - Remove bonus property', 'reset');
  log('  --restore=remove     - Remove restore property', 'reset');
  log('\nSupported Formats:', 'bold');
  log('  Input:  .txt, .md (for validate, convert, check)', 'reset');
  log('  Input:  .json (for list-items, update-item)', 'reset');
  log('  Output: .json', 'reset');
  log('\nFormat Guide:', 'bold');
  log('  - Metadata: "Title: Name", "Author: Name", "Initial SKILL: 6"', 'reset');
  log('  - Sections: "Section 1", "Section 1:", "## SECTION 1", "[1]", "1."', 'reset');
  log('  - Markdown: "## SECTION 1 {#section-1}" (with optional anchor)', 'reset');
  log('  - Choices: "turn to 5", "go to 10", or "[5](#section-5)"', 'reset');
  log('  - Combat: "GOBLIN SKILL 6 STAMINA 8"', 'reset');
  log('  - Items: "you find a sword", "you discover 50 gold coins"', 'reset');
  log('='.repeat(50) + '\n', 'cyan');
}

// Main CLI handler
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  const command = args[0];
  const filePath = args[1];

  if (!filePath) {
    log('❌ Error: Please provide a file path', 'red');
    log('Usage: node formatAdventure.js <command> <file>', 'yellow');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    log(`❌ Error: File not found: ${filePath}`, 'red');
    process.exit(1);
  }

  switch (command) {
    case 'validate':
      validateAdventure(filePath);
      break;

    case 'convert':
      const outputPath = args[2];
      convertToJSON(filePath, outputPath);
      break;

    case 'check':
      checkForIssues(filePath);
      break;

    case 'list-items':
      listItems(filePath);
      break;

    case 'update-item':
      const itemId = args[2];
      if (!itemId) {
        log('❌ Error: Please provide an item ID', 'red');
        log('Usage: node formatAdventure.js update-item <file> <item-id> [options]', 'yellow');
        log('Options: --name="New Name" --type=weapon --bonus="+2" --restore="2d6"', 'yellow');
        process.exit(1);
      }

      // Parse update options
      const updates = {};
      for (let i = 3; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--name=')) {
          updates.name = arg.substring(7).replace(/^["']|["']$/g, '');
        } else if (arg.startsWith('--type=')) {
          updates.type = arg.substring(7).replace(/^["']|["']$/g, '');
        } else if (arg.startsWith('--bonus=')) {
          updates.bonus = arg.substring(8).replace(/^["']|["']$/g, '');
        } else if (arg.startsWith('--restore=')) {
          updates.restore = arg.substring(10).replace(/^["']|["']$/g, '');
        }
      }

      if (Object.keys(updates).length === 0) {
        log('❌ Error: No updates specified', 'red');
        log('Options: --name="New Name" --type=weapon --bonus="+2" --restore="2d6"', 'yellow');
        log('To remove a property: --bonus=remove --restore=remove', 'yellow');
        process.exit(1);
      }

      updateItem(filePath, itemId, updates);
      break;

    default:
      log(`❌ Unknown command: ${command}`, 'red');
      log('Valid commands: validate, convert, check, list-items, update-item', 'yellow');
      showHelp();
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { validateAdventure, convertToJSON, checkForIssues, listItems, updateItem };
