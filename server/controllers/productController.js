const supabase = require('../services/supabaseClient');
const { recordBarcodeHistory, findProductByAnyCode, findProductsByAnyCode } = require('../utils/dbHelpers');
const protheusService = require('../services/protheusService');

// Search products by query (smart search: description, code, or provider code)
exports.searchProducts = async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    try {
        // Try RPC first (which does advanced full-text or fuzzy search if it exists)
        const { data: rpcData, error: rpcError } = await supabase.rpc('search_products', { search_term: q });

        if (!rpcError && rpcData) {
            return res.json(rpcData);
        }

        // Fallback to JS smart search if RPC fails or doesn't exist
        const terms = q.trim().split(/\s+/).filter(Boolean);

        // Build an 'And' string for description: 'description.ilike.%word1%,description.ilike.%word2%'
        const descAnds = terms.map(t => `description.ilike.%${t}%`).join(',');

        // Overall OR: either it matches all words in description, OR it matches the exact code or provider_code
        const exactMatchTerm = `%${q.trim()}%`;
        const orString = `and(${descAnds}),code.ilike.${exactMatchTerm},provider_code.ilike.${exactMatchTerm},barcode_secondary.ilike.${exactMatchTerm}`;

        const { data, error } = await supabase
            .from('products')
            .select('*')
            .or(orString)
            .limit(100);

        if (error) throw error;
        return res.json(data);
    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({ message: 'Error al buscar productos' });
    }
};

// Sync products for local DB (IndexedDB)
exports.syncProducts = async (req, res) => {
    try {
        let allData = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        console.log(`[SYNC] Iniciando sincronización completa de productos para usuario: ${req.user.username}`);

        while (hasMore) {
            const { data, error, count } = await supabase
                .from('products')
                .select('id, code, barcode, barcode_secondary, description, brand, brand_code, primary_unit, secondary_unit, conversion_factor, conversion_type, provider_description, provider_code, counting_category, capacity, real_weight, cost_price, tes, lista001, lista500, moneda', { count: 'exact' })
                .order('code', { ascending: true })
                .order('id', { ascending: true })
                .range(from, from + step - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                allData = allData.concat(data);
                if (data.length < step) {
                    hasMore = false;
                } else {
                    from += step;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`[SYNC] Sincronización finalizada exitosamente. Total: ${allData.length} productos.`);
        res.json(allData);
    } catch (error) {
        console.error('Error syncing products:', error);
        res.status(500).json({ message: 'Error syncing products', details: error.message });
    }
};

// Get product by exact barcode
exports.getByBarcode = async (req, res) => {
    const { barcode } = req.params;

    try {
        const { data: matches, error } = await supabase
            .from('products')
            .select('*')
            .eq('barcode', barcode);

        if (error) throw error;

        if (!matches || matches.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        if (matches.length > 1) {
            return res.json(matches);
        }

        return res.json(matches[0]);
    } catch (error) {
        console.error('Error fetching product by barcode:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// Create a new product
exports.createProduct = async (req, res) => {
    const { 
        code, 
        description, 
        barcode, 
        barcode_secondary, 
        brand, 
        brand_code,
        primary_unit, 
        secondary_unit, 
        conversion_factor, 
        conversion_type, 
        counting_category, 
        capacity, 
        real_weight, 
        provider_code, 
        provider_description,
        cost_price
    } = req.body;

    if (!code || !code.trim()) {
        return res.status(400).json({ message: 'El código de producto es requerido' });
    }
    if (!description || !description.trim()) {
        return res.status(400).json({ message: 'La descripción del producto es requerida' });
    }

    try {
        // Verificar duplicados
        const { data: existing, error: checkError } = await supabase
            .from('products')
            .select('id')
            .eq('code', code.trim())
            .maybeSingle();

        if (checkError) throw checkError;
        if (existing) {
            return res.status(400).json({ message: `Ya existe un producto con el código "${code}"` });
        }

        const insertData = {
            code: code.trim(),
            description: description.trim(),
            barcode: barcode || null,
            barcode_secondary: barcode_secondary || null,
            brand: brand || null,
            brand_code: brand_code || null,
            primary_unit: primary_unit || null,
            secondary_unit: secondary_unit || null,
            conversion_factor: conversion_factor !== undefined && conversion_factor !== '' && conversion_factor !== null ? parseFloat(conversion_factor) : null,
            conversion_type: conversion_type || null,
            counting_category: counting_category || null,
            capacity: capacity || null,
            real_weight: real_weight || null,
            provider_code: provider_code || null,
            provider_description: provider_description || null,
            cost_price: cost_price !== undefined && cost_price !== '' && cost_price !== null ? parseFloat(cost_price) : 0
        };

        const { data, error } = await supabase
            .from('products')
            .insert([insertData])
            .select()
            .single();

        if (error) throw error;

        // Registrar historial de código de barras inicial si se definió
        if (barcode) {
            await recordBarcodeHistory(data.id, null, barcode, req.user.id, data.description);
        }

        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ message: 'Error al crear el producto', details: error.message });
    }
};

// Update product details
exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    const { 
        description, 
        code, 
        barcode, 
        barcode_secondary, 
        brand, 
        brand_code,
        primary_unit, 
        secondary_unit, 
        conversion_factor, 
        conversion_type, 
        counting_category, 
        capacity, 
        real_weight, 
        provider_code, 
        provider_description,
        cost_price
    } = req.body;

    try {
        // Fetch current product state before update for history logging
        const { data: currentProduct, error: fetchError } = await supabase
            .from('products')
            .select('barcode, description')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) {
            console.error('[UPDATE ERROR] Error fetching product for history:', fetchError.message);
        }

        const updateData = {};
        if (description !== undefined) updateData.description = description;
        if (code !== undefined) updateData.code = code;
        if (barcode !== undefined) updateData.barcode = barcode;
        if (barcode_secondary !== undefined) updateData.barcode_secondary = barcode_secondary;
        if (brand !== undefined) updateData.brand = brand;
        if (brand_code !== undefined) updateData.brand_code = brand_code;
        if (primary_unit !== undefined) updateData.primary_unit = primary_unit;
        if (secondary_unit !== undefined) updateData.secondary_unit = secondary_unit;
        if (conversion_factor !== undefined) {
            updateData.conversion_factor = conversion_factor !== '' && conversion_factor !== null ? parseFloat(conversion_factor) : null;
        }
        if (conversion_type !== undefined) updateData.conversion_type = conversion_type;
        if (counting_category !== undefined) updateData.counting_category = counting_category;
        if (capacity !== undefined) updateData.capacity = capacity;
        if (real_weight !== undefined) updateData.real_weight = real_weight;
        if (provider_code !== undefined) updateData.provider_code = provider_code;
        if (provider_description !== undefined) updateData.provider_description = provider_description;
        if (cost_price !== undefined) {
            updateData.cost_price = cost_price !== '' && cost_price !== null ? parseFloat(cost_price) : 0;
        }

        const { data, error } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Log Barcode History if changed explicitly in the update payload
        if (currentProduct && barcode !== undefined) {
            await recordBarcodeHistory(id, currentProduct.barcode, barcode, req.user.id, data.description);
        }

        res.json(data);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ message: 'Error al actualizar producto' });
    }
};

// Product Import Endpoint (Admin only)
exports.importProducts = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const xlsx = require('xlsx');
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = 'BD';
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            return res.status(400).json({ message: `Sheet "${sheetName}" not found` });
        }

        const rawData = xlsx.utils.sheet_to_json(sheet);
        const products = [];
        const seenCodes = new Set();
        let skippedDuplicates = 0;

        for (const row of rawData) {
            // Helper to find key containing string (handling whitespace)
            const findKey = (partialKey) => Object.keys(row).find(k => k.trim().toLowerCase().includes(partialKey.toLowerCase()));

            const codeKey = findKey('Producto');
            const descKey = findKey('Desc'); // Matches 'Desc. Prod', 'Descripcion', etc
            const brandKey = findKey('Grupo') || findKey('Marca');
            const barcodeKey = findKey('CodeBar') || findKey('BarCode');
            const stockKey = findKey('Saldo') || findKey('Stock') || findKey('Cantidad');

            const code = row[codeKey] ? String(row[codeKey]).trim() : null;
            const description = row[descKey] ? String(row[descKey]).trim() : null;
            const brand = row[brandKey] ? String(row[brandKey]).trim() : null;
            let barcode = row[barcodeKey] ? String(row[barcodeKey]).trim() : null;
            let stock = row[stockKey] ? parseFloat(row[stockKey]) : 0;

            if (!code) continue;

            if (barcode === 'NULL' || barcode === 'null' || barcode === '' || /^[_\-]+$/.test(barcode)) {
                barcode = null;
            }

            if (seenCodes.has(code)) {
                skippedDuplicates++;
                continue;
            }
            seenCodes.add(code);

            products.push({
                code: code,
                description: description,
                brand: brand,
                barcode: barcode,
                current_stock: isNaN(stock) ? 0 : stock,
                excel_order: products.length
            });
        }

        // Batch upsert and log changes
        const batchSize = 1000;
        let upsertedCount = 0;

        for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize);

            // 1. Detect changes for history
            const productCodes = batch.map(p => p.code);
            const { data: existingProds } = await supabase
                .from('products')
                .select('id, code, barcode, description')
                .in('code', productCodes);

            const existingMap = new Map();
            if (existingProds) existingProds.forEach(ep => existingMap.set(ep.code, ep));

            // 2. Perform the upsert
            const { error } = await supabase
                .from('products')
                .upsert(batch, { onConflict: 'code' });

            if (error) throw error;
            upsertedCount += batch.length;

            // 3. Record History for updates
            for (const product of batch) {
                const existing = existingMap.get(product.code);
                if (existing) {
                    if (product.barcode !== undefined) {
                        await recordBarcodeHistory(existing.id, existing.barcode, product.barcode, req.user.id, product.description);
                    }
                }
            }
        }

        res.json({
            message: 'Products imported successfully',
            totalProcessed: rawData.length,
            imported: upsertedCount,
            duplicatesSkipped: skippedDuplicates
        });

    } catch (error) {
        console.error('Error importing products:', error);
        res.status(500).json({ message: 'Error importing products' });
    }
};

// Branch Stock Import Endpoint (Admin only)
exports.importStock = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const xlsx = require('xlsx');
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]]; // Process first sheet

        if (!sheet) {
            return res.status(400).json({ message: 'Sheet not found' });
        }

        const rawData = xlsx.utils.sheet_to_json(sheet);

        // 1. Fetch branches to map code -> id
        const { data: branches, error: branchError } = await supabase
            .from('sucursales')
            .select('id, code, name');

        if (branchError) throw branchError;

        const branchMap = {};
        branches.forEach(b => {
            if (b.code) branchMap[String(b.code).trim()] = b.id;
        });

        const stockEntriesMap = new Map();
        let skippedRows = 0;

        for (const row of rawData) {
            const findKey = (partialKey) => Object.keys(row).find(k => k.trim().toLowerCase().includes(partialKey.toLowerCase()));

            const sucursalKey = findKey('Sucursal');
            const productKey = findKey('Producto');
            const saldoKey = findKey('Saldo');

            const branchCodeRaw = row[sucursalKey];
            const productCodeRaw = row[productKey];
            const quantityRaw = row[saldoKey];

            if (branchCodeRaw === undefined || productCodeRaw === undefined) {
                skippedRows++;
                continue;
            }

            const branchCode = String(branchCodeRaw).trim();
            const productCode = String(productCodeRaw).trim();

            let quantity = 0;
            if (typeof quantityRaw === 'string') {
                quantity = parseFloat(quantityRaw.replace(',', '.'));
            } else {
                quantity = parseFloat(quantityRaw);
            }

            const sucursalId = branchMap[branchCode];
            if (!sucursalId) {
                skippedRows++;
                continue;
            }

            const uniqueKey = `${productCode}|${sucursalId}`;

            stockEntriesMap.set(uniqueKey, {
                product_code: productCode,
                sucursal_id: sucursalId,
                quantity: isNaN(quantity) ? 0 : quantity,
                updated_at: new Date()
            });
        }

        const stockEntries = Array.from(stockEntriesMap.values());
        const productsToUpdate = [];

        for (const entry of stockEntries) {
            const branch = branches.find(b => b.id === entry.sucursal_id);
            if (branch && (branch.name === 'Deposito' || branch.name === 'Depósito')) {
                productsToUpdate.push({ code: entry.product_code, quantity: entry.quantity });
            }
        }

        // 2. Validate Products Exist (Prevent FK Violation)
        const uniqueProductCodes = [...new Set(stockEntries.map(e => e.product_code))];
        let validProductCodes = new Set();
        let skippedProductsCount = 0;

        if (uniqueProductCodes.length > 0) {
            const chunkSize = 1000;
            for (let i = 0; i < uniqueProductCodes.length; i += chunkSize) {
                const chunk = uniqueProductCodes.slice(i, i + chunkSize);
                const { data: existingProducts, error: prodError } = await supabase
                    .from('products')
                    .select('code')
                    .in('code', chunk);

                if (prodError) throw prodError;
                if (existingProducts) {
                    existingProducts.forEach(p => validProductCodes.add(p.code));
                }
            }
        }

        const skippedProducts = [];
        const validStockEntries = stockEntries.filter(entry => {
            if (validProductCodes.has(entry.product_code)) {
                return true;
            } else {
                skippedProductsCount++;
                if (skippedProducts.length < 5) skippedProducts.push(entry.product_code);
                return false;
            }
        });

        if (skippedProductsCount > 0) {
            console.log(`[IMPORT STOCK] Skipped ${skippedProductsCount} products due to unknown code. Sample:`, skippedProducts);
        }

        const validProductsToUpdate = productsToUpdate.filter(p => validProductCodes.has(p.code));

        // 3. Batch upsert stock_sucursal
        const batchSize = 1000;
        let upsertedCount = 0;

        for (let i = 0; i < validStockEntries.length; i += batchSize) {
            const batch = validStockEntries.slice(i, i + batchSize);
            const { error } = await supabase
                .from('stock_sucursal')
                .upsert(batch, { onConflict: 'product_code, sucursal_id' });

            if (error) throw error;
            upsertedCount += batch.length;
        }

        // 4. Legacy Sync for Deposito products
        if (validProductsToUpdate.length > 0) {
            for (const item of validProductsToUpdate) {
                await supabase
                    .from('products')
                    .update({ current_stock: item.quantity })
                    .eq('code', item.code);
            }
        }

        res.json({
            message: `Stock imported successfully. Processed: ${validStockEntries.length}. Skipped Rows: ${skippedRows}. Skipped Unknown Products: ${skippedProductsCount}.`,
            totalRows: rawData.length,
            imported: upsertedCount,
            skipped: skippedRows,
            skippedProducts: skippedProductsCount
        });

    } catch (error) {
        console.error('Error importing stock:', error);
        res.status(500).json({ message: 'Error importing stock: ' + error.message });
    }
};

// Get product by barcode/code with optional type (unified search with fallback)
exports.getProductByCode = async (req, res) => {
    const { barcode } = req.params;
    const { searchType } = req.query;
    try {
        // 1. Try unified exact match
        const products = await findProductsByAnyCode(barcode, searchType || 'any');

        if (products && products.length > 0) {
            if (products.length === 1) {
                return res.json(products[0]);
            }
            return res.json(products);
        }

        // 2. If not found, try Fallback using Search (Fuzzy/Relaxed)
        console.log(`Product ${barcode} not found via exact match. Trying fallback search...`);
        
        const { data: searchResults, error: searchError } = await supabase
            .rpc('search_products', { search_term: barcode });

        if (!searchError && searchResults && searchResults.length > 0) {
            // Filter results to find exact matches ignoring whitespace
            const filteredMatches = searchResults.filter(p =>
                (p.code && p.code.trim() === barcode.trim()) ||
                (p.barcode && p.barcode.trim() === barcode.trim())
            );

            if (filteredMatches.length > 0) {
                if (filteredMatches.length > 1) {
                    console.log(`Fallback search found multiple matches for ${barcode}`);
                    return res.json(filteredMatches);
                }
                console.log(`Fallback search found match for ${barcode}:`, filteredMatches[0].code);
                return res.json(filteredMatches[0]);
            }
        }

        // If still not found
        return res.status(404).json({ message: 'Product not found' });

    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update product barcode
exports.updateBarcode = async (req, res) => {
    const { code } = req.params;
    const { barcode } = req.body;

    if (!barcode) {
        return res.status(400).json({ message: 'Barcode is required' });
    }

    try {
        // Fetch current product for history logging
        const { data: currentProduct } = await supabase
            .from('products')
            .select('id, barcode, description')
            .eq('code', code)
            .maybeSingle();

        const { data, error } = await supabase
            .from('products')
            .update({ barcode: barcode })
            .eq('code', code)
            .select();

        if (error) throw error;

        if (data.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Log Barcode History
        if (currentProduct) {
            await recordBarcodeHistory(currentProduct.id, currentProduct.barcode, barcode, req.user.id, currentProduct.description);
        }

        res.json({ message: 'Barcode updated successfully', product: data[0] });
    } catch (error) {
        console.error('Error updating barcode:', error);
        res.status(500).json({ message: 'Error updating barcode' });
    }
};

// Update product secondary barcode
exports.updateBarcodeSecondary = async (req, res) => {
    const { code } = req.params;
    const { barcode_secondary } = req.body;

    try {
        // Fetch current product for history logging
        const { data: currentProduct } = await supabase
            .from('products')
            .select('id, barcode_secondary, description')
            .eq('code', code)
            .maybeSingle();

        const { data, error } = await supabase
            .from('products')
            .update({ barcode_secondary: barcode_secondary || null })
            .eq('code', code)
            .select();

        if (error) throw error;

        if (data.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Log Barcode History
        if (currentProduct) {
            await recordBarcodeHistory(currentProduct.id, currentProduct.barcode_secondary, barcode_secondary, req.user.id, currentProduct.description);
        }

        res.json({ message: 'Barcode secondary updated successfully', product: data[0] });
    } catch (error) {
        console.error('Error updating secondary barcode:', error);
        res.status(500).json({ message: 'Error updating secondary barcode' });
    }
};

// Get colorants (products) by sucursal (from branch_dye_types.colorants)
exports.getColorantsByCategory = async (req, res) => {
    const { sucursal } = req.query;

    if (!sucursal) {
        return res.status(400).json({ message: 'Sucursal requerida' });
    }

    try {
        const { data: branchConfig, error: branchError } = await supabase
            .from('branch_dye_types')
            .select('colorants')
            .eq('branch_name', sucursal)
            .single();

        if (branchError || !branchConfig?.colorants || branchConfig.colorants.length === 0) {
            return res.json([]);
        }

        const { data, error } = await supabase
            .from('products')
            .select('id, code, description, brand, counting_category, conversion_factor')
            .in('code', branchConfig.colorants)
            .order('description', { ascending: true });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Error fetching colorants by sucursal:', error);
        res.status(500).json({ message: 'Error al obtener colorantes' });
    }
};

// Export all products with barcodes in Protheus CSV format (max 299 lines per file)
exports.exportAllProductsProtheusCsv = async (req, res) => {
    try {
        let allProducts = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        console.log(`[EXPORT PROTHEUS] Iniciando exportación de productos con código de barra`);

        while (hasMore) {
            const { data, error } = await supabase
                .from('products')
                .select('code, barcode')
                .not('barcode', 'is', null)
                .order('code', { ascending: true })
                .range(from, from + step - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                // Filtrar nulos o vacíos que puedan haberse pasado, o cadenas 'null'
                const filtered = data.filter(p => p.barcode && p.barcode.trim() !== '' && p.barcode.trim().toLowerCase() !== 'null');
                allProducts = allProducts.concat(filtered);
                if (data.length < step) {
                    hasMore = false;
                } else {
                    from += step;
                }
            } else {
                hasMore = false;
            }
        }

        if (allProducts.length === 0) {
            return res.status(404).json({ message: 'No hay productos con código de barra para exportar' });
        }

        // Dividir en bloques de máximo 298 productos (298 productos + 1 cabecera = 299 líneas totales)
        const MAX_PRODUCTS = 298;
        const files = [];
        let fileIndex = 1;

        for (let i = 0; i < allProducts.length; i += MAX_PRODUCTS) {
            const chunk = allProducts.slice(i, i + MAX_PRODUCTS);
            let csvContent = "B1_COD;B1_CODBAR\n";
            chunk.forEach(p => {
                csvContent += `${p.code ? p.code.trim() : ''};${p.barcode ? p.barcode.trim() : ''}\n`;
            });

            // Formatear el índice con ceros a la izquierda
            const formattedIndex = String(fileIndex).padStart(2, '0');
            files.push({
                filename: `productos_protheus_${formattedIndex}.csv`,
                content: csvContent
            });
            fileIndex++;
        }

        res.json({ files });
    } catch (error) {
        console.error('Error al exportar productos en formato Protheus:', error);
        res.status(500).json({ message: 'Error interno al exportar productos', details: error.message });
    }
};

// --- SINCRONIZACIÓN DE PRODUCTOS DESDE PROTHEUS (EN SEGUNDO PLANO) ---

let protheusSyncStatus = {
    running: false,
    processed: 0,
    total: 0,
    updated: 0,
    notFound: 0,
    errors: 0,
    startTime: null,
    endTime: null,
    errorMsg: null,
    notFoundProducts: [],
    failedProducts: []
};

exports.getProtheusSyncStatus = (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'No autorizado' });
    }
    res.json(protheusSyncStatus);
};

exports.syncProductsFromProtheus = async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'No autorizado' });
    }

    if (protheusSyncStatus.running) {
        return res.status(400).json({ message: 'Ya hay una sincronización en curso', status: protheusSyncStatus });
    }

    // Inicializar estado de sincronización
    protheusSyncStatus = {
        running: true,
        processed: 0,
        total: 0,
        updated: 0,
        notFound: 0,
        errors: 0,
        startTime: new Date().toISOString(),
        endTime: null,
        errorMsg: null,
        notFoundProducts: [],
        failedProducts: []
    };

    // Ejecutar en segundo plano de forma asíncrona
    runSyncInBackground().catch(err => {
        console.error('Error crítico en sincronización en segundo plano:', err);
        protheusSyncStatus.running = false;
        protheusSyncStatus.endTime = new Date().toISOString();
        protheusSyncStatus.errorMsg = err.message;
    });

    res.json({ message: 'Sincronización iniciada en segundo plano', status: protheusSyncStatus });
};

async function runSyncInBackground() {
    try {
        console.log('[BG SYNC] Obteniendo códigos de productos existentes en la base de datos...');
        
        // Obtener todos los productos paginados (evitando el límite de 1000 registros por defecto)
        let dbProducts = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('products')
                .select('id, code, description')
                .not('code', 'is', null)
                .order('code', { ascending: true })
                .range(from, from + step - 1);

            if (error) {
                throw new Error(`Error al obtener productos de la base de datos: ${error.message}`);
            }

            if (data && data.length > 0) {
                dbProducts = dbProducts.concat(data);
                if (data.length < step) {
                    hasMore = false;
                } else {
                    from += step;
                }
            } else {
                hasMore = false;
            }
        }

        const totalProducts = dbProducts.length;
        protheusSyncStatus.total = totalProducts;
        console.log(`[BG SYNC] Se encontraron ${totalProducts} productos para sincronizar.`);

        // Pre-cargar listas de precios de Protheus de forma masiva para evitar llamadas repetidas
        console.log('[BG SYNC] Descargando listas de precios completas (001 y 500) desde Protheus para optimización...');
        const prices001Map = await protheusService.fetchPricesFromProtheus('001').catch(e => {
            console.error('Error pre-cargando lista de precios 001:', e.message);
            return {};
        });
        const prices500Map = await protheusService.fetchPricesFromProtheus('500').catch(e => {
            console.error('Error pre-cargando lista de precios 500:', e.message);
            return {};
        });
        console.log(`[BG SYNC] Listas de precios cargadas con éxito. (001: ${Object.keys(prices001Map).length} ítems, 500: ${Object.keys(prices500Map).length} ítems).`);

        const CONCURRENCY_LIMIT = 5;
        const BATCH_DELAY = 100;
        
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Procesar en lotes
        for (let i = 0; i < totalProducts; i += CONCURRENCY_LIMIT) {
            if (!protheusSyncStatus.running) {
                console.log('[BG SYNC] Detenido externamente.');
                break;
            }

            const batch = dbProducts.slice(i, i + CONCURRENCY_LIMIT);
            
            await Promise.all(batch.map(async (dbProduct) => {
                const code = dbProduct.code;
                try {
                    // Consultar en el WS de Protheus (usando protheusService exportado arriba como "protheusService")
                    const protheusProduct = await protheusService.fetchProductFromProtheus(code, prices001Map, prices500Map);
                    protheusSyncStatus.processed++;

                    if (protheusProduct) {
                        // Actualizar el producto en Supabase con los nuevos datos
                        const { error: updateError } = await supabase
                            .from('products')
                            .update({
                                description: protheusProduct.description,
                                capacity: protheusProduct.capacity,
                                cost_price: protheusProduct.cost_price,
                                brand_code: protheusProduct.brand_code,
                                tes: protheusProduct.tes,
                                lista001: protheusProduct.lista001,
                                lista500: protheusProduct.lista500,
                                moneda: protheusProduct.moneda
                            })
                            .eq('id', dbProduct.id);

                        if (updateError) {
                            console.error(`[BG SYNC] Error actualizando "${code}":`, updateError.message);
                            protheusSyncStatus.errors++;
                            protheusSyncStatus.failedProducts.push({
                                code: code,
                                description: dbProduct.description,
                                error: updateError.message
                            });
                        } else {
                            protheusSyncStatus.updated++;
                        }
                    } else {
                        protheusSyncStatus.notFound++;
                        protheusSyncStatus.notFoundProducts.push({
                            code: code,
                            description: dbProduct.description
                        });
                    }
                } catch (err) {
                    console.error(`[BG SYNC] Error procesando "${code}":`, err.message);
                    protheusSyncStatus.errors++;
                    protheusSyncStatus.processed++;
                    protheusSyncStatus.failedProducts.push({
                        code: code,
                        description: dbProduct.description,
                        error: err.message
                    });
                }
            }));

            if (i + CONCURRENCY_LIMIT < totalProducts) {
                await delay(BATCH_DELAY);
            }
        }

        protheusSyncStatus.running = false;
        protheusSyncStatus.endTime = new Date().toISOString();
        console.log('[BG SYNC] Sincronización finalizada.');
    } catch (err) {
        protheusSyncStatus.running = false;
        protheusSyncStatus.endTime = new Date().toISOString();
        protheusSyncStatus.errorMsg = err.message;
        console.error('[BG SYNC ERROR] Fallo crítico:', err);
    }
}


