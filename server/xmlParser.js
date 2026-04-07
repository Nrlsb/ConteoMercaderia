const xml2js = require('xml2js');
const xlsx = require('xlsx');

const parseTrueXlsx = (buffer) => {
    try {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('No sheets found in XLSX file');
        }

        // Encontrar hoja que contenga "Inventario" o usar la primera
        const sheetName = workbook.SheetNames.find(name => name && name.toLowerCase().includes('inventario')) || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            throw new Error(`Sheet "${sheetName}" not found or empty`);
        }

        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        const items = [];
        let inventoryId = null;

        if (!rows || rows.length === 0) return { items: [], inventoryId: null };

        // Buscar fila de encabezados
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(20, rows.length); i++) {
            const row = rows[i] || [];
            if (row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('codigo'))) {
                headerRowIdx = i;
                break;
            }
        }

        const headerRow = rows[headerRowIdx] || [];
        let codeIdx = -1, descIdx = -1, qtyIdx = -1, idIdx = -1, barcodeIdx = -1;

        headerRow.forEach((col, idx) => {
            if (typeof col !== 'string') return;
            const colLower = col.toLowerCase();
            if (colLower.includes('codigo')) codeIdx = idx;
            else if (colLower.includes('descripcion')) descIdx = idx;
            else if (colLower.includes('saldo') || colLower.includes('stock')) qtyIdx = idx;
            else if (colLower.includes('id') && colLower.includes('inventario')) idIdx = idx;
            else if (colLower.includes('barra') || colLower.includes('barcode')) barcodeIdx = idx;
        });

        // Fallbacks a los índices típicos (0-indexed) de la vieja estructura si los headers no hicieron match
        if (codeIdx === -1) codeIdx = 1; // B
        if (descIdx === -1) descIdx = 2; // C
        if (qtyIdx === -1) qtyIdx = 3;   // D
        if (idIdx === -1) idIdx = 0;     // A

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const code = row[codeIdx];
            let description = row[descIdx];
            // Intentar con fila de fallback si en D no hay nada e históricamente podía estar en F
            let rawQuantity = row[qtyIdx] !== undefined ? row[qtyIdx] : row[5];
            const currentInventoryId = row[idIdx];
            const barcode = (barcodeIdx !== -1 && barcodeIdx < row.length) ? row[barcodeIdx] : null;

            if (!code || !description) continue;

            if (!inventoryId && currentInventoryId) {
                const cleanedId = String(currentInventoryId).trim();
                if (/^\d+$/.test(cleanedId)) {
                    inventoryId = cleanedId;
                }
            }

            description = String(description).trim();
            let quantity = parseFloat(rawQuantity);
            if (isNaN(quantity)) quantity = 0;

            const cleanedBarcode = (barcode && !/^[_\-]+$/.test(String(barcode).trim())) ? String(barcode).trim() : null;

            items.push({
                code: String(code).trim(),
                description,
                quantity,
                barcode: (cleanedBarcode === 'undefined' || cleanedBarcode === 'null') ? null : cleanedBarcode
            });
        }

        return { items, inventoryId };
    } catch (e) {
        console.error('XLSX native Parse Error:', e);
        throw new Error('Failed to process XLSX file: ' + e.message);
    }
};

const parseLegacyXml = async (buffer) => {
    const parser = new xml2js.Parser({ explicitArray: false });
    // Try to detect if it's UTF-8 or Latin1 (Excel XML is often Latin1/ISO-8859-1)
    let content = buffer.toString('utf8');

    // Simple heuristic: if it contains an encoding declaration for ISO-8859-1 or similar,
    // we might need to re-read it. Or just use 'binary'/'latin1' which is more permissive.
    if (content.includes('encoding="ISO-8859-1"') || content.includes('encoding="UTF-16"')) {
        content = buffer.toString('latin1');
    }

    try {
        const result = await parser.parseStringPromise(content);
        if (!result) throw new Error('XML parsing failed: result is empty');

        // Navigate through the structure: Workbook -> Worksheet -> Table -> Row
        const workbook = result['Workbook'];
        if (!workbook) {
            console.error('Invalid XML Structure. Keys found:', Object.keys(result));
            throw new Error('Invalid XML: No Workbook found');
        }

        // Find "2-Inventario" sheet or just use the one containing "Inventario"
        let worksheets = workbook['Worksheet'];
        if (!worksheets) throw new Error('No worksheets found in XML');
        if (!Array.isArray(worksheets)) worksheets = [worksheets];

        const inventorySheet = worksheets.find(ws =>
            ws && ws['$'] && ws['$']['ss:Name'] &&
            String(ws['$']['ss:Name']).toLowerCase().includes('inventario')
        ) || worksheets[0];

        if (!inventorySheet) throw new Error('Sheet "Inventario" not found and no default sheet available');

        const table = inventorySheet['Table'];
        if (!table) throw new Error('Table not found in sheet');

        const rows = table['Row'];
        if (!rows) return { items: [], inventoryId: null };

        const rowArray = Array.isArray(rows) ? rows : [rows];

        const items = [];
        let inventoryId = null;

        let idIdx = 1, codeIdx = 2, descIdx = 3, qtyIdx = 6;
        let headersFound = false;

        // Iterate rows
        for (let i = 0; i < rowArray.length; i++) {
            const row = rowArray[i];
            if (!row) continue;
            const cells = row['Cell'];
            if (!cells) continue;

            const cellArray = Array.isArray(cells) ? cells : [cells];

            // Helper to get text from cell
            const getCellText = (cell) => {
                if (!cell) return null;
                const data = cell['Data'];
                if (!data) return null;
                if (typeof data === 'string') return data;
                if (typeof data === 'object') return data['_'] !== undefined ? String(data['_']) : JSON.stringify(data);
                return String(data);
            };

            const columns = [];
            let currentIndex = 1;

            cellArray.forEach(cell => {
                const idxAttr = cell && cell['$'] && cell['$']['ss:Index'];
                if (idxAttr) {
                    currentIndex = parseInt(idxAttr, 10);
                }
                columns[currentIndex] = getCellText(cell);
                currentIndex++;
            });

            // Check if this row is the header row
            if (!headersFound) {
                let isHeader = false;
                columns.forEach((col, idx) => {
                    if (typeof col === 'string') {
                        const colLower = col.toLowerCase();
                        if (colLower.includes('codigo')) { codeIdx = idx; isHeader = true; }
                        else if (colLower.includes('descripcion')) { descIdx = idx; }
                        else if (colLower.includes('saldo') || colLower.includes('stock')) { qtyIdx = idx; }
                        else if (colLower.includes('id') && colLower.includes('inventario')) { idIdx = idx; }
                    }
                });
                if (isHeader) {
                    headersFound = true;
                    continue; // Skip the header row itself
                }
            }

            // Extraction using dynamic indices
            const currentInventoryId = columns[idIdx];
            const code = columns[codeIdx];
            let description = columns[descIdx];
            const rawQuantity = columns[qtyIdx];

            // Skip title row or common header texts in case header logic missed them
            if (code === 'Codigo' || description === 'Descripcion' || columns[1] === 'Inventario' || !code) {
                continue;
            }

            // Capture inventoryId from the first data row if it looks like a number
            if (!inventoryId && currentInventoryId) {
                const cleanedId = String(currentInventoryId).trim();
                if (/^\d+$/.test(cleanedId)) {
                    inventoryId = cleanedId;
                }
            }

            // Validate: Must have code and valid description
            if (!code || !description) continue;

            description = String(description).trim();
            let quantity = parseFloat(rawQuantity);
            if (isNaN(quantity)) quantity = 0;

            items.push({
                code: String(code).trim(),
                description,
                quantity,
                barcode: null
            });
        }

        return { items, inventoryId };

    } catch (error) {
        console.error('XML Parse Error:', error);
        throw new Error('Failed to process XML file: ' + error.message);
    }
};

const parseExcelXml = async (buffer) => {
    // Check magic number for ZIP/XLSX: PK..
    const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B;
    if (isZip) {
        return parseTrueXlsx(buffer);
    }
    // Check magic number for legacy XLS (OLE2 Compound Document): D0 CF 11 E0
    const isXls = buffer.length > 4 && buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
    if (isXls) {
        return parseTrueXlsx(buffer);
    }
    return await parseLegacyXml(buffer);
};

module.exports = { parseExcelXml };

