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

        // Iterate rows
        for (let i = 0; i < rowArray.length; i++) {
            const row = rowArray[i];
            const cells = row['Cell'];
            if (!cells) continue;

            // Cells is array or object.
            // CAUTION: XML Excel skips empty cells, so array index != column index!
            // We must rely on 'ss:Index' attribute if present, or count manually if rigid.
            // But this specific XML seems to be fully populated with "___________" or data.
            // Let's use a robust mapping approach.

            // Helper to get text from cell
            const getCellText = (cell) => {
                if (!cell) return null;
                const data = cell['Data'];
                if (!data) return null;
                // data could be string or object with properties
                return typeof data === 'string' ? data : data['_'] || JSON.stringify(data);
            };

            const cellArray = Array.isArray(cells) ? cells : [cells];

            // Map cells to columns based on order since 'ss:Index' might be missing if contiguous.
            // IF 'ss:Index' exists, we respect it.

            // Create a sparse array representing valid columns
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
            // Col 2: Codigo (Internal) -> e.g. 007461
            // Col 3: Descripcion
            // Col 4: Unidad
            // Col 5: Deposito
            // Col 6: Saldo Stock (Quantity)
            // ...

            // Skip Header (Detect if "Codigo" is in col 2 or "Descripcion" in col 3)
            if (columns[2] === 'Codigo' || columns[3] === 'Descripcion' || columns[6] === 'Saldo Stock') {
                continue;
            }

            // Extraction
            const code = columns[2];
            let description = columns[3];
            const rawQuantity = columns[6];

            // Validate: Must have code and valid quantity
            if (!code || !description) continue;

            // Clean Description (sometimes has extra spaces)
            description = description.trim();

            // Parse Quantity
            // XML might use comma or dot depending on locale, but usually 'Number' type uses dot in XML value?
            // "2" -> 2. "2,5"? 
            // The provided file shows <Data ss:Type="Number">2</Data>. This is standard Number format (dot usually).
            let quantity = parseFloat(rawQuantity);
            if (isNaN(quantity)) quantity = 0;

            items.push({
                code: String(code).trim(),
                description,
                quantity,
                barcode: null // XML doesn't seem to have barcode in this sheet? 
                // Wait, inspect_excel.js showed 'CodeBar' in headers of XLSX.
                // But the XML view didn't show 'CodeBar' in column headers in lines 145-155.
                // Headers: Id, Codigo, Descripcion, Unidad, Deposito, Saldo, Conteo1, 2, 3, Orden.
                // So Barcode is MISSING in this XML export?
                // We will have to rely on existing products DB to fill barcode, 
                // or just use Code as fallback.
            });
        }

        return items;

    } catch (error) {
        console.error('XML Parse Error:', error);
        throw new Error('Failed to process XML file');
    }
};

module.exports = { parseExcelXml };
