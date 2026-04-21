const pdf = require('pdf-parse');

/**
 * Parses a Remito PDF buffer and extracts items.
 * @param {Buffer} dataBuffer - The PDF file buffer.
 * @param {boolean} stopOnCopies - Whether to stop processing when DUPLICADO/TRIPLICADO is found.
 * @returns {Promise<Array<{code: string, description: string, quantity: number}>>}
 */
async function parseRemitoPdf(dataBuffer, stopOnCopies = true) {
    try {
        let stopProcessing = false;

        // Custom page render function to handle columns by preserving X/Y structure
        function render_page(pageData) {
            if (stopProcessing && stopOnCopies) return Promise.resolve('');

            let render_options = {
                normalizeWhitespace: false,
                disableCombineTextItems: false
            }

            return pageData.getTextContent(render_options)
                .then(function (textContent) {
                    let lines = {};
                    for (let item of textContent.items) {
                        // Check for duplicate marker early in the raw text content
                        if (stopOnCopies && (item.str.includes('DUPLICADO') || item.str.includes('TRIPLICADO'))) {
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
                        const upperLineRaw = lineText.toUpperCase();
                        // Refined check for stop markers: only stop if the marker is a prominent part of the line
                        // (e.g., at the beginning or end, or isolated by several spaces)
                        const isStopMarker = stopOnCopies && (
                            /^\s*(DUPLICADO|TRIPLICADO|COPIA|QUADRUPLICADO|QUINTO)\s+/.test(upperLineRaw) ||
                            /\s+(DUPLICADO|TRIPLICADO|COPIA|QUADRUPLICADO|QUINTO)\s*$/.test(upperLineRaw) ||
                            /\s{5,}(DUPLICADO|TRIPLICADO|COPIA|QUADRUPLICADO|QUINTO)\s{5,}/.test(upperLineRaw)
                        );

                        if (isStopMarker) {
                            console.log(`[PDF PARSER] Valid Stop marker found: ${upperLineRaw.match(/DUPLICADO|TRIPLICADO|COPIA/)[0]}`);
                            stopProcessing = true;
                            // Return the text accumulated so far for this page, then stop.
                            return text; 
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

        // Extract metadata: Remito Number and Client Name
        const remitoMatch = text.match(/Nº:\s*(\d+)/i);
        const clientMatch = text.match(/Sr\.\/\s*es\.:\s*([^ ](?:.*?))(?=\s{2,}|Código:)/i);

        const remitoNumber = remitoMatch ? remitoMatch[1] : null;
        const clientName = clientMatch ? clientMatch[1].trim() : null;

        const isDevolucion = text.includes('REMITO DE DEVOLUCION');
        const isTransferencia = text.includes('REMITO DE TRANSFERENCIA');
        const isRemito = text.toUpperCase().includes('REMITO');
        console.log(`[PDF PARSER] Document type: ${isDevolucion ? 'DEVOLUCION' : (isTransferencia ? 'TRANSFERENCIA' : 'REMITO')} (isRemito: ${isRemito})`);

        const lines = text.split('\n');
        const items = [];

        const commonUMs = ['UN', 'CX', 'MT', 'KG', 'LT', 'PACK', 'ROL', 'UNID', 'MT2', 'L', 'PINS', 'MTL', 'BOLS', 'PAR', 'POTE', 'CJ', 'BAL', 'M2', 'KGS', 'LTS', 'UNI'];
        const umPattern = `(?:${commonUMs.join('|')})`;

        // --- REGEX ESTRÍCTOS (Exigen Unidad de Medida y usan búsqueda codiciosa para la descripción) ---
        // Regex A Strict: Código [Espacios] [/ /] [Espacios] Descripción [Espacios >=2] Cantidad [Espacios] [UM]
        const regexA_Strict = new RegExp(`^\\s*(\\d{4,})\\s+(?:/\\s*/)?\\s*(.+)\\s{2,}(\\d+(?:,\\d{1,3})?)\\s+(${umPattern})`, 'i');
        // Regex B Strict: [/ /] [Espacios] Descripción [Espacios >=2] Código [Espacios >=2] Cantidad [Espacios] [UM]
        const regexB_Strict = new RegExp(`^\\s*(?:/\\s*/)?\\s*(.+)\\s{2,}(\\d{4,})\\s{2,}(\\d+(?:,\\d{1,3})?)\\s+(${umPattern})`, 'i');

        // --- REGEX ORIGINALES (UM opcional, usados como Fallback) ---
        const regexA = new RegExp(`^\\s*(\\d{4,})\\s+(?:/\\s*/)?\\s*(.+?)\\s{2,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');
        const regexB = new RegExp(`^\\s*(?:/\\s*/)?\\s*(.+?)\\s{2,}(\\d{4,})\\s{2,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');
        
        // Regex Transfer: Similar pero sin slashes y con gaps más grandes
        const regexTransfer = new RegExp(`^\\s*(\\d{4,})\\s+(.+?)\\s{3,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');
        const regexTransferAlt = new RegExp(`^\\s*(\\d{4,})\\s+(.+?)\\s{2,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.length < 3) continue;

            const upperLine = trimmedLine.toUpperCase();
            if (upperLine.includes('/202') || trimmedLine.match(/^\d+$/)) continue;
            if (upperLine.includes('SR./ ES.:') || upperLine.includes('C.U.I.T.:') || upperLine.includes('TEL:') || upperLine.includes('I.V.A.') || upperLine.includes('ALBERDI') || upperLine.includes('BRUTOS') || upperLine.includes('DOMICILIO')) continue;
            if (upperLine.includes('CÓDIGO') && upperLine.includes('DETALLE') && upperLine.includes('CANTIDAD')) continue;

            if (isDevolucion) {
                // ... (mantener lógica de devolución existente si es necesario, 
                // pero por ahora nos enfocamos en el remito normal que es el problema reportado)
                const codes = [];
                let codeMatch;
                const codeRegex = /(\d{4,})/g;
                while ((codeMatch = codeRegex.exec(line)) !== null) {
                    codes.push({
                        code: codeMatch[1],
                        index: codeMatch.index,
                        end: codeMatch.index + codeMatch[1].length
                    });
                }

                for (let i = 0; i < codes.length; i++) {
                    const current = codes[i];
                    const next = codes[i + 1];
                    const zone = line.substring(current.end, next ? next.index : line.length);

                    const qRegex = new RegExp(`(\\d+(?:,\\d{1,3})?)\\s*(?:${umPattern})?(?=\\s*|$)`, 'gi');
                    let qMatch;
                    let lastQuantity = null;
                    while ((qMatch = qRegex.exec(zone)) !== null) {
                        if (qMatch[1].length === 4 && qMatch[1].startsWith('20')) continue;
                        lastQuantity = {
                            str: qMatch[1],
                            description: zone.substring(0, qMatch.index).trim()
                        };
                    }

                    if (lastQuantity) {
                        const quantity = parseFloat(lastQuantity.str.replace(',', '.'));
                        if (!isNaN(quantity)) {
                            pushItem(items, current.code, lastQuantity.description, quantity);
                        }
                    }
                }
                if (codes.length > 0) continue;
            }

            // 1. INTENTO ESTRÍCTO (Con UM obligatoria y descripción greedy)
            // Este paso evita capturar "0,900" como cantidad si es parte del nombre.
            const matchA_Strict = line.match(regexA_Strict);
            if (matchA_Strict) {
                const code = matchA_Strict[1];
                const description = matchA_Strict[2].trim();
                const quantityStr = matchA_Strict[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match A-Strict] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    pushItem(items, code, description, quantity);
                    continue;
                }
            }

            const matchB_Strict = line.match(regexB_Strict);
            if (matchB_Strict) {
                const description = matchB_Strict[1].trim();
                const code = matchB_Strict[2];
                const quantityStr = matchB_Strict[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match B-Strict] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    pushItem(items, code, description, quantity);
                    continue;
                }
            }

            // 2. FALLBACK A DISEÑO B (Descripción primero, código después, UM opcional)
            const matchB = line.match(regexB);
            if (matchB) {
                const description = matchB[1].trim();
                const code = matchB[2];
                const quantityStr = matchB[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match B] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    pushItem(items, code, description, quantity);
                    continue;
                }
            }

            // 3. FALLBACK A DISEÑO TRANSFER
            const matchTransfer = line.match(regexTransfer);
            if (matchTransfer) {
                const code = matchTransfer[1];
                const description = matchTransfer[2].trim();
                const quantityStr = matchTransfer[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match Transfer] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    pushItem(items, code, description, quantity);
                    continue;
                }
            }

            // TRY LAYOUT TRANSFER ALT
            const matchTransferAlt = line.match(regexTransferAlt);
            if (matchTransferAlt) {
                const code = matchTransferAlt[1];
                const description = matchTransferAlt[2].trim();
                const quantityStr = matchTransferAlt[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match TransferAlt] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    pushItem(items, code, description, quantity);
                    continue;
                }
            }

            // TRY LAYOUT A (Code first)
            const matchA = line.match(regexA);
            if (matchA) {
                const code = matchA[1];
                const description = matchA[2].trim();
                const quantityStr = matchA[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match A] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    pushItem(items, code, description, quantity);
                    continue;
                }
            }

            // FALLBACK: Standard item match
            let match;
            const itemRegexFallback = new RegExp(`^\\s*(\\d{4,})\\s+(.+?)\\s+(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');
            if ((match = line.match(itemRegexFallback)) !== null) {
                const code = match[1];
                const description = match[2].trim();
                const quantityStr = match[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                
                // Validación extra: si la descripción contiene slashes sospechosos o es muy corta, ignorar o procesar con cuidado
                if (!isNaN(quantity) && quantity > 0 && description.length > 2) {
                    console.log(`[PDF Match Fallback] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    pushItem(items, code, description, quantity);
                    continue;
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
        console.log(`Text Length: ${text.length}`);
        if (items.length === 0) {
            console.log('FRONT 500 CHARS OF TEXT:', text.substring(0, 500));
        }
        console.log(`Extracted ${items.length} items:`);
        items.forEach(item => console.log(`- Code: ${item.code}, Desc: ${item.description}, Qty: ${item.quantity}`));
        console.log('---------------------------');

        return {
            items,
            metadata: {
                clientName,
                remitoNumber
            },
            isDevolucion,
            isTransferencia,
            isRemito,
            textSnippet: text
        };
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw new Error('Failed to parse PDF');
    }
}

module.exports = { parseRemitoPdf };
