const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCodes() {
    console.log("Checking all products for specific underscores...");

    const { data: allProducts } = await supabase
        .from('products')
        .select('*');

    console.log(`Total products downloaded: ${allProducts.length}`);

    // Find completely underscored ones
    const underscored = allProducts.filter(p => p.barcode === '_______________');
    console.log(`Found exact 15 underscores: ${underscored.length}`);
    if (underscored.length > 0) {
        console.dir(underscored[0]);
    }

    // Find specifically the codes from the screenshot
    const codes = ['004889', '004877', '079338', '001412', '079239', '004886'];
    const matchingCodes = allProducts.filter(p => codes.includes(p.code));

    console.log(`\nFound matching known codes: ${matchingCodes.length}`);
    if (matchingCodes.length > 0) {
        matchingCodes.forEach(p => console.log(`Code: ${p.code} - Barcode: '${p.barcode}'`));
    }
}

checkCodes();
