const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

async function peek() {
    const filePath = path.join(__dirname, '658.xls');
    if (!fs.existsSync(filePath)) {
        console.error('File 658.xls not found in server directory');
        return;
    }

    try {
        const buffer = fs.readFileSync(filePath);
        const workbook = xlsx.read(buffer, { type: 'buffer' });

        console.log('--- 658.xls INFO ---');
        console.log('SheetNames:', workbook.SheetNames);

        workbook.SheetNames.forEach(name => {
            console.log(`\n--- Sheet: ${name} ---`);
            const sheet = workbook.Sheets[name];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            console.log('Total rows:', rows.length);
            console.log('First 10 rows:');
            console.log(JSON.stringify(rows.slice(0, 10), null, 2));
        });
    } catch (e) {
        console.error('Error peeking at 658.xls:', e);
    }
}

peek();
