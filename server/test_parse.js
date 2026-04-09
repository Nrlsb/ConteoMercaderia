const fs = require('fs');
const path = require('path');
const { parseRemitoPdf } = require('./pdfParser');

async function testParse() {
    const pdfPath = path.join(__dirname, '20260409070911.pdf');
    const dataBuffer = fs.readFileSync(pdfPath);

    try {
        const result = await parseRemitoPdf(dataBuffer, true);
        console.log('--- Metadata ---');
        console.log(JSON.stringify(result.metadata, null, 2));
        console.log('--- Items ---');
        console.log(JSON.stringify(result.items, null, 2));

        fs.writeFileSync('parse_results.json', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error testing parse:', error);
    }
}

testParse();
