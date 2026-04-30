const supabase = require('../server/services/supabaseClient');

async function testQuery() {
    try {
        let query = supabase
            .from('barcode_history')
            .select(`
                id,
                action_type,
                product_id,
                product_description,
                details,
                created_by,
                created_at,
                users:created_by (username),
                products:product_id (barcode)
            `, { count: 'exact' })
            .order('created_at', { ascending: false });

        // Simulate the SCAN action types filter
        query = query.in('action_type', ['SCAN', 'ADD_BARCODE', 'UPDATE_BARCODE']);

        const { data, count, error } = await query.range(0, 49);

        if (error) {
            console.error('SUPABASE ERROR:', error);
        } else {
            console.log('SUCCESS: Got', data.length, 'rows');
            console.log('Sample row:', JSON.stringify(data[0], null, 2));
        }
    } catch (err) {
        console.error('PROCESS ERROR:', err);
    }
}

testQuery();
