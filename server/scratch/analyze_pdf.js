const fs = require('fs');
const { parseRemitoPdf } = require('../pdfParser');
const path = require('path');

async function test() {
    const filePath = path.join(__dirname, '..', '20260421060653.pdf');
    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        return;
    }
    const buffer = fs.readFileSync(filePath);
    try {
        const result = await parseRemitoPdf(buffer);
        console.log('--- Metadata ---');
        console.log(JSON.stringify(result.metadata, null, 2));
        console.log('--- Is Devolucion ---', result.isDevolucion);
        console.log('--- Is Transferencia ---', result.isTransferencia);
        console.log('--- Items Count ---', result.items.length);
        console.log('--- Is Remito Flag ---', result.isRemito);
        console.log('--- Text Snippet (first 500 chars) ---');
        console.log(result.textSnippet.substring(0, 500));
        
        const hasRemitoWord = result.textSnippet.toUpperCase().includes('REMITO');
        console.log('--- Has word REMITO ---', hasRemitoWord);
    } catch (error) {
        console.error('Error parsing:', error);
    }
}

test();
