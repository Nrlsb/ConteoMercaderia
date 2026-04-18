const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    try {
        const { data, error } = await supabase
            .from('inventory_scans_history')
            .select('*')
            .limit(1);
        
        if (error) {
            console.error('Error:', error);
            return;
        }
        
        if (data && data.length > 0) {
            console.log('Columns in inventory_scans_history:', Object.keys(data[0]));
        } else {
            console.log('Table is empty, trying to get columns from public.columns...');
            const { data: cols, error: colError } = await supabase
                .rpc('get_table_columns', { table_name: 'inventory_scans_history' });
            if (colError) console.error('RPC Error:', colError);
            else console.log('Columns:', cols);
        }
    } catch (e) {
        console.error(e);
    }
}

checkSchema();
