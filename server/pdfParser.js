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
                            // Threshold reduced from 5.5 to 4.0 to be more aggressive in separating close text tokens
                            let gap = Math.max(0, Math.floor((item.x - lastX) / 4.0));
                            lineText += ' '.repeat(gap) + item.str;
                            lastX = item.x + (item.width || (item.str.length * 4.0));
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
        let lastItem = null;

        const commonUMs = ['UN', 'CX', 'MT', 'KG', 'LT', 'PACK', 'ROL', 'UNID', 'MT2', 'L', 'PINS', 'MTL', 'BOLS', 'PAR', 'POTE', 'CJ', 'BAL', 'M2', 'KGS', 'LTS', 'UNI'];
        const umPattern = `(?:${commonUMs.join('|')})`;

        // --- REGEX ACTUALIZADOS ---
        
        // Regex Split Code: Prefijo [Espacios] [/ /] [Espacios] Descripción [Espacios] Sufijo [Espacios >=2] Cantidad
        const regexSplit = new RegExp(`^\\s*(\\d+)\\s+(?:/\\s*/)\\s*(.+?)\\s+(\\d{2,})\\s{2,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');

        // Regex A Strict: Código [Espacios] [/ /] [Espacios] Descripción [Espacios >=2] Cantidad [Espacios] [UM]
        const regexA_Strict = new RegExp(`^\\s*(\\d{3,})\\s+(?:/\\s*/)?\\s*(.+)\\s{2,}(\\d+(?:,\\d{1,3})?)\\s+(${umPattern})`, 'i');
        
        // Regex B Strict: [/ /] [Espacios] Descripción [Espacios >=1] Código [Espacios >=2] Cantidad [Espacios] [UM]
        const regexB_Strict = new RegExp(`^\\s*(?:/\\s*/)?\\s*(.+?)\\s+(\\d{3,})\\s{2,}(\\d+(?:,\\d{1,3})?)\\s+(${umPattern})`, 'i');

        // --- REGEX FALLBACKS (UM opcional) ---
        const regexA = new RegExp(`^\\s*(\\d{3,})\\s+(?:/\\s*/)?\\s*(.+?)\\s{2,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');
        const regexB = new RegExp(`^\\s*(?:/\\s*/)?\\s*(.+?)\\s+(\\d{3,})\\s{2,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');
        
        const regexTransfer = new RegExp(`^\\s*(\\d{3,})\\s+(.+?)\\s{3,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');
        const regexTransferAlt = new RegExp(`^\\s*(\\d{3,})\\s+(.+?)\\s{2,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            const upperLine = trimmedLine.toUpperCase();
            
            // Ignorar encabezados y datos de cliente conocidos
            if (upperLine.includes('/202') || (trimmedLine.match(/^\d+$/) && trimmedLine.length < 4)) continue;
            if (upperLine.includes('SR./ ES.:') || upperLine.includes('C.U.I.T.:') || upperLine.includes('TEL:') || upperLine.includes('I.V.A.') || upperLine.includes('ALBERDI') || upperLine.includes('BRUTOS') || upperLine.includes('DOMICILIO')) continue;
            if (upperLine.includes('CÓDIGO') && upperLine.includes('DETALLE') && upperLine.includes('CANTIDAD')) continue;
            if (upperLine.includes('PÁG') || upperLine.includes('PAGINA') || upperLine.includes('TRANSPORTE:') || upperLine.includes('BULTOS:')) continue;

            if (isDevolucion) {
                lastItem = null;
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

            // 0. INTENTO SPLIT CODE (Ej: 213 / / DESC 002)
            const matchSplit = line.match(regexSplit);
            if (matchSplit) {
                const codePartB = matchSplit[1]; // El que está al inicio (ej: 213 o 33)
                const baseDesc = matchSplit[2].trim();
                const codePartA = matchSplit[3]; // El que está al final (ej: 002 o 0018)
                const quantityStr = matchSplit[4];
                
                // El orden correcto según la DB es Parte Final + Parte Inicial
                const code = codePartA + codePartB; 
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match Split] ${code} (${codePartA}+${codePartB}) | ${quantity} | ${baseDesc.substring(0, 30)}...`);
                    lastItem = pushItem(items, code, baseDesc, quantity);
                    continue;
                }
            }

            // 1. INTENTO ESTRÍCTO A
            const matchA_Strict = line.match(regexA_Strict);
            if (matchA_Strict) {
                const code = matchA_Strict[1];
                const description = matchA_Strict[2].trim();
                const quantityStr = matchA_Strict[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match A-Strict] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    lastItem = pushItem(items, code, description, quantity);
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
                    lastItem = pushItem(items, code, description, quantity);
                    continue;
                }
            }

            // 2. FALLBACKS
            const matchB = line.match(regexB);
            if (matchB) {
                const description = matchB[1].trim();
                const code = matchB[2];
                const quantityStr = matchB[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match B] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    lastItem = pushItem(items, code, description, quantity);
                    continue;
                }
            }

            const matchTransfer = line.match(regexTransfer);
            if (matchTransfer) {
                const code = matchTransfer[1];
                const description = matchTransfer[2].trim();
                const quantityStr = matchTransfer[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match Transfer] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    lastItem = pushItem(items, code, description, quantity);
                    continue;
                }
            }

            const matchTransferAlt = line.match(regexTransferAlt);
            if (matchTransferAlt) {
                const code = matchTransferAlt[1];
                const description = matchTransferAlt[2].trim();
                const quantityStr = matchTransferAlt[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match TransferAlt] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    lastItem = pushItem(items, code, description, quantity);
                    continue;
                }
            }

            const matchA = line.match(regexA);
            if (matchA) {
                const code = matchA[1];
                const description = matchA[2].trim();
                const quantityStr = matchA[3];
                const quantity = parseFloat(quantityStr.replace(',', '.'));
                if (!isNaN(quantity) && quantity > 0) {
                    console.log(`[PDF Match A] ${code} | ${quantity} | ${description.substring(0, 30)}...`);
                    lastItem = pushItem(items, code, description, quantity);
                    continue;
                }
            }

            // 5. DETECCIÓN DE CONTINUACIÓN DE DESCRIPCIÓN
            if (lastItem && (line.startsWith(' '.repeat(10)) || trimmedLine.startsWith('/') || trimmedLine.length > 5)) {
                const cleanedLine = trimmedLine.replace(/\/\s*\//g, '').trim();
                if (cleanedLine.length > 2 && !cleanedLine.match(/^\d+$/) && !cleanedLine.includes('TOTAL')) {
                    console.log(`[PDF Join] Añadiendo a ${lastItem.code}: ${cleanedLine}`);
                    lastItem.description += ' ' + cleanedLine;
                    continue;
                }
            }
            
            lastItem = null;
        }

        // Helper to validate and clean codes
        function matchCode(code) {
            if (!code) return null;
            const clean = code.replace(/\D/g, '');
            return clean.length >= 3 ? clean : null;
        }

        // Helper function to aggregate items
        function pushItem(targetArray, code, description, quantity) {
            let cleanDesc = description
                .replace(/\/\s*\//g, '')
                .replace(/\d{8,}/g, '') 
                .replace(/\s+/g, ' ')
                .trim();

            const existingIndex = targetArray.findIndex(i => i.code === code);
            if (existingIndex !== -1) {
                targetArray[existingIndex].quantity += quantity;
                return targetArray[existingIndex];
            } else {
                const newItem = { code, description: cleanDesc, quantity };
                targetArray.push(newItem);
                return newItem;
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
