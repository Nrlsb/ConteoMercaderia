const supabase = require('../services/supabaseClient');

// Helper to record barcode history
async function recordBarcodeHistory(productId, oldBarcode, newBarcode, userId, description = 'Actualización de producto') {
    // Treat empty strings or dashes as null/empty
    const normalize = (val) => (val && val.trim() !== '' && !/^[-_]+$/.test(val.trim())) ? val.trim() : null;

    const oldB = normalize(oldBarcode);
    const newB = normalize(newBarcode);

    if (oldB === newB) return;

    try {
        const actionType = oldB ? 'UPDATE_BARCODE' : 'ADD_BARCODE';
        const details = oldB ? `De ${oldB} a ${newB || '(vacío)'}` : `Código inicial: ${newB}`;

        // Salvaguarda contra duplicados rápidos (clicks múltiples o reconexiones)
        // Buscamos si ya se grabó exactamente lo mismo en los últimos 5 segundos
        const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
        const { data: existing } = await supabase
            .from('barcode_history')
            .select('id')
            .eq('product_id', productId)
            .eq('action_type', actionType)
            .eq('details', details)
            .eq('created_by', userId)
            .gte('created_at', fiveSecondsAgo)
            .maybeSingle();

        if (existing) {
            console.warn(`[HISTORY] Registro duplicado ignorado para producto ${productId} en ventana de 5s.`);
            return;
        }

        const { error } = await supabase
            .from('barcode_history')
            .insert([{
                action_type: actionType,
                product_id: productId,
                product_description: description || 'Sin descripción',
                details: details,
                created_by: userId,
                created_at: new Date().toISOString()
            }]);

        if (error) {
            console.error('[HISTORY ERROR] Could not record barcode history:', error.message);
        }
    } catch (err) {
        console.error('[HISTORY ERROR] Unexpected error recording barcode history:', err.message);
    }
}

// Helper to fetch ALL barcode history with batching (Supabase 1000 limit)
async function getAllBarcodeHistory(filters = {}) {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
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
                products:product_id (barcode, code, provider_code)
            `)
            .order('created_at', { ascending: false });

        if (filters.action_type) {
            const types = filters.action_type.split(',').filter(t => t.trim() !== '');
            if (types.length > 1) {
                query = query.in('action_type', types);
            } else if (types.length === 1) {
                query = query.eq('action_type', types[0]);
            }
        }
        if (filters.user_id) {
            const userIds = Array.isArray(filters.user_id)
                ? filters.user_id
                : typeof filters.user_id === 'string'
                    ? filters.user_id.split(',').filter(id => id.trim() !== '')
                    : [filters.user_id];

            if (userIds.length > 0) {
                query = query.in('created_by', userIds);
            }
        }

        if (filters.productCode) {
            const pCode = filters.productCode.trim();
            query = query.or(`product_description.ilike.%${pCode}%,products(code).ilike.%${pCode}%`);
        }

        if (filters.startDate) {
            query = query.gte('created_at', `${filters.startDate}T00:00:00.000Z`);
        }
        if (filters.endDate) {
            query = query.lte('created_at', `${filters.endDate}T23:59:59.999Z`);
        }

        const { data, error } = await query.range(from, from + step - 1);

        if (error) {
            console.error('Error in getAllBarcodeHistory batch:', error);
            throw error;
        }

        if (data && data.length > 0) {
            allData = [...allData, ...data];
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    if (filters.unique === 'true' || filters.unique === true) {
        const uniqueMap = new Map();
        allData.forEach(item => {
            const key = item.product_id || item.product_description;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, item);
            }
        });
        return Array.from(uniqueMap.values());
    }

    return allData;
}

/**
 * Helper to fetch specific products by codes in chunks to avoid Supabase/PostgREST limits
 */
async function fetchProductsByCodes(codes) {
    if (!codes || codes.length === 0) return [];

    let allData = [];
    const chunkSize = 500; // conservative chunk size for .in() filters

    for (let i = 0; i < codes.length; i += chunkSize) {
        const chunk = codes.slice(i, i + chunkSize);
        const { data, error } = await supabase
            .from('products')
            .select('code, description, excel_order, provider_code')
            .in('code', chunk);

        if (error) throw error;
        if (data) allData = allData.concat(data);
    }
    return allData;
}

/**
 * Helper unified product search function:
 * Order: Barcode -> Internal Code -> Provider Code
 * @param {string} inputCode - The code to search for
 * @param {string} type - The type of search: 'any', 'barcode', 'internal', 'provider'
 */
async function findProductByAnyCode(inputCode, type = 'any') {
    if (!inputCode) return null;
    const codeStr = String(inputCode).trim();

    try {
        // 1. Try exact barcode match (Primary and Secondary)
        if (type === 'any' || type === 'barcode') {
            // Check primary barcode
            const { data: pBar } = await supabase.from('products').select('*').eq('barcode', codeStr).limit(1);
            if (pBar && pBar.length > 0) return pBar[0];

            // Check secondary barcode
            const { data: pBarSec } = await supabase.from('products').select('*').eq('barcode_secondary', codeStr).limit(1);
            if (pBarSec && pBarSec.length > 0) return pBarSec[0];
        }

        // 2. Try internal code
        if (type === 'any' || type === 'internal') {
            const { data: pCode } = await supabase.from('products').select('*').eq('code', codeStr).limit(1);
            if (pCode && pCode.length > 0) return pCode[0];
        }

        // 3. Try provider code (with leading-zero tolerance)
        if (type === 'any' || type === 'provider') {
            const { data: pProv } = await supabase.from('products').select('*').eq('provider_code', codeStr).limit(1);
            if (pProv && pProv.length > 0) return pProv[0];

            // Try stripping leading zeros (e.g. scanned "012345" → stored "12345")
            const stripped = codeStr.replace(/^0+/, '');
            if (stripped && stripped !== codeStr) {
                const { data: pStripped } = await supabase.from('products').select('*').eq('provider_code', stripped).limit(1);
                if (pStripped && pStripped.length > 0) return pStripped[0];
            }

            // Try adding a leading zero (e.g. scanned "12345" → stored "012345")
            const withZero = '0' + codeStr;
            const { data: pWithZero } = await supabase.from('products').select('*').eq('provider_code', withZero).limit(1);
            if (pWithZero && pWithZero.length > 0) return pWithZero[0];
        }

        // 4. Try provider description (Case-insensitive & High Precision)
        if (type === 'any' || type === 'provider') {
            const cleanDesc = codeStr.trim().replace(/\s+/g, ' ');
            const { data: matches } = await supabase
                .from('products')
                .select('*')
                .ilike('provider_description', `%${cleanDesc}%`)
                .limit(1);

            if (matches && matches.length > 0) return matches[0];
        }

        return null;
    } catch (error) {
        console.error(`Error resolving product for code ${codeStr}:`, error);
        return null;
    }
}

module.exports = {
    recordBarcodeHistory,
    getAllBarcodeHistory,
    fetchProductsByCodes,
    findProductByAnyCode
};
