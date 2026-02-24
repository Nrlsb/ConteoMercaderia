const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);

async function runSQL() {
    console.log('Creando tabla barcode_history...');
    const { data, error } = await supabase.rpc('run_sql', { 
        sql_query: "create table if not exists barcode_history (id uuid default uuid_generate_v4() primary key, action_type text, product_id uuid references products(id) on delete set null, product_description text, details text, created_by text, created_at timestamp with time zone default now());"
    });
    
    // Fallback: This might fail if run_sql rpc is not defined in Supabase.
    // Generally, Supabase JS client doesn't support raw DDL directly from client without an RPC function.
    if(error){
        console.log('Error o RPC no soportado:', error.message);
        console.log('Por favor, ejecute el SQL de schema.sql manualmente en la consola SQL de Supabase.');
    } else {
        console.log('Exito.', data);
    }
}
runSQL();
