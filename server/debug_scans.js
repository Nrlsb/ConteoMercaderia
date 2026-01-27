
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env in current dir
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugproduct() {
    const code = '001392';
    console.log(`Checking scans for code: ${code}`);

    // 1. Check Inventory Scans
    const { data: scans, error: scanError } = await supabase
        .from('inventory_scans')
        .select('*')
        .eq('code', code);

    if (scanError) {
        console.error('Error fetching scans:', scanError);
    } else {
        console.log(`Found ${scans.length} scans for product ${code}:`);
        console.table(scans);
    }

    // 2. Check Remitos/Counts that might be related
    if (scans && scans.length > 0) {
        const orderNumbers = [...new Set(scans.map(s => s.order_number))];
        console.log('Order Numbers found in scans:', orderNumbers);

        for (const orderNum of orderNumbers) {
            console.log(`\nChecking Order/Remito: ${orderNum}`);

            // Check remitos table
            const { data: remito, error: remitoError } = await supabase
                .from('remitos')
                .select('*')
                .eq('remito_number', orderNum)
                .maybeSingle();

            if (remito) {
                console.log('Found in REMITOS table (Finalized):', {
                    id: remito.id,
                    remito_number: remito.remito_number,
                    date: remito.date,
                    status: remito.status
                    // items: remito.items // too big to print maybe
                });

                // key check: is this product in the items list?
                const item = (remito.items || []).find(i => i.code === code);
                console.log('Is product in expected items? ', item ? 'YES via code' : 'NO');

                if (item) {
                    console.log('Expected Item Details:', item);
                } else {
                    // Check discrepancies
                    const extra = (remito.discrepancies?.extra || []).find(i => i.code === code);
                    console.log('Is product in EXTRA discrepancies? ', extra ? 'YES' : 'NO');
                    if (extra) console.log('Extra Details:', extra);

                    const missing = (remito.discrepancies?.missing || []).find(i => i.code === code);
                    console.log('Is product in MISSING discrepancies? ', missing ? 'YES' : 'NO');
                    if (missing) console.log('Missing Details:', missing);
                }

            } else {
                console.log('Not found in REMITOS table.');
            }

            // Check general_counts table
            const { data: gc } = await supabase
                .from('general_counts')
                .select('*')
                .eq('id', orderNum)
                .maybeSingle();

            if (gc) {
                console.log('Found in GENERAL_COUNTS table:', gc);
            }
        }
    }
}

debugproduct();
