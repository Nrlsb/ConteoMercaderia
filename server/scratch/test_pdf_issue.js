const fs = require('fs');
const path = require('path');
const { parseRemitoPdf } = require('../pdfParser');

async function testPdf(filename) {
    console.log(`\n=== Testing PDF: ${filename} ===`);
    try {
        const filePath = path.join(__dirname, '..', filename);
        if (!fs.existsSync(filePath)) {
            console.log(`File not found: ${filePath}`);
            return;
        }
        const buffer = fs.readFileSync(filePath);
        const result = await parseRemitoPdf(buffer, false); // Don't stop on copies for testing

        console.log(`Metadata:`, result.metadata);
        console.log(`Items found: ${result.items.length}`);
        
        // Search specifically for the items mentioned by the user
        const searchItems = [
            '001483', // Aerosol Negro
            '001620'  // Aerosol Rosa
        ];

        console.log('\n--- Search Results ---');
        searchItems.forEach(code => {
            const item = result.items.find(i => i.code === code);
            const lines = result.textSnippet.split('\n');
            const matchingLines = lines.filter(l => l.includes(code));

            if (item) {
                console.log(`MATCH FOUND (Items): Code: ${item.code}, Desc: ${item.description}, Qty: ${item.quantity}`);
                if (matchingLines.length > 0) {
                    console.log(`  [RAW LINE for match]: "${matchingLines[0].trim()}"`);
                }
            } else {
                console.log(`NOT FOUND in Items: Code: ${code}`);
                if (matchingLines.length > 0) {
                    console.log(`  Found "${code}" in raw text lines:`);
                    matchingLines.forEach(l => console.log(`    [RAW]: "${l}"`));
                } else {
                    console.log(`  NOT FOUND in raw text either.`);
                }
            }
        });

        // Log first 10 items
        console.log('\nTop 10 items:');
        result.items.slice(0, 10).forEach(item => {
            console.log(`- ${item.code} | ${item.quantity} | ${item.description}`);
        });

    } catch (e) {
        console.error(`Error parsing ${filename}:`, e);
    }
}

async function runTests() {
    await testPdf('20260420103849.pdf');
    await testPdf('20260421081615.pdf');
}

runTests();
