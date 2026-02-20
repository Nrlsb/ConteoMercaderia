const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getAllScansBatch(orderNumbers) {
    let allScans = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('inventory_scans')
            .select('order_number, code, quantity')
            .in('order_number', orderNumbers)
            .range(from, from + step - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            allScans = [...allScans, ...data];
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allScans;
}

async function testRemitos() {
    console.log("Starting test...");
    try {
        const { data: remitosData, error: remitosError } = await supabase
            .from('remitos')
            .select('*')
            .order('date', { ascending: false });
        if (remitosError) throw remitosError;
        console.log("Remitos fetched:", remitosData.length);

        const { data: preRemitosData, error: preRemitosError } = await supabase
            .from('pre_remitos')
            .select(`id, order_number, status, items, created_at, id_inventory, pedidos_ventas (numero_pv, sucursal)`);
        if (preRemitosError) throw preRemitosError;
        console.log("Pre-Remitos fetched:", preRemitosData.length);

        const { data: countsData } = await supabase.from('general_counts').select('id, name');
        
        const pendingPreRemitos = preRemitosData.filter(p => p.status === 'pending');
        
        const { data: openGeneralCounts, error: openCountsError } = await supabase
            .from('general_counts')
            .select('*')
            .eq('status', 'open');
        console.log("Open General Counts fetched:", openGeneralCounts ? openGeneralCounts.length : 0);

        const pendingOrderNumbers = pendingPreRemitos.map(p => p.order_number);
        const openCountIds = (openGeneralCounts || []).map(c => c.id);
        const allRelevantIds = [...pendingOrderNumbers, ...openCountIds];
        
        console.log("All Relevant IDs:", allRelevantIds.length, allRelevantIds);
        
        if (allRelevantIds.length > 0) {
            console.log("Calling getAllScansBatch...");
            const allScans = await getAllScansBatch(allRelevantIds);
            console.log("Scans fetched:", allScans.length);
            
            const uniqueScanCodes = [...new Set(allScans.map(s => s.code))];
            console.log("Unique scan codes:", uniqueScanCodes.length);
            
            if (uniqueScanCodes.length > 0) {
                // To avoid large URIs in Supabase 'in' filter, maybe this is the issue?
                console.log("Fetching products for these codes...");
                const { data: productsData, error: productError } = await supabase
                    .from('products')
                    .select('code, description, brand')
                    .in('code', uniqueScanCodes);
                if (productError) throw productError;
                console.log("Products fetched:", productsData.length);
            }
        }
        
        console.log("Success!");
    } catch (e) {
        console.error("ERROR:", e.message || e);
    }
}

testRemitos();
