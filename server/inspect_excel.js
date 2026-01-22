const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'BDConteo.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = 'BD';
const sheet = workbook.Sheets[sheetName];

if (!sheet) {
    console.error(`Sheet "${sheetName}" not found! Available sheets: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
}

// Get range
const range = xlsx.utils.decode_range(sheet['!ref']);
// Read first row (headers)
const headers = [];
for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c: C });
    const cell = sheet[cellAddress];
    if (cell && cell.v) {
        headers.push(cell.v);
    }
}

console.log('Headers in "BD" sheet:', headers);
