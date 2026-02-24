const xlsx = require('xlsx');

try {
    const workbook = xlsx.readFile('CodProdProveedores2.xlsx');
    const sheetName = '2-Vinc. Producto vs. Proveedo';
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    console.log('--- Checking Codes ---');
    let count = 0;
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row && row[0] && String(row[0]).trim() !== '' && row[0] !== 'Producto') {
            console.log(`Row: ${i}`);
            console.log(`  Producto (idx 0): ${row[0]}`);
            console.log(`  Descripcion (idx 1): ${row[1]}`);
            const lastIdx = row.length - 1;
            console.log(`  Prov Code (last idx: ${lastIdx}): ${row[lastIdx]}`);
            count++;
            if (count >= 10) break;
        }
    }
} catch (e) {
    console.error(e);
}
