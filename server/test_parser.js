const fs = require('fs');
const path = require('path');
const { parseExcelXml } = require('./xmlParser');

async function testAll() {
    const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.xml') || f.endsWith('.xls') || f.endsWith('.xlsx'));
    console.log(`Found ${files.length} files to test.\n`);

    for (const file of files) {
        console.log(`--- Testing file: ${file} ---`);
        try {
            const filePath = path.join(__dirname, file);
            const buffer = fs.readFileSync(filePath);
            console.log('File size:', buffer.length, 'bytes');

            const startTime = Date.now();
            const result = await parseExcelXml(buffer);
            const duration = Date.now() - startTime;

            console.log('Parse successful! Time:', duration, 'ms');
            console.log('Result Inventory ID:', result.inventoryId || 'None');
            console.log('Items found:', result.items ? result.items.length : 0);

            if (result.items && result.items.length > 0) {
                console.log('Sample item:', JSON.stringify(result.items[0], null, 2));
            }
        } catch (e) {
            console.error('FAILED to parse:', file);
            console.error('Error:', e.message);
            // console.error(e.stack); 
        }
        console.log('----------------------------\n');
    }
}

testAll();
