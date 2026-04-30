const xlsx = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '../server/Layout.xlsx');

try {
    const workbook = xlsx.readFile(filePath);
    console.log('Sheet Names:', workbook.SheetNames);

    ['DepositoConStock', 'DepositoSinStock'].forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        if (sheet) {
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            console.log(`\n--- Sheet: ${sheetName} ---`);
            console.log('Total Rows:', rows.length);
            console.log('First 5 Rows:');
            rows.slice(0, 10).forEach((row, i) => {
                console.log(`Row ${i}:`, JSON.stringify(row));
            });
        } else {
            console.log(`\nSheet ${sheetName} NOT FOUND`);
        }
    });
} catch (e) {
    console.error('Error reading Layout.xlsx:', e.message);
}
