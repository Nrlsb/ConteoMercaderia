const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'BDConteo.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = 'BD';
const sheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(sheet);
console.log('First 5 rows:', JSON.stringify(data.slice(0, 5), null, 2));
