const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.TINTOMETRICO_SUPABASE_URL;
const supabaseKey = process.env.TINTOMETRICO_SUPABASE_ANON_KEY;

let tintometricoSupabase = null;

if (supabaseUrl && supabaseKey) {
    try {
        tintometricoSupabase = createClient(supabaseUrl, supabaseKey);
    } catch (err) {
        console.error('Error al inicializar el cliente de Supabase de Tintometría:', err.message);
    }
} else {
    console.warn('⚠️ Tintometria Supabase URL o Key no están configurados. El módulo tintométrico estará inactivo.');
}

module.exports = tintometricoSupabase;
