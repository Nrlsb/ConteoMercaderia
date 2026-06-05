const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function runSQL() {
    console.log('Aplicando migración 026 (agregar columna notif_confirmacion_enviada)...');
    
    const sqlPath = path.join(__dirname, 'migrations', '026_add_notif_sent_to_seguimiento_pedidos.sql');
    const sqlQuery = fs.readFileSync(sqlPath, 'utf8');
    
    const { data, error } = await supabase.rpc('run_sql', { 
        sql_query: sqlQuery
    });
    
    if (error) {
        console.error('Error al aplicar la migración por RPC run_sql:', error.message);
        console.log('\nPor favor, ejecuta la siguiente consulta manualmente en el SQL Editor de Supabase:');
        console.log('--------------------------------------------------');
        console.log(sqlQuery);
        console.log('--------------------------------------------------');
    } else {
        console.log('¡Migración aplicada con éxito!', data);
    }
}

runSQL();
