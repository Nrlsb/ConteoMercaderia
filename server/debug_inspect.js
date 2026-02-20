
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log('Testing NULL insert for created_by...');

    // Test inserting NULL created_by
    const { data, error } = await supabase.from('general_counts').insert([{
        name: 'DEBUG_NULL_TEST_' + Date.now(),
        status: 'open',
        created_by: null
    }]).select();

    if (error) {
        console.error('NULL Insert FAILED:', error);
    } else {
        console.log('NULL Insert SUCCESS:', data[0].id);
        // Cleanup
        await supabase.from('general_counts').delete().eq('id', data[0].id);
    }
}

inspect();
