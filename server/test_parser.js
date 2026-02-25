const fs = require('fs');
const path = require('path');
const { parseExcelXml } = require('./xmlParser');

async function test() {
    try {
        const filePath = path.join(__dirname, 'ConteoSuc2.xml');
        const buffer = fs.readFileSync(filePath);
        console.log('File read, size:', buffer.length);

        const result = await parseExcelXml(buffer);
        console.log('Result Inventory ID:', result.inventoryId);
        console.log('Items found:', result.items.length);

        if (result.items.length > 0) {
            console.log('First 3 items:', JSON.stringify(result.items.slice(0, 3), null, 2));
        } else {
            console.log('No items found. Checking why...');
        }
    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
