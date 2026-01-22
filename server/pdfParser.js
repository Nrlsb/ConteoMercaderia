const pdf = require('pdf-parse');

/**
 * Parses a Remito PDF buffer and extracts items.
 * @param {Buffer} dataBuffer - The PDF file buffer.
 * @returns {Promise<Array<{code: string, description: string, quantity: number}>>}
 */
async function parseRemitoPdf(dataBuffer) {
    try {
        // Custom page render function to skip DUPLICADO/TRIPLICADO pages
        function render_page(pageData) {
            let render_options = {
                normalizeWhitespace: false,
                disableCombineTextItems: false
            }

            return pageData.getTextContent(render_options)
                .then(function (textContent) {
                    let lastY, text = '';
                    for (let item of textContent.items) {
                        if (lastY == item.transform[5] || !lastY) {
                            text += item.str;
                        }
                        else {
                            text += '\n' + item.str;
                        }
                        lastY = item.transform[5];
                    }

                    // Check for DUPLICADO / TRIPLICADO
                    if (text.includes('DUPLICADO') || text.includes('TRIPLICADO')) {
                        return ''; // Skip this page
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

        // Regex to match lines like: "000780LIJA RUBI FLEX DOBLE A N 120/150 F.4,00"
        // Captures: Code (digits), Description (text), Quantity (number with comma)
        // UPDATED: Require at least 4 digits for code to avoid matching quantity lines like "2,00..."
        const itemRegex = /^(\d{4,})\s*(.+?)\s*(\d+,\d{2})$/;

        // State variables for multi-line parsing
        let pendingQuantity = null;
        let pendingDescription = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            let code, description, quantityStr;

            // Strategy 1: Check for merged columns where description ends in 3 decimals (e.g. "X 17,400")
            // and quantity follows immediately (e.g. "1,00") -> "17,4001,00"
            const mergeMatch = trimmedLine.match(/^(\d+)\s*(.+?)(\d+,\d{3})(\d+,\d{2})$/);

            if (mergeMatch) {
                code = mergeMatch[1];
                description = (mergeMatch[2] + mergeMatch[3]).trim();
                quantityStr = mergeMatch[4];
                // Reset pending state if we found a full match
                pendingQuantity = null;
                pendingDescription = [];
            } else {
                // Strategy 2: Standard regex (single line)
                // We use the stricter regex here
                const match = trimmedLine.match(itemRegex);
                if (match) {
                    code = match[1];
                    description = match[2].trim();
                    quantityStr = match[3];
                    // Reset pending state
                    pendingQuantity = null;
                    pendingDescription = [];
                } else {
                    // Strategy 3: Multi-line parsing
                    // Check for Quantity line: "2,00UNUN2,00" or "2,00UN0,00"
                    // The PDF debug shows lines like: "2,00UNUN2,00"
                    // We look for the FIRST number which is the quantity (e.g. "2,00UNUN2,00" -> "2,00")
                    const quantityLineMatch = trimmedLine.match(/^(\d+,\d{2})/);

                    if (quantityLineMatch && !pendingQuantity) {
                        // Potential start of a multi-line item
                        // We assume a quantity line doesn't look like a code line (which we filtered with itemRegex)
                        pendingQuantity = quantityLineMatch[1];
                        pendingDescription = [];
                        continue;
                    }

                    // Check for Code line: ends with "/  /" and starts with description + code
                    // Debug output: "LATEX INTERIOR ALBALATEX MATE BASE P X  8,700001246  /  /"
                    // OR just code: "001737  /  /"
                    // Regex to capture Description and Code at the end
                    const codeLineMatch = trimmedLine.match(/^(.*?)(\d{6})\s+\/\s+\/$/);

                    if (codeLineMatch && pendingQuantity) {
                        description = [...pendingDescription, codeLineMatch[1].trim()].join(' ');
                        code = codeLineMatch[2];
                        quantityStr = pendingQuantity;

                        // Reset pending state
                        pendingQuantity = null;
                        pendingDescription = [];
                    } else if (pendingQuantity) {
                        // If we have a pending quantity, this might be a description line
                        pendingDescription.push(trimmedLine);
                        continue;
                    }
                }
            }

            if (code && quantityStr) {
                // Replace comma with dot for parsing
                const quantity = parseFloat(quantityStr.replace(',', '.'));

                if (!isNaN(quantity)) {
                    // Aggregate items by code
                    const existingItemIndex = items.findIndex(i => i.code === code);
                    if (existingItemIndex !== -1) {
                        items[existingItemIndex].quantity += quantity;
                    } else {
                        items.push({
                            code,
                            description,
                            quantity
                        });
                    }
                }
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
