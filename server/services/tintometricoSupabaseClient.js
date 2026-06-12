const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.TINTOMETRICO_SUPABASE_URL;
const supabaseKey = process.env.TINTOMETRICO_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Tintometrico Supabase URL or Key in .env file');
}

const tintometricoSupabase = createClient(supabaseUrl, supabaseKey);

module.exports = tintometricoSupabase;
