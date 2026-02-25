const xml2js = require('xml2js');
const xlsx = require('xlsx');

const parseTrueXlsx = (buffer) => {
    try {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        // Encontrar hoja que contenga "Inventario" o usar la primera
        const sheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('inventario')) || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        const items = [];
        let inventoryId = null;

        if (rows.length === 0) return { items: [], inventoryId: null };

        // Buscar fila de encabezados
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const row = rows[i] || [];
            if (row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('codigo'))) {
                headerRowIdx = i;
                break;
            }
        }

        const headerRow = rows[headerRowIdx] || [];
        let codeIdx = -1, descIdx = -1, qtyIdx = -1, idIdx = -1;

        headerRow.forEach((col, idx) => {
            if (typeof col !== 'string') return;
            const colLower = col.toLowerCase();
            if (colLower.includes('codigo')) codeIdx = idx;
            else if (colLower.includes('descripcion')) descIdx = idx;
            else if (colLower.includes('saldo') || colLower.includes('stock')) qtyIdx = idx;
            else if (colLower.includes('id') && colLower.includes('inventario')) idIdx = idx;
        });

        // Fallbacks a los índices típicos (0-indexed) de la vieja estructura si los headers no hicieron match
        // A=0, B=1, C=2, D=3, E=4, F=5
        if (codeIdx === -1) codeIdx = 1; // B
        if (descIdx === -1) descIdx = 2; // C
        if (qtyIdx === -1) qtyIdx = 3;   // D (a veces era 5 / F)
        if (idIdx === -1) idIdx = 0;     // A

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const code = row[codeIdx];
            let description = row[descIdx];
            // Intentar con fila de fallback si en D no hay nada e históricamente podía estar en F
            let rawQuantity = row[qtyIdx] !== undefined ? row[qtyIdx] : row[5];
            const currentInventoryId = row[idIdx];

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

            items.push({
                code: String(code).trim(),
                description,
                quantity,
                barcode: null
            });
        }

        return { items, inventoryId };
    } catch (e) {
        console.error('XLSX native Parse Error:', e);
        throw new Error('Failed to process XLSX file');
    }
};

const parseLegacyXml = async (buffer) => {
    const parser = new xml2js.Parser({ explicitArray: false });
    const content = buffer.toString('utf8');

    // Attempt to handle possible encoding issues manually if needed, 
    // but xml2js handles standard XML declarations well.

    try {
        const result = await parser.parseStringPromise(content);

        // Navigate through the structure: Workbook -> Worksheet -> Table -> Row
        const workbook = result['Workbook'];
        if (!workbook) throw new Error('Invalid XML: No Workbook found');

        // Find "2-Inventario" sheet or just use the second one if names vary?
        // Let's look for the one with "Inventario" in the name.
        let worksheets = workbook['Worksheet'];
        if (!Array.isArray(worksheets)) worksheets = [worksheets];

        const inventorySheet = worksheets.find(ws =>
            ws['$'] && ws['$']['ss:Name'] && ws['$']['ss:Name'].includes('Inventario')
        );

        if (!inventorySheet) throw new Error('Sheet "Inventario" not found');

        const table = inventorySheet['Table'];
        if (!table) throw new Error('Table not found in sheet');

        const rows = table['Row']; // This might be an array or single object
        if (!rows) return [];

        const rowArray = Array.isArray(rows) ? rows : [rows];

        // We need to skip the header row. 
        // We can identify it by checking content or just skipping index 0 and 1.
        // In the sample, Row 1 (index 0) is header.
        // Actually, the sample shows Row 1 = Headers.

        const items = [];
        let inventoryId = null;

        // Iterate rows
        for (let i = 0; i < rowArray.length; i++) {
            const row = rowArray[i];
            const cells = row['Cell'];
            if (!cells) continue;

            const cellArray = Array.isArray(cells) ? cells : [cells];

            // Helper to get text from cell
            const getCellText = (cell) => {
                if (!cell) return null;
                const data = cell['Data'];
                if (!data) return null;
                return typeof data === 'string' ? data : data['_'] || JSON.stringify(data);
            };

            const columns = [];
            let currentIndex = 1;

            cellArray.forEach(cell => {
                const idxAttr = cell['$'] && cell['$']['ss:Index'];
                if (idxAttr) {
                    currentIndex = parseInt(idxAttr, 10);
                }
                columns[currentIndex] = getCellText(cell);
                currentIndex++;
            });

            // Mapping based on "2-Inventario" structure:
            // Col 1: Id Inventario
            // Col 2: Codigo (Internal)
            // ...

            // Extraction
            const currentInventoryId = columns[1];
            const code = columns[2];
            let description = columns[3];
            // In the user image, Saldo Stock is in col 4 (D). 
            // In previous versions it was mentioned as col 6.
            const rawQuantity = columns[4] || columns[6];

            // Skip Header (Detect if "Codigo" is in col 2 or "Descripcion" in col 3)
            if (code === 'Codigo' || description === 'Descripcion' || rawQuantity === 'Saldo Stock') {
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

            description = description.trim();
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
        throw new Error('Failed to process XML file');
    }
};

const parseExcelXml = async (buffer) => {
    // Check magic number for ZIP/XLSX: PK..
    const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B;
    if (isZip) {
        return parseTrueXlsx(buffer);
    }
    return await parseLegacyXml(buffer);
};

module.exports = { parseExcelXml };

