// Importing a book from a file: JSON (any format version), TXT/Markdown and PDF. The text and PDF importers guess
// the structure and produce a book in the OLD format; the reader upgrades it in memory (Engine.upgradeBook).
// For a proper conversion to format v2 use migrate_to_v2.py. Needs `ui.loadBook`, `esc` (reader.js) and, for PDFs, pdf.js.
function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

async function handleFile(file) {
    const fileName = file.name.toLowerCase();

    try {
        if (fileName.endsWith('.json')) {
            await handleJSONFile(file);
        } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
            await handleTextFile(file);
        } else if (fileName.endsWith('.pdf')) {
            await handlePDFFile(file);
        } else {
            showError('Unsupported file format. Please upload JSON, TXT, MD, or PDF files.');
        }
    } catch (err) {
        showError('Error loading file: ' + err.message);
    }
}

function handleJSONFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (validateBook(data)) {
                    ui.loadBook(data);
                    resolve();
                } else {
                    showError('Invalid book format. Please check the JSON structure.');
                    reject(new Error('Invalid format'));
                }
            } catch (err) {
                showError('Error parsing JSON file: ' + err.message);
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function handleTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const book = parseTextAdventure(text);
                if (validateBook(book)) {
                    ui.loadBook(book);
                    resolve();
                } else {
                    showError('Could not parse adventure from text file. Please check the format.');
                    reject(new Error('Invalid format'));
                }
            } catch (err) {
                showError('Error parsing text file: ' + err.message);
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

async function handlePDFFile(file) {
    if (typeof pdfjsLib === 'undefined') {
        showError('PDF.js library not loaded. Cannot parse PDF files.');
        throw new Error('PDF.js not available');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Improved text extraction that preserves line breaks
        let pageText = '';
        let lastY = null;

        for (let j = 0; j < textContent.items.length; j++) {
            const item = textContent.items[j];
            const text = item.str;

            // Get Y coordinate from transform matrix
            const currentY = item.transform[5];

            // Add newline if we're on a different line (Y coordinate changed significantly)
            if (lastY !== null && Math.abs(currentY - lastY) > 5) {
                pageText += '\n';
            } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
                // Add space between items on the same line
                pageText += ' ';
            }

            pageText += text;
            lastY = currentY;
        }

        fullText += pageText + '\n\n';
    }

    // Try to parse as JSON first (in case PDF contains JSON data)
    try {
        const data = JSON.parse(fullText);
        if (validateBook(data)) {
            ui.loadBook(data);
            return;
        }
    } catch (e) {
        // Not JSON, try text parsing
    }

    // Parse as text adventure
    const book = parseTextAdventure(fullText);
    if (validateBook(book)) {
        ui.loadBook(book);
    } else {
        showError('Could not parse adventure from PDF. Please ensure it follows the text format.');
        throw new Error('Invalid format');
    }
}

// Parse markers from content
function parseMarkers(content, type) {
    const results = [];
    const markerRegex = new RegExp(`\\{(${type}):\\s*([^}]+)\\}`, 'gi');
    let match;

    while ((match = markerRegex.exec(content)) !== null) {
        const markerType = match[1].toLowerCase();
        const markerData = match[2];

        const parts = markerData.split('|').map(p => p.trim());
        const mainValue = parts[0];
        const attributes = {};

        for (let i = 1; i < parts.length; i++) {
            const attrMatch = parts[i].match(/^(\w+)=(.+)$/);
            if (attrMatch) {
                attributes[attrMatch[1].trim()] = attrMatch[2].trim();
            } else {
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

// Parse condition string for choices
function parseCondition(conditionStr) {
    const conditions = {};

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

    const itemMatch = conditionStr.match(/hasItem\s*=\s*([a-z0-9-]+)/i);
    if (itemMatch) {
        conditions.requiresItem = itemMatch[1];
    }

    return Object.keys(conditions).length > 0 ? conditions : undefined;
}

// Extract items from markers (highest priority)
function extractItemsFromMarkers(content) {
    const items = [];
    const processedItems = new Set();
    const itemMarkers = parseMarkers(content, 'item|loot|treasure');

    for (const marker of itemMarkers) {
        const itemName = marker.value;
        const itemId = itemName.toLowerCase().replace(/\s+/g, '-');

        if (processedItems.has(itemId)) continue;
        processedItems.add(itemId);

        let itemType = marker.attributes.type || 'other';
        if (marker.type === 'treasure') {
            itemType = 'treasure';
        } else if (marker.type === 'loot' && !marker.attributes.type) {
            itemType = 'other';
        }

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

        const capitalizedName = itemName
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

        const item = {
            id: itemId,
            name: capitalizedName,
            type: itemType,
        };

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

// Extract items from content using 34+ detection patterns (including 8 magic item patterns)
function extractItems(content) {
    // FIRST: Extract items from markers (highest priority)
    const markerItems = extractItemsFromMarkers(content);
    const items = [...markerItems];

    // Track already-processed items (including those from markers)
    const processedItems = new Set(markerItems.map(item => item.id));
    const itemTypeKeywords = {
        weapon: ['sword', 'axe', 'bow', 'dagger', 'blade', 'staff', 'wand', 'mace', 'spear', 'crossbow', 'knife', 'club', 'hammer', 'flail', 'halberd', 'rapier', 'scimitar', 'katana', 'longsword', 'shortsword', 'broadsword', 'claymore', 'saber', 'cutlass'],
        armor: ['shield', 'helmet', 'armor', 'armour', 'mail', 'breastplate', 'gauntlet', 'gauntlets', 'boots', 'greaves', 'chainmail', 'platemail', 'cuirass', 'vambraces'],
        potion: ['potion', 'elixir', 'tonic', 'brew', 'flask', 'vial', 'draught', 'philter'],
        treasure: ['gold', 'coin', 'coins', 'gem', 'gems', 'treasure', 'jewel', 'jewels', 'diamond', 'diamonds', 'ruby', 'rubies', 'emerald', 'emeralds', 'loot', 'sapphire', 'sapphires', 'pearl', 'pearls', 'silver', 'copper', 'platinum', 'crystal', 'crystals'],
        key: ['key', 'keys'],
        other: ['ring', 'amulet', 'scroll', 'map', 'book', 'rope', 'torch', 'lantern', 'charm', 'talisman', 'orb', 'pendant', 'necklace', 'bracelet', 'cloak', 'robe', 'crown', 'scepter', 'relic', 'artifact', 'horn', 'flute', 'lute', 'mirror', 'compass', 'hourglass', 'chalice', 'goblet', 'medallion', 'bread', 'meat', 'cheese', 'food', 'water', 'wine', 'ale', 'rations', 'provisions', 'meal', 'fruit', 'apple', 'berries'],
    };

    const itemNouns = [
        'sword', 'axe', 'bow', 'dagger', 'blade', 'staff', 'wand', 'mace', 'spear', 'crossbow', 'knife', 'club', 'hammer', 'flail', 'halberd', 'rapier', 'scimitar', 'katana', 'longsword', 'shortsword', 'broadsword', 'claymore', 'saber', 'cutlass',
        'shield', 'helmet', 'armor', 'armour', 'mail', 'breastplate', 'gauntlet', 'gauntlets', 'boots', 'greaves', 'chainmail', 'platemail', 'cuirass', 'vambraces',
        'potion', 'elixir', 'tonic', 'brew', 'flask', 'vial', 'draught', 'philter',
        'key', 'keys', 'ring', 'amulet', 'scroll', 'map', 'book', 'rope', 'torch', 'lantern', 'charm', 'talisman', 'orb', 'pendant', 'necklace', 'bracelet', 'cloak', 'robe', 'crown', 'scepter', 'relic', 'artifact', 'horn', 'flute', 'lute', 'mirror', 'compass', 'hourglass', 'chalice', 'goblet', 'medallion',
        'treasure', 'loot', 'gem', 'gems', 'jewel', 'jewels', 'diamond', 'diamonds', 'ruby', 'rubies', 'emerald', 'emeralds', 'sapphire', 'sapphires', 'pearl', 'pearls', 'crystal', 'crystals',
        'bread', 'meat', 'cheese', 'food', 'water', 'wine', 'ale', 'rations', 'provisions', 'meal', 'fruit', 'apple', 'berries'
    ];

    const adjectives = [
        'healing', 'magic', 'magical', 'enchanted', 'rusty', 'golden', 'silver', 'iron', 'bronze',
        'steel', 'ancient', 'old', 'new', 'heavy', 'light', 'sharp', 'dull', 'bright',
        'dark', 'mysterious', 'cursed', 'blessed', 'holy', 'sacred', 'divine', 'demonic',
        'glowing', 'shining', 'shimmering', 'ornate', 'jeweled', 'jewelled', 'decorated',
        'fine', 'crude', 'worn', 'damaged', 'broken', 'mighty', 'powerful', 'legendary',
        'rare', 'common', 'unique', 'special', 'valuable', 'precious', 'worthless',
        'red', 'blue', 'green', 'black', 'white', 'purple', 'crimson', 'azure', 'emerald',
        'fire', 'flame', 'flaming', 'burning', 'blazing', 'ice', 'frozen', 'frost', 'icy',
        'thunder', 'lightning', 'storm', 'wind', 'earth', 'water', 'shadow', 'light',
        'blood', 'soul', 'spirit', 'ghost', 'spectral', 'ethereal', 'arcane', 'mystic',
        'elven', 'dwarven', 'orcish', 'dragon', 'demonic', 'angelic', 'celestial',
        'vorpal', 'keen', 'defender', 'protector', 'slayer', 'bane', 'doom'
    ];

    function addItem(itemName, detectedType = null) {
        if (!itemName || itemName.length < 2) return;

        itemName = itemName.replace(/\s+/g, ' ').trim();
        const itemId = itemName.toLowerCase().replace(/\s+/g, '-');

        if (processedItems.has(itemId)) return;
        processedItems.add(itemId);

        let itemType = detectedType || 'other';
        if (!detectedType) {
            const lowerItemName = itemName.toLowerCase();
            const words = lowerItemName.split(/\s+/);
            const lastWord = words[words.length - 1];

            for (const [type, keywords] of Object.entries(itemTypeKeywords)) {
                if (keywords.includes(lastWord)) {
                    itemType = type;
                    break;
                }
            }
        }

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

    // Pattern 1: "[number] gold/silver/copper coins"
    const coinsPattern = /(\d+)\s+(?:(gold|silver|copper|platinum)\s+)?coins?/gi;
    let match;
    while ((match = coinsPattern.exec(content)) !== null) {
        const count = match[1];
        const coinType = match[2] ? match[2].charAt(0).toUpperCase() + match[2].slice(1) : 'Gold';
        addItem(`${count} ${coinType} Coins`, 'treasure');
    }

    // Pattern 2: "[number] [item]" (e.g., "3 potions", "5 gems")
    const quantityPattern = new RegExp(`(\\d+)\\s+(${itemNouns.join('|')})s?`, 'gi');
    while ((match = quantityPattern.exec(content)) !== null) {
        const count = match[1];
        const itemNoun = match[2];
        if (parseInt(count) > 1) {
            addItem(`${count} ${itemNoun}s`);
        } else {
            addItem(`${count} ${itemNoun}`);
        }
    }

    // Pattern 3: Action verbs - "you [verb] (a/an/the) [item]"
    const actionVerbs = 'find|discover|gain|obtain|receive|pick\\s+up|take|grab|acquire|collect|gather|claim|steal|loot|get|won|win';
    const adjectivePattern = `(?:${adjectives.join('|')}\\s+)*`;
    const itemPattern = `(${adjectivePattern}(?:${itemNouns.join('|')}))`;

    const actionItemRegex = new RegExp(
        `(?:you\\s+(?:${actionVerbs})\\s+(?:a|an|the)?\\s*)${itemPattern}`,
        'gi'
    );

    while ((match = actionItemRegex.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 4: "there is/are (a/an/the) [item]"
    const thereIsPattern = new RegExp(
        `there\\s+(?:is|are)\\s+(?:a|an|the)?\\s*${itemPattern}`,
        'gi'
    );
    while ((match = thereIsPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 5: "you see (a/an/the) [item]"
    const youSeePattern = new RegExp(
        `you\\s+(?:see|spot|notice|observe)\\s+(?:a|an|the)?\\s*${itemPattern}`,
        'gi'
    );
    while ((match = youSeePattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 6: Container phrases - "contains/holds [item]"
    const containerPattern = new RegExp(
        `(?:contain|contains|hold|holds|has|have|hiding|concealing)\\s+(?:a|an|the)?\\s*${itemPattern}`,
        'gi'
    );
    while ((match = containerPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 7: Location phrases - "on/in/under the [location] is/lies [item]"
    const locationPattern = new RegExp(
        `(?:on|in|under|beside|near|behind)\\s+(?:the|a|an)\\s+\\w+\\s+(?:is|lies|sits|rests)\\s+(?:a|an|the)?\\s*${itemPattern}`,
        'gi'
    );
    while ((match = locationPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 8: "[item] lies/sits/rests [somewhere]"
    const itemLocationPattern = new RegExp(
        `(?:a|an|the)?\\s*${itemPattern}\\s+(?:lies|lie|sits|sit|rests|rest)`,
        'gi'
    );
    while ((match = itemLocationPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 9: "armed with/carrying/wielding [item]"
    const equippedPattern = new RegExp(
        `(?:armed\\s+with|carrying|wielding|wearing|equipped\\s+with)\\s+(?:a|an|the)?\\s*${itemPattern}`,
        'gi'
    );
    while ((match = equippedPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 10: "+N [item]" or "[item] +N" (stat modifiers)
    const statModPattern = new RegExp(
        `(?:\\+\\d+\\s+${itemPattern}|${itemPattern}\\s+\\+\\d+)`,
        'gi'
    );
    while ((match = statModPattern.exec(content)) !== null) {
        const itemName = match[1] || match[2];
        if (itemName) addItem(itemName);
    }

    // Pattern 11: Capitalized item names (potential proper items)
    const properNounPattern = new RegExp(
        `(?:the\\s+)?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\s+(?:${itemNouns.join('|')}))`,
        'g'
    );
    while ((match = properNounPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 12: Items in lists - "find: [item], [item], and [item]"
    const listPattern = /(?:find|discover|obtain|contains?|holds?|has|have):\s*([^.!?]+)/gi;
    while ((match = listPattern.exec(content)) !== null) {
        const listContent = match[1];
        const listItems = listContent.split(/,|\sand\s/);
        listItems.forEach(item => {
            const trimmed = item.trim().replace(/^(?:a|an|the)\s+/i, '');
            const itemMatch = trimmed.match(new RegExp(`(${adjectivePattern}(?:${itemNouns.join('|')}))`, 'i'));
            if (itemMatch) {
                addItem(itemMatch[1]);
            }
        });
    }

    // Pattern 13: Reward/Prize items - "Reward: [item]" or "Prize: [item]"
    const rewardPattern = new RegExp(
        `(?:reward|prize|loot|treasure|gift|bounty)\\s*[:=-]?\\s*(?:a|an|the)?\\s*${itemPattern}`,
        'gi'
    );
    while ((match = rewardPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 14: Possessive forms - "your [item]", "his [item]", "their [item]"
    const possessivePattern = new RegExp(
        `(?:your|his|her|their|its|my)\\s+${itemPattern}`,
        'gi'
    );
    while ((match = possessivePattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 15: Short commands - "take [item]", "grab [item]", "use [item]"
    const shortCommandPattern = new RegExp(
        `(?:^|\\s)(?:take|grab|use|equip|wield|drink|eat|consume)\\s+(?:a|an|the)?\\s*${itemPattern}`,
        'gim'
    );
    while ((match = shortCommandPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 16: Bullet/list items - "- sword", "* potion", "• key"
    const bulletItemPattern = new RegExp(
        `^\\s*[\\-\\*•]\\s+(?:a|an|the)?\\s*${itemPattern}`,
        'gim'
    );
    while ((match = bulletItemPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 17: Items in parentheses - "(sword)", "(5 gems)"
    const parenPattern = new RegExp(
        `\\(\\s*(?:\\d+\\s+)?(?:a|an|the)?\\s*${itemPattern}\\s*\\)`,
        'gi'
    );
    while ((match = parenPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 18: Items with stat values - "sword (damage +2)", "shield (+3 defense)"
    const statValuePattern = new RegExp(
        `${itemPattern}\\s*\\([^)]*\\+\\d+[^)]*\\)`,
        'gi'
    );
    while ((match = statValuePattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 19: Items after "have" - "you have [item]"
    const havePattern = new RegExp(
        `(?:you\\s+)?have\\s+(?:a|an|the)?\\s*${itemPattern}`,
        'gi'
    );
    while ((match = havePattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 20: Items with "offers" or "gives" - "he offers you a sword"
    const offersPattern = new RegExp(
        `(?:offer|offers|give|gives|hand|hands|present|presents)\\s+(?:you\\s+)?(?:a|an|the)?\\s*${itemPattern}`,
        'gi'
    );
    while ((match = offersPattern.exec(content)) !== null) {
        addItem(match[1]);
    }

    // Pattern 21: Multiple items with "and" - "sword and shield", "a key and a map"
    const multiAndPattern = new RegExp(
        `(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))\\s+and\\s+(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))`,
        'gi'
    );
    while ((match = multiAndPattern.exec(content)) !== null) {
        if (match[1]) addItem(match[1]);
        if (match[2]) addItem(match[2]);
    }

    // Pattern 22: Three items with "and" - "sword, shield, and helmet"
    const threeItemsPattern = new RegExp(
        `(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))\\s*,\\s*(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))\\s*,?\\s*and\\s+(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))`,
        'gi'
    );
    while ((match = threeItemsPattern.exec(content)) !== null) {
        if (match[1]) addItem(match[1]);
        if (match[2]) addItem(match[2]);
        if (match[3]) addItem(match[3]);
    }

    // Pattern 23: Comma-separated items without "and" - "sword, shield, helmet"
    const commaListPattern = new RegExp(
        `(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))\\s*,\\s*(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))`,
        'gi'
    );
    while ((match = commaListPattern.exec(content)) !== null) {
        if (match[1]) addItem(match[1]);
        if (match[2]) addItem(match[2]);
    }

    // Pattern 24: Items with "or" connector - "take the sword or shield"
    const orPattern = new RegExp(
        `(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))\\s+or\\s+(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))`,
        'gi'
    );
    while ((match = orPattern.exec(content)) !== null) {
        if (match[1]) addItem(match[1]);
        if (match[2]) addItem(match[2]);
    }

    // Pattern 25: Items separated by slashes - "sword/shield/helmet"
    const slashPattern = new RegExp(
        `(${adjectivePattern}(?:${itemNouns.join('|')}))\\s*/\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))`,
        'gi'
    );
    while ((match = slashPattern.exec(content)) !== null) {
        if (match[1]) addItem(match[1]);
        if (match[2]) addItem(match[2]);
    }

    // Pattern 26: Multiple items after action verbs - "you find sword, shield, and potion"
    const multiActionPattern = new RegExp(
        `(?:you\\s+(?:${actionVerbs}))\\s+([^.!?]+)`,
        'gi'
    );
    while ((match = multiActionPattern.exec(content)) !== null) {
        const itemsList = match[1];
        // Extract all items from this list
        const itemMatches = itemsList.matchAll(new RegExp(`(?:a|an|the)?\\s*(${adjectivePattern}(?:${itemNouns.join('|')}))`, 'gi'));
        for (const itemMatch of itemMatches) {
            if (itemMatch[1]) addItem(itemMatch[1]);
        }
    }

    // MAGIC ITEM PATTERNS - Enhanced detection for magical weapons/shields/items

    // Pattern 27: "Item of [Power]" - "Sword of Fire", "Shield of Light", "Ring of Power"
    const ofPowerPattern = new RegExp(
        `(?:the\\s+)?(?:${adjectivePattern})?(${itemNouns.join('|')})\\s+of\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`,
        'g'
    );
    while ((match = ofPowerPattern.exec(content)) !== null) {
        const itemType = match[1];
        const powerName = match[2];
        addItem(`${itemType} of ${powerName}`);
    }

    // Pattern 28: "[Element] Item" - "Fire Sword", "Ice Shield", "Thunder Hammer"
    const elementalPattern = new RegExp(
        `(?:the\\s+)?(fire|flame|ice|frost|thunder|lightning|storm|shadow|light|blood|holy|dark|chaos|void|poison|venom)\\s+(${itemNouns.join('|')})`,
        'gi'
    );
    while ((match = elementalPattern.exec(content)) !== null) {
        const element = match[1];
        const item = match[2];
        addItem(`${element} ${item}`);
    }

    // Pattern 29: "Item +N" or "+N Item" - "Sword +5", "+3 Shield", "Dagger +2"
    const plusPattern = new RegExp(
        `(?:(?:the|a|an)\\s+)?(?:(${adjectivePattern})?\\s*)?(${itemNouns.join('|')})\\s*\\+\\s*(\\d+)|\\+\\s*(\\d+)\\s+(${adjectivePattern})?\\s*(${itemNouns.join('|')})`  ,
        'gi'
    );
    while ((match = plusPattern.exec(content)) !== null) {
        if (match[2]) {
            // "Item +N" format
            const adj = match[1] ? match[1].trim() + ' ' : '';
            const item = match[2];
            const bonus = match[3];
            addItem(`${adj}${item} +${bonus}`);
        } else if (match[6]) {
            // "+N Item" format
            const adj = match[5] ? match[5].trim() + ' ' : '';
            const bonus = match[4];
            const item = match[6];
            addItem(`+${bonus} ${adj}${item}`);
        }
    }

    // Pattern 30: Named legendary items (capitalized) - "Excalibur", "Mjolnir", "Stormbringer"
    // Must be followed by item type or be recognized standalone
    const legendaryPattern = new RegExp(
        `(?:the\\s+)?([A-Z][a-z]+(?:'s)?(?:\\s+[A-Z][a-z]+)*)\\s+(${itemNouns.join('|')})|(?:wield|carry|holding|bearing|wielding)\\s+(?:the\\s+)?([A-Z][a-z]+(?:'s)?(?:\\s+[A-Z][a-z]+)*)`,
        'g'
    );
    while ((match = legendaryPattern.exec(content)) !== null) {
        if (match[1] && match[2]) {
            // "Excalibur sword" format
            addItem(`${match[1]} ${match[2]}`);
        } else if (match[3]) {
            // "wielding Excalibur" format
            addItem(match[3]);
        }
    }

    // Pattern 31: "[Race/Type]'s Item" - "Dragon's Sword", "Elf's Bow", "Giant's Shield"
    const raceItemPattern = new RegExp(
        `(?:the\\s+)?(?:dragon|elf|elven|dwarf|dwarven|giant|orc|orcish|demon|angel|god|titan|king|queen|wizard|mage|warrior|knight|paladin)(?:'s|s'?)\\s+(${adjectivePattern})?\\s*(${itemNouns.join('|')})`,
        'gi'
    );
    while ((match = raceItemPattern.exec(content)) !== null) {
        const fullMatch = match[0].replace(/^the\s+/i, '').trim();
        addItem(fullMatch);
    }

    // Pattern 32: "[Adjective]blade/[Adjective]bane items - "Flameblade", "Dragonbane", "Frostblade"
    const compoundMagicPattern = /(?:the\s+)?([a-z]+)(blade|bane|bringer|caller|slayer|reaver|breaker|render)/gi;
    while ((match = compoundMagicPattern.exec(content)) !== null) {
        const prefix = match[1];
        const suffix = match[2];
        // Only match if prefix looks magical
        if (prefix.match(/fire|flame|ice|frost|storm|shadow|light|blood|dark|dragon|demon|god|holy|death|soul|spirit/i)) {
            addItem(`${prefix}${suffix}`);
        }
    }

    // Pattern 33: Items with parenthetical bonuses - "Sword of Light (+3 attack)", "Shield (+5 defense)"
    const bonusParenPattern = new RegExp(
        `(?:the\\s+)?(?:${adjectivePattern})?(${itemNouns.join('|')})(?:\\s+of\\s+[A-Z][a-z]+)?\\s*\\([^)]*[+]\\d+[^)]*\\)`,
        'gi'
    );
    while ((match = bonusParenPattern.exec(content)) !== null) {
        // Extract the full matched text including parenthetical
        const fullItem = match[0].replace(/^the\s+/i, '').trim();
        addItem(fullItem);
    }

    // Pattern 34: "Enchanted/Magical [item]" - specifically catch these even without other patterns
    const explicitMagicPattern = new RegExp(
        `(?:the\\s+)?(enchanted|magical|blessed|cursed|holy|sacred|divine|demonic|arcane|mystic|legendary|mythical|ancient)\\s+(${adjectivePattern})?\\s*(${itemNouns.join('|')})`,
        'gi'
    );
    while ((match = explicitMagicPattern.exec(content)) !== null) {
        const magic = match[1];
        const adj = match[2] ? match[2].trim() + ' ' : '';
        const item = match[3];
        addItem(`${magic} ${adj}${item}`);
    }

    return items;
}

// Extract combat encounters from content using 24+ detection patterns
function extractCombat(content) {
    const combats = [];
    const processedCombats = new Set();

    // FIRST: Try marker-based combat (highest priority)
    const combatMarkers = parseMarkers(content, 'combat');

    for (const marker of combatMarkers) {
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

        const combatId = `${marker.value.toLowerCase()}-${marker.attributes.skill}-${marker.attributes.stamina}`;
        if (!processedCombats.has(combatId)) {
            processedCombats.add(combatId);
            combats.push(combatData);
        }
    }

    // If markers found, return them (skip pattern detection)
    if (combats.length > 0) {
        return combats.length === 1 ? combats[0] : combats;
    }

    // SECOND: Fall back to pattern detection
    function addCombat(enemyName, skill, stamina) {
        if (!enemyName || !skill || !stamina) return;

        enemyName = enemyName.trim();
        const combatId = `${enemyName.toLowerCase()}-${skill}-${stamina}`;

        if (processedCombats.has(combatId)) return;
        processedCombats.add(combatId);

        combats.push({
            enemyName: enemyName,
            enemySkill: parseInt(skill),
            enemyStamina: parseInt(stamina),
        });
    }

    // Pattern 1: Classic format - "[ENEMY NAME] SKILL X STAMINA Y" or "SKILL X STAMINA Y"
    const classicPattern = /([A-Z][A-Z\s'-]+?)?\s*(?:SKILL|Skill|skill)[\s:]*(\d+)[\s,]+(?:STAMINA|Stamina|stamina)[\s:]*(\d+)/gi;
    let match;
    while ((match = classicPattern.exec(content)) !== null) {
        const enemyName = match[1] ? match[1].trim() : 'Enemy';
        addCombat(enemyName, match[2], match[3]);
    }

    // Pattern 2: Reversed format - "STAMINA X SKILL Y"
    const reversedPattern = /([A-Z][A-Z\s'-]+?)?\s*(?:STAMINA|Stamina|stamina)[\s:]*(\d+)[\s,]+(?:SKILL|Skill|skill)[\s:]*(\d+)/gi;
    while ((match = reversedPattern.exec(content)) !== null) {
        const enemyName = match[1] ? match[1].trim() : 'Enemy';
        addCombat(enemyName, match[3], match[2]);
    }

    // Pattern 3: Abbreviations - "SK X ST Y" or "S: X, ST: Y"
    const abbreviatedPattern = /([A-Z][A-Z\s'-]+?)?\s*(?:SK|S)[\s:]*(\d+)[\s,]+(?:ST|STA)[\s:]*(\d+)/gi;
    while ((match = abbreviatedPattern.exec(content)) !== null) {
        const enemyName = match[1] ? match[1].trim() : 'Enemy';
        addCombat(enemyName, match[2], match[3]);
    }

    // Pattern 4: Natural language - "fight/battle/attack/combat [enemy] (skill X, stamina Y)"
    const naturalPattern = /(?:fight|battle|attack|combat|defeat|face|encounter)\s+(?:a|an|the)?\s*([A-Z][A-Za-z\s'-]+?)[\s\n]*(?:\(|\[|with|having|stats?:|-)?\s*(?:SKILL|Skill|skill)[\s:]*(\d+)[\s,]+(?:STAMINA|Stamina|stamina)[\s:]*(\d+)/gi;
    while ((match = naturalPattern.exec(content)) !== null) {
        addCombat(match[1].trim(), match[2], match[3]);
    }

    // Pattern 5: Stats first, name after - "SKILL X, STAMINA Y [ENEMY NAME]"
    const statsFirstPattern = /(?:SKILL|Skill|skill)[\s:]*(\d+)[\s,]+(?:STAMINA|Stamina|stamina)[\s:]*(\d+)\s*[:-]?\s*([A-Z][A-Za-z\s'-]+)/gi;
    while ((match = statsFirstPattern.exec(content)) !== null) {
        addCombat(match[3].trim(), match[1], match[2]);
    }

    // Pattern 6: Multi-line format - enemy name on one line, stats on next
    const lines = content.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
        const currentLine = lines[i].trim();
        const nextLine = lines[i + 1].trim();

        // Check if current line looks like an enemy name (all caps or title case)
        if (currentLine.match(/^[A-Z][A-Z\s'-]+$/)) {
            // Check if next line has stats
            const statsMatch = nextLine.match(/(?:SKILL|Skill|skill)[\s:]*(\d+)[\s,]+(?:STAMINA|Stamina|stamina)[\s:]*(\d+)/i);
            if (statsMatch) {
                addCombat(currentLine, statsMatch[1], statsMatch[2]);
            }
        }
    }

    // Pattern 7: Bullet/list format - "• ENEMY: Skill X, Stamina Y"
    const bulletPattern = /[•\-*]\s*([A-Z][A-Za-z\s'-]+?)[\s:]+(?:SKILL|Skill|skill)[\s:]*(\d+)[\s,]+(?:STAMINA|Stamina|stamina)[\s:]*(\d+)/gi;
    while ((match = bulletPattern.exec(content)) !== null) {
        addCombat(match[1].trim(), match[2], match[3]);
    }

    // Pattern 8: Table-like format with keywords
    const tablePattern = /(?:Enemy|Opponent|Creature|Monster)[\s:]*([A-Za-z\s'-]+?)[\s\n]+(?:SKILL|Skill|skill)[\s:]*(\d+)[\s\n]+(?:STAMINA|Stamina|stamina)[\s:]*(\d+)/gi;
    while ((match = tablePattern.exec(content)) !== null) {
        addCombat(match[1].trim(), match[2], match[3]);
    }

    // Pattern 9: JSON-like format - {"enemy": "NAME", "skill": X, "stamina": Y}
    const jsonPattern = /["']?enemy["']?\s*:\s*["']([A-Za-z\s'-]+?)["'][\s,]*["']?skill["']?\s*:\s*(\d+)[\s,]*["']?stamina["']?\s*:\s*(\d+)/gi;
    while ((match = jsonPattern.exec(content)) !== null) {
        addCombat(match[1].trim(), match[2], match[3]);
    }

    // Pattern 10: Lowercase enemy names - "goblin skill 5 stamina 7"
    const lowercasePattern = /([a-z][a-z\s'-]+?)[\s:]+(skill|SKILL|Skill)[\s:]*(\d+)[\s,]+(stamina|STAMINA|Stamina)[\s:]*(\d+)/gi;
    while ((match = lowercasePattern.exec(content)) !== null) {
        const enemyName = match[1].trim();
        // Capitalize first letter of each word
        const capitalizedName = enemyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        addCombat(capitalizedName, match[3], match[5]);
    }

    // Pattern 11: HP instead of STAMINA - "skill 5 HP 10" or "SKILL 5 HP 10"
    const hpPattern = /([A-Z][A-Za-z\s'-]+?)?\s*(?:SKILL|Skill|skill)[\s:]*(\d+)[\s,]+(?:HP|hp|Hit\s*Points?)[\s:]*(\d+)/gi;
    while ((match = hpPattern.exec(content)) !== null) {
        const enemyName = match[1] ? match[1].trim() : 'Enemy';
        addCombat(enemyName, match[2], match[3]);
    }

    // Pattern 12: Ratio format - "Goblin (5/10)" or "Enemy: 5/10"
    const ratioPattern = /([A-Za-z][A-Za-z\s'-]+?)[\s:]*\(?\s*(\d+)\s*\/\s*(\d+)\s*\)?/gi;
    while ((match = ratioPattern.exec(content)) !== null) {
        // Skip if it looks like a date or page number
        if (match[1].match(/^(page|section|chapter|part|turn|go|move)/i)) continue;
        const enemyName = match[1].trim();
        const capitalizedName = enemyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        addCombat(capitalizedName, match[2], match[3]);
    }

    // Pattern 13: Equals format - "skill=5 stamina=10" or "SKILL=5, STAMINA=10"
    const equalsPattern = /([A-Z][A-Za-z\s'-]+?)?\s*(?:SKILL|Skill|skill)\s*=\s*(\d+)[\s,]+(?:STAMINA|Stamina|stamina)\s*=\s*(\d+)/gi;
    while ((match = equalsPattern.exec(content)) !== null) {
        const enemyName = match[1] ? match[1].trim() : 'Enemy';
        addCombat(enemyName, match[2], match[3]);
    }

    // Pattern 14: Colon-separated - "Enemy: Goblin Skill: 5 Stamina: 7"
    const colonPattern = /(?:Enemy|Foe|Opponent|Creature|Monster)[\s:]+([A-Za-z\s'-]+?)[\s\n]+(?:Skill|SKILL|skill)[\s:]+(\d+)[\s\n]+(?:Stamina|STAMINA|stamina)[\s:]+(\d+)/gi;
    while ((match = colonPattern.exec(content)) !== null) {
        addCombat(match[1].trim(), match[2], match[3]);
    }

    // Pattern 15: Title case with mixed case stats - "Cave Troll skill 7 stamina 10"
    const titleCasePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[\s:]+(skill|SKILL|Skill)[\s:]*(\d+)[\s,]+(stamina|STAMINA|Stamina)[\s:]*(\d+)/g;
    while ((match = titleCasePattern.exec(content)) !== null) {
        addCombat(match[1].trim(), match[3], match[5]);
    }

    // Pattern 16: Combat with stats in brackets - "Fight [Goblin] [Skill: 5] [Stamina: 7]"
    const bracketPattern = /(?:fight|battle|face)\s+\[([^\]]+)\]\s*\[(?:skill|SKILL|Skill)[\s:]*(\d+)\]\s*\[(?:stamina|STAMINA|Stamina)[\s:]*(\d+)\]/gi;
    while ((match = bracketPattern.exec(content)) !== null) {
        addCombat(match[1].trim(), match[2], match[3]);
    }

    // Pattern 17: Pipe-separated - "Goblin | SKILL 5 | STAMINA 10"
    const pipePattern = /([A-Za-z][A-Za-z\s'-]+?)\s*\|\s*(?:SKILL|Skill|skill)[\s:]*(\d+)\s*\|\s*(?:STAMINA|Stamina|stamina)[\s:]*(\d+)/gi;
    while ((match = pipePattern.exec(content)) !== null) {
        const enemyName = match[1].trim();
        const capitalizedName = enemyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        addCombat(capitalizedName, match[2], match[3]);
    }

    // Pattern 18: Stats with dashes - "SKILL-5 STAMINA-10" or "skill-5, stamina-10"
    const dashPattern = /([A-Z][A-Za-z\s'-]+?)?\s*(?:SKILL|Skill|skill)\s*-\s*(\d+)[\s,]+(?:STAMINA|Stamina|stamina)\s*-\s*(\d+)/gi;
    while ((match = dashPattern.exec(content)) !== null) {
        const enemyName = match[1] ? match[1].trim() : 'Enemy';
        addCombat(enemyName, match[2], match[3]);
    }

    // Pattern 19: Sequential "then/next/after" combats - "Fight Goblin skill 5 stamina 7. Then fight Troll skill 8 stamina 10"
    const sequentialPattern = /(?:then|next|after(?:wards)?|subsequently)[\s,]+(?:you\s+)?(?:fight|face|battle|encounter)\s+(?:a|an|the)?\s*([A-Za-z\s'-]+?)[\s:]+(skill|SKILL|Skill)[\s:]*(\d+)[\s,]+(stamina|STAMINA|Stamina)[\s:]*(\d+)/gi;
    while ((match = sequentialPattern.exec(content)) !== null) {
        const enemyName = match[1].trim();
        const capitalizedName = enemyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        addCombat(capitalizedName, match[3], match[5]);
    }

    // Pattern 20: "First/Second/Third" enemy markers - "First: Goblin skill 5 stamina 7. Second: Troll skill 8 stamina 10"
    const ordinalPattern = /(?:first|second|third|1st|2nd|3rd)[\s:]+(?:enemy[\s:])?([A-Za-z\s'-]+?)[\s:]+(skill|SKILL|Skill)[\s:]*(\d+)[\s,]+(stamina|STAMINA|Stamina)[\s:]*(\d+)/gi;
    while ((match = ordinalPattern.exec(content)) !== null) {
        const enemyName = match[1].trim();
        const capitalizedName = enemyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        addCombat(capitalizedName, match[3], match[5]);
    }

    // Pattern 21: Multiple enemies with "and then" - "Goblin (5/7) and then Troll (8/10)"
    const andThenPattern = /([A-Za-z\s'-]+?)\s*\((\d+)\/(\d+)\)\s+(?:and\s+)?then\s+([A-Za-z\s'-]+?)\s*\((\d+)\/(\d+)\)/gi;
    while ((match = andThenPattern.exec(content)) !== null) {
        const enemy1 = match[1].trim();
        const enemy2 = match[4].trim();
        const cap1 = enemy1.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        const cap2 = enemy2.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        addCombat(cap1, match[2], match[3]);
        addCombat(cap2, match[5], match[6]);
    }

    // Pattern 22: Numbered enemy list - "1. Goblin skill 5 stamina 7  2. Troll skill 8 stamina 10"
    const numberedPattern = /\d+[\.)]\s*([A-Za-z\s'-]+?)[\s:]+(skill|SKILL|Skill)[\s:]*(\d+)[\s,]+(stamina|STAMINA|Stamina)[\s:]*(\d+)/gi;
    while ((match = numberedPattern.exec(content)) !== null) {
        const enemyName = match[1].trim();
        const capitalizedName = enemyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        addCombat(capitalizedName, match[3], match[5]);
    }

    // Pattern 23: "Both" enemies - "Fight both: Goblin skill 5 stamina 7 and Troll skill 8 stamina 10"
    const bothPattern = /both[\s:]+([A-Za-z\s'-]+?)[\s:]+(skill|SKILL|Skill)[\s:]*(\d+)[\s,]+(stamina|STAMINA|Stamina)[\s:]*(\d+)\s+and\s+([A-Za-z\s'-]+?)[\s:]+(skill|SKILL|Skill)[\s:]*(\d+)[\s,]+(stamina|STAMINA|Stamina)[\s:]*(\d+)/gi;
    while ((match = bothPattern.exec(content)) !== null) {
        const enemy1 = match[1].trim();
        const enemy2 = match[6].trim();
        const cap1 = enemy1.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        const cap2 = enemy2.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        addCombat(cap1, match[3], match[5]);
        addCombat(cap2, match[8], match[10]);
    }

    // Pattern 24: "Wave" system - "Wave 1: Goblin skill 5 stamina 7  Wave 2: Troll skill 8 stamina 10"
    const wavePattern = /wave\s+\d+[\s:]+([A-Za-z\s'-]+?)[\s:]+(skill|SKILL|Skill)[\s:]*(\d+)[\s,]+(stamina|STAMINA|Stamina)[\s:]*(\d+)/gi;
    while ((match = wavePattern.exec(content)) !== null) {
        const enemyName = match[1].trim();
        const capitalizedName = enemyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        addCombat(capitalizedName, match[3], match[5]);
    }

    // Return single combat if only one found, otherwise return array
    return combats.length === 1 ? combats[0] : (combats.length > 1 ? combats : null);
}

function parseTextAdventure(text) {
    // Parse text-based adventure format
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    // Extract metadata
    let title = 'Untitled Adventure';
    let author = '';
    let description = '';
    let skill = 8, stamina = 20, luck = 9;

    // Look for metadata at the start
    const titleMatch = text.match(/(?:Title|TITLE|Adventure):\s*(.+)/i);
    if (titleMatch) title = titleMatch[1].trim();

    const authorMatch = text.match(/(?:Author|By):\s*(.+)/i);
    if (authorMatch) author = authorMatch[1].trim();

    const descMatch = text.match(/(?:Description|Summary):\s*(.+)/i);
    if (descMatch) description = descMatch[1].trim();

    const skillMatch = text.match(/(?:Initial\s+)?SKILL:\s*(\d+)/i);
    if (skillMatch) skill = parseInt(skillMatch[1]);

    const staminaMatch = text.match(/(?:Initial\s+)?STAMINA:\s*(\d+)/i);
    if (staminaMatch) stamina = parseInt(staminaMatch[1]);

    const luckMatch = text.match(/(?:Initial\s+)?LUCK:\s*(\d+)/i);
    if (luckMatch) luck = parseInt(luckMatch[1]);

    // Parse sections
    const sections = [];
    // Enhanced regex to handle PDF text variations (all must be at start of line to avoid false positives):
    // - "Section 1:" or "SECTION 1:" or "SECTION 1" (at start of line, punctuation optional)
    // - "[1]" or "(1)" (at start of line)
    // - "1." or "1:" (at start of line - common in PDF Fighting Fantasy books)
    // - "**1**" (Markdown bold at start of line)
    // - Standalone number on its own line (no "section" word needed - most common!)
    const sectionRegex = /(?:^(?:Section|SECTION)\s+(\d+)\s*(?:\]|:|\.|–|—)?|^\s*\[(\d+)\]|^\s*\((\d+)\)|^(\d+)[\.:]\s|^\s*\*\*(\d+)\*\*|^\s*(\d+)\s*$)/gim;
    const matches = [];
    let match;

    while ((match = sectionRegex.exec(text)) !== null) {
        // Find which capture group matched (we have 6 possible patterns)
        const sectionId = parseInt(match[1] || match[2] || match[3] || match[4] || match[5] || match[6]);
        matches.push({
            id: sectionId,
            start: match.index,
            headerEnd: match.index + match[0].length,
            weak: !!match[4]
        });
    }

    // A bare "1." / "1:" line is ambiguous: it is also how numbered lists inside a
    // section are written. If the text uses explicit "Section N" headers, ignore the
    // bare form so list items don't become duplicate sections.
    if (matches.some(m => /^section/i.test(text.substr(m.start, 7)))) {
        for (let k = matches.length - 1; k >= 0; k--) {
            if (matches[k].weak) matches.splice(k, 1);
        }
    }

    // Extract section content
    for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const next = matches[i + 1];
        const endPos = next ? next.start : text.length;

        let sectionText = text.substring(current.headerEnd, endPos).trim();

        // Parse section title (optional SHORT line after section number)
        let sectionTitle = '';
        const titleLineMatch = sectionText.match(/^([^\n]+)\n/);
        // Only treat as title if: short (<50 chars), doesn't start with common narrative words
        if (titleLineMatch &&
            titleLineMatch[1].length < 50 &&
            titleLineMatch[1].length > 0 &&
            !titleLineMatch[1].match(/^(If you|You |Turn to|Go to|The |This |Your |A )/i)) {
            sectionTitle = titleLineMatch[1].trim();
            sectionText = sectionText.substring(titleLineMatch[0].length).trim();
        }

        const section = {
            id: current.id,
            title: sectionTitle,
            text: '',
            choices: []
        };

        // Extract combat encounters using comprehensive detection
        const combat = extractCombat(sectionText);
        if (combat) {
            if (Array.isArray(combat)) {
                // Multiple combats found
                section.combat = combat.map(c => ({
                    enemyName: c.enemyName,
                    enemySkill: c.enemySkill,
                    enemyStamina: c.enemyStamina,
                    onVictorySection: current.id + 1,
                    onDefeatSection: 999
                }));
            } else {
                // Single combat
                section.combat = {
                    enemyName: combat.enemyName,
                    enemySkill: combat.enemySkill,
                    enemyStamina: combat.enemyStamina,
                    onVictorySection: current.id + 1,
                    onDefeatSection: 999
                };
            }
        }

        // Extract items/loot using comprehensive detection
        const items = extractItems(sectionText);
        if (items && items.length > 0) {
            section.addItems = items;
        }

        // Extract choices
        // FIRST: Try marker-based choices
        const choiceMarkers = parseMarkers(sectionText, 'choice');
        const seenTargets = new Set();

        for (const marker of choiceMarkers) {
            const targetSection = parseInt(marker.value);
            if (!seenTargets.has(targetSection)) {
                seenTargets.add(targetSection);

                const choice = {
                    text: marker.attributes.text || `Go to ${targetSection}`,
                    targetSection: targetSection,
                };

                // Add conditions if present
                if (marker.attributes.if) {
                    choice.conditions = parseCondition(marker.attributes.if);
                }

                section.choices.push(choice);
            }
        }

        // SECOND: Fall back to pattern detection
        const choiceRegex = /(?:turn|go|proceed|move|continue|head|return)(?:\s+(?:to|back to|forward to))?\s+(?:section\s+)?(\d+)/gi;
        const choiceMatches = [...sectionText.matchAll(choiceRegex)];

        if (choiceMatches.length > 0) {
            choiceMatches.forEach((m, idx) => {
                const targetSection = parseInt(m[1]);
                if (!seenTargets.has(targetSection)) {
                    seenTargets.add(targetSection);

                    // Extract choice text - get the line containing this choice
                    const lines = sectionText.split('\n');
                    let choiceText = '';

                    // Find which line contains this match
                    let charCount = 0;
                    for (const line of lines) {
                        if (charCount <= m.index && m.index < charCount + line.length) {
                            choiceText = line.trim();
                            break;
                        }
                        charCount += line.length + 1; // +1 for newline
                    }

                    // Clean up: remove "If you" prefix, trailing periods/commas
                    choiceText = choiceText
                        .replace(/^If\s+you\s+/i, '')
                        .replace(/^To\s+/i, '')
                        .replace(/[,.]$/, '')
                        .trim();

                    // If choice text is too long or empty, use a simple default
                    if (!choiceText || choiceText.length > 150) {
                        choiceText = `Go to ${targetSection}`;
                    }

                    section.choices.push({
                        text: choiceText,
                        targetSection: targetSection
                    });
                }
            });
        }

        // Extract main narrative text (remove combat info and choice markers)
        let narrativeText = sectionText
            .replace(/(?:SKILL|Skill)\s+\d+(?:,|\s+)(?:STAMINA|Stamina)\s+\d+/gi, '')
            .replace(/(?:turn|go|proceed|move|continue|head|return)(?:\s+(?:to|back to|forward to))?\s+(?:section\s+)?\d+/gi, '')
            .trim();

        // Check for endings
        const endingMatch = narrativeText.match(/(?:you have won|victory|you have succeeded|the end|you have died|you are dead|game over)/i);
        if (endingMatch || current.id === 999 || current.id === 400) {
            section.isEnding = true;
            section.endingType = narrativeText.match(/(?:you have won|victory|succeeded)/i) ? 'victory' :
                                narrativeText.match(/(?:died|dead|game over)/i) ? 'defeat' : 'neutral';
        }

        section.text = narrativeText;

        // If no choices and not an ending, link to next section
        if (section.choices.length === 0 && !section.isEnding && !section.combat) {
            if (i < matches.length - 1) {
                section.choices.push({
                    text: 'Continue',
                    targetSection: matches[i + 1].id
                });
            }
        }

        sections.push(section);
    }

    // If no sections found, create a simple single-section adventure
    if (sections.length === 0) {
        sections.push({
            id: 1,
            title: 'Start',
            text: text.substring(0, 1000),
            choices: [],
            isEnding: true,
            endingType: 'neutral'
        });
    }

    // Determine starting section: prefer section 1 (adventure start), skip section 0 (intro)
    let startingSection = 1;
    const section1 = sections.find(s => s.id === 1);
    if (section1) {
        startingSection = 1;
    } else {
        // If no section 1, find first section with id > 0 (skip intro)
        const firstNonIntro = sections.find(s => s.id > 0);
        startingSection = firstNonIntro?.id || 1;
    }

    return {
        id: title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        title: title,
        author: author,
        description: description,
        startingSection: startingSection,
        initialStats: { skill, stamina, luck },
        startingItems: [],
        sections: sections
    };
}

function validateBook(book) {
    return book.id && book.title && book.sections &&
           Array.isArray(book.sections) && book.sections.length > 0 &&
           book.initialStats;
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.innerHTML = `<div class="alert-error">${esc(message)}</div>`;
        setTimeout(() => {
            errorDiv.innerHTML = '';
        }, 5000);
    }
}
