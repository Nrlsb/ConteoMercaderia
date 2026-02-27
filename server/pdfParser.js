const pdf = require('pdf-parse');

/**
 * Parses a Remito PDF buffer and extracts items.
 * @param {Buffer} dataBuffer - The PDF file buffer.
 * @returns {Promise<Array<{code: string, description: string, quantity: number}>>}
 */
async function parseRemitoPdf(dataBuffer) {
    try {
        let stopProcessing = false;

        // Custom page render function to handle columns by preserving X/Y structure
        function render_page(pageData) {
            if (stopProcessing) return Promise.resolve('');

            let render_options = {
                normalizeWhitespace: false,
                disableCombineTextItems: false
            }

            return pageData.getTextContent(render_options)
                .then(function (textContent) {
                    let lines = {};
                    for (let item of textContent.items) {
                        // Check for duplicate marker early in the raw text content
                        if (item.str.includes('DUPLICADO') || item.str.includes('TRIPLICADO')) {
                            stopProcessing = true;
                            return ''; // Complete page skip and signal stop
                        }

                        let y = Math.round(item.transform[5]);
                        let x = Math.round(item.transform[4]);
                        if (!lines[y]) lines[y] = [];
                        lines[y].push({ x, str: item.str, width: item.width || 0 });
                    }

                    // Sort Y coordinates descending (top to bottom)
                    let sortedY = Object.keys(lines).sort((a, b) => b - a);
                    let text = '';

                    // Group Y coordinates that are very close (same line)
                    let groups = [];
                    if (sortedY.length > 0) {
                        let currentGroup = [sortedY[0]];
                        for (let i = 1; i < sortedY.length; i++) {
                            if (Math.abs(sortedY[i] - sortedY[i - 1]) < 5) {
                                currentGroup.push(sortedY[i]);
                            } else {
                                groups.push(currentGroup);
                                currentGroup = [sortedY[i]];
                            }
                        }
                        groups.push(currentGroup);
                    }

                    for (let group of groups) {
                        // Merge all items in the same Y group
                        let groupItems = [];
                        for (let y of group) {
                            groupItems = groupItems.concat(lines[y]);
                        }

                        // Sort items by X coordinate
                        groupItems.sort((a, b) => a.x - b.x);

                        let lineText = '';
                        let lastX = 0;
                        for (let item of groupItems) {
                            // Add spaces based on X gap to preserve columns
                            // 5 units roughly = 1 character space
                            let gap = Math.max(0, Math.floor((item.x - lastX) / 5.5));
                            lineText += ' '.repeat(gap) + item.str;
                            lastX = item.x + (item.width || (item.str.length * 5.5));
                        }

                        // Final check for markers in assembled line text (just in case)
                        if (lineText.includes('DUPLICADO') || lineText.includes('TRIPLICADO')) {
                            stopProcessing = true;
                            return ''; // Complete page skip
                        }

                        text += lineText + '\n';
                    }

                    return text;
                });
        }

        let options = {
            pagerender: render_page
        }

        const data = await pdf(dataBuffer, options);
        const text = data.text;
        const lines = text.split('\n');
        const items = [];

        const commonUMs = ['UN', 'CX', 'MT', 'KG', 'LT', 'PACK', 'ROL', 'UNID', 'MT2', 'L', 'PINS', 'MTL', 'BOLS', 'PAR', 'POTE', 'CJ', 'BAL'];
        const umPattern = `(?:${commonUMs.join('|')})`;

        // Regex for standard items: Code, Description, then Quantity followed by UM
        // This avoids picking up numbers in the description like "X 0,450"
        const itemRegex = new RegExp(`(\\d{4,})\\s+(.+?)\\s+(\\d+,\\d{2})\\s+${umPattern}`, 'g');

        // Regex for multi-line items
        const codeLineRegex = /(.*?)(\d{4,})\s+\/\s+\//g;

        // Store multiple pending items for multi-column support
        let pendingItems = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.length < 3) continue;

            // STRATEGY 1: Full item match (potentially multiple per line)
            let match;
            let foundInLine = false;

            // Skip headers/metadata
            if (trimmedLine.includes('/202') || trimmedLine.match(/^\d+$/)) continue;

            // Use the UM-anchored regex to find items
            while ((match = itemRegex.exec(line)) !== null) {
                const code = match[1];
                const description = match[2].trim();
                const quantityStr = match[3];

                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity)) {
                    pushItem(items, code, description, quantity);
                    foundInLine = true;
                }
            }

            if (foundInLine) {
                pendingItems = [];
                continue;
            }

            // STRATEGY 2: Multi-line / Interleaved columns

            // A. Check for codes (e.g. "PRODUCT NAME 00123 / /")
            let codeMatch;
            let codesFoundInLine = [];
            while ((codeMatch = codeLineRegex.exec(line)) !== null) {
                const descPart = codeMatch[1].trim();
                const code = matchCode(codeMatch[2]);
                if (code) {
                    codesFoundInLine.push({ code, descPart });
                }
            }

            if (codesFoundInLine.length > 0) {
                pendingItems = codesFoundInLine.map(c => ({
                    code: c.code,
                    descriptionParts: c.descPart ? [c.descPart] : [],
                    quantityStr: null
                }));
                continue;
            }

            // B. Check for quantities (anchored by UM)
            if (pendingItems.length > 0 && pendingItems.every(i => !i.quantityStr)) {
                const words = line.split(/\s+/).filter(w => w.length > 0);
                const quantities = [];

                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    const nextWord = (words[i + 1] || '').toUpperCase();

                    if (/^(\d+,\d{2})/.test(word)) {
                        const qStr = word.match(/^(\d+,\d{2})/)[1];
                        // Identify quantity column by mandatory UM following it
                        if (commonUMs.some(um => nextWord === um || word.toUpperCase().endsWith(um))) {
                            quantities.push(qStr);
                        }
                    }
                }

                if (quantities.length > 0) {
                    for (let i = 0; i < Math.min(quantities.length, pendingItems.length); i++) {
                        const qStr = quantities[i];
                        const quantity = parseFloat(qStr.replace(',', '.'));
                        if (!isNaN(quantity)) {
                            pushItem(items, pendingItems[i].code, pendingItems[i].descriptionParts.join(' '), quantity);
                            pendingItems[i].quantityStr = qStr;
                        }
                    }
                    if (pendingItems.every(i => i.quantityStr)) {
                        pendingItems = [];
                    }
                    continue;
                }
            }

            // C. Accumulate description parts
            if (pendingItems.length > 0 && !line.includes(' / /')) {
                // Heuristic: if a line is short and doesn't have many numbers, it's likely a description part
                // We add it to the first pending item's description (simplified for common cases)
                if (trimmedLine.length > 5 && !trimmedLine.match(/^\d+$/)) {
                    pendingItems[0].descriptionParts.push(trimmedLine);
                }
            }
        }

        // Helper to validate and clean codes
        function matchCode(code) {
            if (!code) return null;
            // Clean common artifacts from PDF extraction
            const clean = code.replace(/\D/g, '');
            return clean.length >= 4 ? clean : null;
        }

        // Helper function to aggregate items
        function pushItem(targetArray, code, description, quantity) {
            // Clean description from common PDF patterns
            let cleanDesc = description
                .replace(/\/\s*\//g, '')
                .replace(/\d{6,}/g, '') // Remove long numbers that might be leaked codes
                .replace(/\s+/g, ' ')
                .trim();

            const existingIndex = targetArray.findIndex(i => i.code === code);
            if (existingIndex !== -1) {
                targetArray[existingIndex].quantity += quantity;
            } else {
                targetArray.push({ code, description: cleanDesc, quantity });
            }
        }

        console.log('--- PDF Parsing Results ---');
        console.log(`Total lines processed: ${lines.length}`);
        console.log(`Extracted ${items.length} items:`);
        items.forEach(item => console.log(`- Code: ${item.code}, Desc: ${item.description}, Qty: ${item.quantity}`));
        console.log('---------------------------');

        return items;
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw new Error('Failed to parse PDF');
    }
}

module.exports = { parseRemitoPdf };
