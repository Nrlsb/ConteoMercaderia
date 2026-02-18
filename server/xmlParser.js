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

            // Skip Header
            if (columns[2] === 'Codigo' || columns[3] === 'Descripcion' || columns[6] === 'Saldo Stock') {
                continue;
            }

            // Extraction
            const currentInventoryId = columns[1];
            const code = columns[2];
            let description = columns[3];
            const rawQuantity = columns[6];

            // Capture inventoryId from the first data row if not already captured
            if (!inventoryId && currentInventoryId) {
                inventoryId = String(currentInventoryId).trim();
            }

            // Validate: Must have code and valid quantity
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
