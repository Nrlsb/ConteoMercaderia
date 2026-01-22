const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Load env vars
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importProducts() {
    try {
        const filePath = path.join(__dirname, 'BDConteo.xlsx');
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            process.exit(1);
        }

        console.log('Reading Excel file...');
        const workbook = xlsx.readFile(filePath);
        const sheetName = 'BD';
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            console.error(`Sheet "${sheetName}" not found!`);
            process.exit(1);
        }

        // Convert sheet to JSON
        const rawData = xlsx.utils.sheet_to_json(sheet);
        console.log(`Found ${rawData.length} rows.`);

        const products = [];
        const seenCodes = new Set();
        const batchSize = 1000;

        // Header mapping based on inspection:
        // 'Producto    ' -> code
        // 'Desc. Prod  ' -> description
        // 'CodeBar'      -> barcode

        for (const row of rawData) {
            // Helper to find key containing string (handling whitespace)
            const findKey = (partialKey) => Object.keys(row).find(k => k.trim() === partialKey);

            const codeKey = findKey('Producto');
            const descKey = findKey('Desc. Prod');
            const barcodeKey = findKey('CodeBar');

            const code = row[codeKey] ? String(row[codeKey]).trim() : null;
            const description = row[descKey] ? String(row[descKey]).trim() : null;
            let barcode = row[barcodeKey] ? String(row[barcodeKey]).trim() : null;

            if (!code) continue; // Skip if no code

            // Basic validation/cleaning
            if (barcode === 'NULL' || barcode === 'null' || barcode === '') {
                barcode = null;
            }

            // Deduplicate
            if (seenCodes.has(code)) {
                console.warn(`Duplicate code found: ${code}. Skipping.`);
                continue;
            }
            seenCodes.add(code);

            products.push({
                code: code,
                description: description,
                barcode: barcode
            });
        }

        console.log(`Prepared ${products.length} products for import.`);

        // Batch insert/upsert
        for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize);
            console.log(`Unpserting batch ${i} to ${i + batch.length}...`);

            const { error } = await supabase
                .from('products')
                .upsert(batch, { onConflict: 'code' }); // Use 'code' as unique constraint

            if (error) {
                console.error('Error inserting batch:', error);
            } else {
                process.stdout.write('.');
            }
        }

        console.log('\nImport finished.');

    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

importProducts();
