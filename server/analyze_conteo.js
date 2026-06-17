const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'Grupo 101 al 104.xlsx');

try {
    const workbook = xlsx.readFile(filePath);
    console.log('Sheet Names:', workbook.SheetNames);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log('Total Rows:', rows.length);
    console.log('Headers:', rows[0]);
    
    // Look for codes like 450, 576, 513 or "000450", "000576", "000513"
    const targetCodes = ['000450', '000576', '000513', '450', '576', '513'];
    console.log('\n--- Searching targets in rows ---');
    rows.forEach((row, i) => {
        if (!row || row.length === 0) return;
        const rowString = JSON.stringify(row);
        if (targetCodes.some(tc => rowString.includes(tc)) || rowString.toLowerCase().includes('lija rubi') || rowString.toLowerCase().includes('lija al agua')) {
            console.log(`Row ${i}:`, row);
        }
    });

} catch (e) {
    console.error('Error:', e.message);
}
