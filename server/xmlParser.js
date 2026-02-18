const xml2js = require('xml2js');

const parseExcelXml = async (buffer) => {
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

module.exports = { parseExcelXml };
