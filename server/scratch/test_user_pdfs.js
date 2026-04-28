const fs = require('fs');
const path = require('path');
const { parseRemitoPdf } = require('../pdfParser');

async function testFiles() {
    const files = ['260427084316.pdf', '260427084346.pdf', '260427084403.pdf'];
    
    for (const fileName of files) {
        console.log(`\n=== Testing File: ${fileName} ===`);
        const pdfPath = path.join(__dirname, '..', fileName);
        if (!fs.existsSync(pdfPath)) {
            console.log(`File ${fileName} not found in ${__dirname}`);
            continue;
        }
        
        const dataBuffer = fs.readFileSync(pdfPath);

        try {
            const result = await parseRemitoPdf(dataBuffer, false); // stopOnCopies = false for normal receipts
            console.log('Metadata:', JSON.stringify(result.metadata, null, 2));
            console.log('Items Count:', result.items.length);
            if (result.items.length > 0) {
                console.log('First 3 items:', JSON.stringify(result.items.slice(0, 3), null, 2));
            } else {
                console.log('NO ITEMS FOUND with regex parser.');
            }
        } catch (error) {
            console.error(`Error parsing ${fileName}:`, error);
        }
    }
}

testFiles();
