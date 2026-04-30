const supabase = require('../server/services/supabaseClient');

async function testOrQueryFixed() {
    try {
        const pCode = '000817'; 
        let query = supabase
            .from('barcode_history')
            .select(`
                id,
                product_description,
                products:product_id (barcode, code)
            `)
            .or(`product_description.ilike.%${pCode}%,products.code.ilike.%${pCode}%,products.barcode.ilike.%${pCode}%`);

        const { data, error } = await query.limit(5);

        if (error) {
            console.error('SUPABASE OR ERROR:', error);
        } else {
            console.log('SUCCESS: Got', data.length, 'rows');
            console.log('Sample row:', JSON.stringify(data[0], null, 2));
        }
    } catch (err) {
        console.error('PROCESS ERROR:', err);
    }
}

testOrQueryFixed();
