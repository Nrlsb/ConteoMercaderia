const xlsx = require('xlsx');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
    console.error('Usage: node peek_xlsx.js <path_to_xlsx>');
    process.exit(1);
}

try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    console.log('Sheet Name:', sheetName);
    console.log('Total Rows:', rows.length);
    console.log('First 5 Rows:');
    rows.slice(0, 10).forEach((row, i) => {
        console.log(`Row ${i}:`, JSON.stringify(row));
    });
} catch (e) {
    console.error('Error reading XLSX:', e.message);
}
