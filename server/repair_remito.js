
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Pagination Helper
async function getAllScans(orderNumber) {
    let allScans = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        console.log(`Fetching scans range ${from} - ${from + step - 1}...`);
        const { data, error } = await supabase
            .from('inventory_scans')
            .select('code, quantity')
            .eq('order_number', orderNumber)
            .range(from, from + step - 1);

        if (error) {
            console.error('Error in getAllScans:', error);
            throw error;
        }

        if (data && data.length > 0) {
            allScans = [...allScans, ...data];
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allScans;
}

async function getAllProducts() {
    let allProducts = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        console.log(`Fetching products range ${from} - ${from + step - 1}...`);
        const { data, error } = await supabase
            .from('products')
            .select('code, description, barcode, current_stock')
            .range(from, from + step - 1);

        if (error) {
            console.error('Error in getAllProducts:', error);
            throw error;
        }

        if (data && data.length > 0) {
            allProducts = [...allProducts, ...data];
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allProducts;
}

async function repairRemito(remitoNumber) {
    console.log(`Repairing Remito Number: ${remitoNumber}`);

    // 1. Get Remito by Number
    const { data: remito, error } = await supabase
        .from('remitos')
        .select('*')
        .eq('remito_number', remitoNumber)
        .maybeSingle();

    if (error) {
        console.error('Error fetching remito:', error);
        return;
    }
    if (!remito) {
        console.log('Remito not found in remitos table.');
        return;
    }
    console.log(`Found Remito PK: ${remito.id}`);

    // 2. Fetch ALL Scans
    const scans = await getAllScans(remitoNumber);
    console.log(`Total Scans Found: ${scans.length}`);

    // 3. Aggregate
    const totals = {};
    scans.forEach(scan => {
        totals[scan.code] = (totals[scan.code] || 0) + (scan.quantity || 0);
    });

    // Check specific product
    console.log(`Scanned count for 001392: ${totals['001392'] || 0}`);

    const codes = Object.keys(totals);

    // 4. Fetch ALL Products
    const allProducts = await getAllProducts();
    console.log(`Total Products Found: ${allProducts.length}`);

    // 5. Build Report
    const report = allProducts.map(product => {
        const quantity = totals[product.code] || 0;
        return {
            code: product.code,
            barcode: product.barcode || '',
            description: product.description || 'Sin descripción',
            quantity,
            stock: product.current_stock || 0,
            difference: quantity - (product.current_stock || 0)
        };
    });

    // Add unknown items
    const productCodes = new Set(allProducts.map(p => p.code));
    codes.forEach(scannedCode => {
        if (!productCodes.has(scannedCode)) {
            report.push({
                code: scannedCode,
                barcode: '',
                description: 'Producto Desconocido (No en BD)',
                quantity: totals[scannedCode],
                stock: 0,
                difference: totals[scannedCode]
            });
        }
    });

    report.sort((a, b) => a.description.localeCompare(b.description));

    // 6. Create Discrepancies Object
    const discrepancies = {
        missing: report.filter(i => i.difference < 0).map(i => ({
            code: i.code,
            barcode: i.barcode,
            description: i.description,
            expected: i.stock,
            scanned: i.quantity,
            reason: 'missing' // reset reason if generic repair
        })),
        extra: report.filter(i => i.difference > 0).map(i => ({
            code: i.code,
            barcode: i.barcode,
            description: i.description,
            expected: i.stock,
            scanned: i.quantity
        }))
    };

    console.log(`New Discrepancies Count -> Missing: ${discrepancies.missing.length}, Extra: ${discrepancies.extra.length}`);

    // Check specific product in discrepancies
    const m = discrepancies.missing.find(i => i.code === '001392');
    const e = discrepancies.extra.find(i => i.code === '001392');
    console.log('001392 status in new report:', m ? 'MISSING' : e ? 'EXTRA' : 'OK (MATCH)');
    if (m) console.log('Missing details:', m);
    if (e) console.log('Extra details:', e);

    // 7. Save to DB using the PK
    const { error: updateError } = await supabase
        .from('remitos')
        .update({ discrepancies: discrepancies })
        .eq('id', remito.id);

    if (updateError) {
        console.error('Error updating remito:', updateError);
    } else {
        console.log('✅ Remito updated successfully.');
    }
}

// ID obtained from previous debug step
const REMITO_NUMBER = '264e14ad-cc3d-46f6-a507-18ae89a4e662';
repairRemito(REMITO_NUMBER);
