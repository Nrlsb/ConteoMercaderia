const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'conteoSuc13.xlsx');
const workbook = xlsx.readFile(filePath);

console.log('Hojas disponibles:', workbook.SheetNames);

workbook.SheetNames.forEach(name => {
    console.log(`\n--- Hoja: ${name} ---`);
    const sheet = workbook.Sheets[name];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log(JSON.stringify(data.slice(0, 10), null, 2));
});
