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

async function updateBarcodes() {
    try {
        const filePath = path.join(__dirname, 'CoddeBarras.xlsx');
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            process.exit(1);
        }

        console.log('Reading Excel file: CoddeBarras.xlsx...');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            console.error(`Sheet not found in Excel file!`);
            process.exit(1);
        }

        // Convert sheet to JSON array (including headers)
        const rawData = xlsx.utils.sheet_to_json(sheet);
        console.log(`Found ${rawData.length} rows in Excel.`);

        // Create a map of internal code to barcode
        const excelDataMap = new Map();
        for (const row of rawData) {
            const findKey = (partialKey) => Object.keys(row).find(k => k.trim().toLowerCase().includes(partialKey.toLowerCase()));

            const codeKey = findKey('Codigo');
            const barcodeKey = findKey('Cod. Barras');

            const code = row[codeKey] ? String(row[codeKey]).trim() : null;
            let barcode = row[barcodeKey] ? String(row[barcodeKey]).trim() : null;

            if (code && barcode && barcode !== 'NULL' && barcode !== 'null') {
                excelDataMap.set(code, barcode);
            }
        }

        console.log(`Mapped ${excelDataMap.size} unique code -> barcode pairs from Excel.`);

        // Get products from DB that don't have a barcode
        console.log('Fetching products with missing barcodes from DB...');
        const { data: dbProducts, error: fetchError } = await supabase
            .from('products')
            .select('id, code, description')
            .or('barcode.is.null,barcode.eq.""');

        if (fetchError) {
            console.error('Error fetching products:', fetchError);
            return;
        }

        console.log(`Found ${dbProducts.length} products in DB without barcode.`);

        const updates = [];
        for (const product of dbProducts) {
            const newBarcode = excelDataMap.get(product.code);
            if (newBarcode) {
                updates.push({
                    id: product.id,
                    barcode: newBarcode
                });
            }
        }

        if (updates.length === 0) {
            console.log('No updates needed. All products without barcode in DB are missing from Excel or already up to date.');
            return;
        }

        console.log(`Prepared ${updates.length} products to be updated.`);

        // If you want to run in dry-run mode first, you can uncomment this part and return
        // console.log('DRY RUN: This is what would be updated:');
        // console.log(updates.slice(0, 5));
        // return;

        // Perform updates in batches
        const batchSize = 100;
        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            console.log(`Updating batch ${i / batchSize + 1} (${batch.length} items)...`);

            // Supabase upsert with id will update existing records
            const { error: updateError } = await supabase
                .from('products')
                .upsert(batch, { onConflict: 'id' });

            if (updateError) {
                console.error(`Error updating batch starting at ${i}:`, updateError);
            } else {
                process.stdout.write('.');
            }
        }

        console.log('\nUpdate finished successfully.');

    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

updateBarcodes();
