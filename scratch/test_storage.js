const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testStorage() {
    console.log('Testing Supabase Storage connection...');
    console.log('URL:', supabaseUrl);
    console.log('Key prefix:', supabaseKey?.substring(0, 10));

    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
        console.error('Error listing buckets:', bucketsError);
        return;
    }

    console.log('Available buckets:', buckets.map(b => b.name));

    const targetBucket = 'receipt-documents';
    if (!buckets.find(b => b.name === targetBucket)) {
        console.error(`Bucket "${targetBucket}" not found!`);
        return;
    }

    console.log(`Listing files in bucket "${targetBucket}" (root)...`);
    const { data: files, error: filesError } = await supabase.storage.from(targetBucket).list('', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'desc' }
    });

    if (filesError) {
        console.error('Error listing files:', filesError);
        return;
    }

    console.log('Files found:', files.map(f => f.name));
    
    // Check uploads folder
    console.log(`Listing files in bucket "${targetBucket}" (uploads/)...`);
    const { data: uploadsFiles, error: uploadsError } = await supabase.storage.from(targetBucket).list('uploads', {
        limit: 10,
    });
    if (!uploadsError) {
        console.log('Files in uploads/:', uploadsFiles.map(f => f.name));
    }
}

testStorage();
