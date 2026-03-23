require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importSecondaryUnits() {
    try {
        const filePath = path.join(__dirname, 'cantidad2.xlsx');
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            process.exit(1);
        }

        console.log('Reading Excel file...');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rawData = xlsx.utils.sheet_to_json(sheet);
        console.log(`Found ${rawData.length} rows.`);

        let updatedCount = 0;
        let notFoundCount = 0;

        for (const row of rawData) {
            // Trim whitespace from keys as 'Codigo      ' exists
            const getVal = (keyStr) => {
                const actualKey = Object.keys(row).find(k => k.trim().toLowerCase() === keyStr.toLowerCase());
                return actualKey ? row[actualKey] : null;
            };

            const code = getVal('Codigo') ? String(getVal('Codigo')).trim() : null;
            const primaryUnit = getVal('Unidad') ? String(getVal('Unidad')).trim() : null;
            const secondaryUnit = getVal('2a. Unid.Med') ? String(getVal('2a. Unid.Med')).trim() : null;
            const factor = getVal('Factor Conv.');
            const conversionType = getVal('Tipo de Conv') ? String(getVal('Tipo de Conv')).trim() : null;

            if (!code || !secondaryUnit) continue; // Skip if no code or no secondary unit info

            const updates = {
                primary_unit: primaryUnit,
                secondary_unit: secondaryUnit,
                conversion_factor: factor ? Number(factor) : null,
                conversion_type: conversionType
            };

            // Only update products that match the code, no UPSERT to avoid creating partial products
            const { data, error } = await supabase
                .from('products')
                .update(updates)
                .eq('code', code)
                .select('id');

            if (error) {
                console.error(`Error updating code ${code}:`, error.message);
            } else if (data && data.length > 0) {
                updatedCount++;
            } else {
                notFoundCount++;
            }
        }

        console.log(`\nImport finished.`);
        console.log(`Successfully updated: ${updatedCount} products.`);
        console.log(`Products not found in DB: ${notFoundCount}`);
    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

importSecondaryUnits();
