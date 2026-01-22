const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { parseRemitoPdf } = require('./pdfParser');
const { parseExcelXml } = require('./xmlParser');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env file');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const path = require('path');

// ... (existing imports)

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// Basic Route (API check)
app.get('/api/health', (req, res) => {
    res.send('Control de Remitos API Running');
});

// ... (API Routes)

// The catch-all handler must be at the end, after all other routes
// app.get('*', (req, res) => {
//    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
// });


// Middleware to verify token
const verifyToken = async (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Verify session is still valid in DB
        const { data: user, error } = await supabase
            .from('users')
            .select('current_session_id, role') // Select role too
            .eq('id', decoded.id)
            .single();

        if (error || !user) {
            return res.status(401).json({ message: 'User not found' });
        }

        if (user.current_session_id !== decoded.session_id) {
            return res.status(401).json({ message: 'Session expired or invalid (logged in elsewhere)' });
        }

        req.user = { ...decoded, role: user.role }; // Ensure role is up to date from DB
        next();
    } catch (e) {
        console.error('Token verification error:', e.message);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

// Middleware to verify admin role
const verifyAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Admins only' });
    }
};

// API Routes

// Product Import Endpoint (Admin only)
app.post('/api/products/import', verifyToken, verifyAdmin, multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
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
            const barcodeKey = findKey('CodeBar') || findKey('BarCode');
            const stockKey = findKey('Saldo') || findKey('Stock') || findKey('Cantidad');

            const code = row[codeKey] ? String(row[codeKey]).trim() : null;
            const description = row[descKey] ? String(row[descKey]).trim() : null;
            let barcode = row[barcodeKey] ? String(row[barcodeKey]).trim() : null;
            let stock = row[stockKey] ? parseFloat(row[stockKey]) : 0;

            if (!code) continue;

            if (barcode === 'NULL' || barcode === 'null' || barcode === '') {
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
                barcode: barcode,
                current_stock: isNaN(stock) ? 0 : stock
            });
        }

        // Batch upsert
        const batchSize = 1000;
        let upsertedCount = 0;

        for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize);
            const { error } = await supabase
                .from('products')
                .upsert(batch, { onConflict: 'code' });

            if (error) throw error;
            upsertedCount += batch.length;
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
});

// Get product by barcode
app.get('/api/products/:barcode', verifyToken, async (req, res) => {
    const { barcode } = req.params;
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .or(`code.eq.${barcode},barcode.eq.${barcode}`)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // Not found
                return res.status(404).json({ message: 'Product not found' });
            }
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create new remito
app.post('/api/remitos', verifyToken, async (req, res) => {
    const { remitoNumber, items, discrepancies, clarification } = req.body;

    if (!remitoNumber || !items || items.length === 0) {
        return res.status(400).json({ message: 'Missing remito number or items' });
    }

    try {
        const { data, error } = await supabase
            .from('remitos')
            .insert([
                {
                    remito_number: remitoNumber,
                    items: items,
                    discrepancies: discrepancies || {}, // Save discrepancies if provided
                    clarification: clarification || null,
                    status: 'processed', // Assuming auto-processed for now
                    created_by: req.user.username // Save the username from the token
                }
            ])
            .select();

        if (error) throw error;

        // Update pre-remito status to 'processed'
        // We don't await the result strictly for the response, but it should happen
        await supabase
            .from('pre_remitos')
            .update({ status: 'processed' })
            .eq('order_number', remitoNumber);

        res.status(201).json(data[0]);
    } catch (error) {
        console.error('Error creating remito:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all remitos with manual join to pre-remitos/PV
app.get('/api/remitos', verifyToken, async (req, res) => {
    try {
        // 1. Fetch all processed remitos
        const { data: remitosData, error: remitosError } = await supabase
            .from('remitos')
            .select('*')
            .order('date', { ascending: false });

        if (remitosError) throw remitosError;

        // 2. Fetch all pre-remitos with PV info
        const { data: preRemitosData, error: preRemitosError } = await supabase
            .from('pre_remitos')
            .select(`
                order_number,
                pedidos_ventas (
                    numero_pv,
                    sucursal
                )
            `);

        if (preRemitosError) throw preRemitosError;

        // 3. Fetch General Counts names
        const { data: countsData } = await supabase
            .from('general_counts')
            .select('id, name');

        const countsMap = {};
        if (countsData) {
            countsData.forEach(c => countsMap[c.id] = c.name);
        }

        // 4. Create a lookup map for speed
        const preRemitoMap = {};
        preRemitosData.forEach(pre => {
            preRemitoMap[pre.order_number] = {
                numero_pv: pre.pedidos_ventas?.[0]?.numero_pv || '-',
                sucursal: pre.pedidos_ventas?.[0]?.sucursal || '-'
            };
        });

        // 5. Merge data
        const formattedData = remitosData.map(remito => {
            const extraInfo = preRemitoMap[remito.remito_number] || { numero_pv: '-', sucursal: '-' };
            const countName = countsMap[remito.remito_number];

            return {
                ...remito,
                numero_pv: extraInfo.numero_pv,
                sucursal: extraInfo.sucursal,
                count_name: countName || null // Provide name if available
            };
        });

        res.json(formattedData);
    } catch (error) {
        console.error('Error fetching remitos:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get remito by ID
app.get('/api/remitos/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        let { data, error } = await supabase
            .from('remitos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Lazy Repair: If it's a General Count (check by trying to find it in general_counts) 
        // AND discrepancies are missing/empty, try to generate them.
        if (!data.discrepancies || Object.keys(data.discrepancies).length === 0) {
            // Check if this remito_number corresponds to a General Count
            const { data: generalCount } = await supabase
                .from('general_counts')
                .select('id')
                .eq('id', data.remito_number)
                .maybeSingle();

            if (generalCount) {
                console.log(`Reparing discrepancies for General Count Remito: ${id}`);

                // Reuse logic to generate report
                const { data: scans } = await supabase
                    .from('inventory_scans')
                    .select('code, quantity')
                    .eq('order_number', data.remito_number); // Use remito_number (which is the count ID)

                if (scans && scans.length > 0) {
                    const totals = {};
                    scans.forEach(scan => {
                        totals[scan.code] = (totals[scan.code] || 0) + (scan.quantity || 0);
                    });

                    const codes = Object.keys(totals);
                    let productsMap = {};

                    if (codes.length > 0) {
                        const { data: products } = await supabase
                            .from('products')
                            .select('code, description, barcode, current_stock')
                            .in('code', codes);

                        if (products) {
                            products.forEach(p => productsMap[p.code] = p);
                        }
                    }

                    const report = codes.map(code => {
                        const stock = productsMap[code]?.current_stock || 0;
                        const quantity = totals[code] || 0;
                        return {
                            code,
                            barcode: productsMap[code]?.barcode || '',
                            description: productsMap[code]?.description || 'Desconocido',
                            quantity,
                            stock,
                            difference: quantity - stock
                        };
                    });

                    report.sort((a, b) => a.description.localeCompare(b.description));

                    const discrepancies = {
                        missing: report.filter(i => i.difference < 0).map(i => ({
                            code: i.code,
                            barcode: i.barcode,
                            description: i.description,
                            expected: i.stock,
                            scanned: i.quantity,
                            reason: 'missing'
                        })),
                        extra: report.filter(i => i.difference > 0).map(i => ({
                            code: i.code,
                            barcode: i.barcode,
                            description: i.description,
                            expected: i.stock,
                            scanned: i.quantity
                        }))
                    };

                    // Update DB
                    await supabase
                        .from('remitos')
                        .update({ discrepancies: discrepancies })
                        .eq('id', id);

                    // Update local data object to return fresh info
                    data.discrepancies = discrepancies;
                }
            }
        }

        // Also fetch count name if possible to enrich response directly
        // (Though frontend might need it from list or separate call, let's try to add it here if it's a general count)
        if (data.remito_number) {
            const { data: countData } = await supabase
                .from('general_counts')
                .select('name')
                .eq('id', data.remito_number)
                .maybeSingle();

            if (countData) {
                data.count_name = countData.name;
            }
        }

        res.json(data);
    } catch (error) {
        console.error('Error fetching remito:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create new pre-remito (simulating external system)
app.post('/api/pre-remitos', verifyToken, async (req, res) => {
    const { orderNumber, items } = req.body;

    if (!orderNumber || !items || items.length === 0) {
        return res.status(400).json({ message: 'Missing order number or items' });
    }

    try {
        const { data, error } = await supabase
            .from('pre_remitos')
            .insert([
                {
                    order_number: orderNumber,
                    items: items
                }
            ])
            .select();

        if (error) throw error;

        res.status(201).json(data[0]);
    } catch (error) {
        console.error('Error creating pre-remito:', error);
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ message: 'Pre-remito already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all pre-remitos (for selection list)
// Get all pre-remitos (for selection list) with PV info
app.get('/api/pre-remitos', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pre_remitos')
            .select(`
                id, 
                order_number, 
                created_at,
                pedidos_ventas (
                    numero_pv,
                    sucursal
                )
            `)
            .neq('status', 'processed') // Filter out processed orders
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Flatten the structure for easier frontend consumption
        const formattedData = data.map(item => ({
            ...item,
            numero_pv: item.pedidos_ventas?.[0]?.numero_pv || null,
            sucursal: item.pedidos_ventas?.[0]?.sucursal || null
        }));

        res.json(formattedData);
    } catch (error) {
        console.error('Error fetching pre-remitos:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get pre-remito by order number
app.get('/api/pre-remitos/:orderNumber', verifyToken, async (req, res) => {
    const { orderNumber } = req.params;
    try {
        const { data, error } = await supabase
            .from('pre_remitos')
            .select(`
                *,
                pedidos_ventas (
                    numero_pv,
                    sucursal
                )
            `)
            .eq('order_number', orderNumber)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // Not found
                return res.status(404).json({ message: 'Pre-remito not found' });
            }
            throw error;
        }

        // Flatten info
        const responseData = {
            ...data,
            numero_pv: data.pedidos_ventas?.[0]?.numero_pv || null,
            sucursal: data.pedidos_ventas?.[0]?.sucursal || null,
            pedidos_ventas: undefined // Remove the array
        };

        res.json(responseData);
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching pre-remito:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Import Stock from XML (ERP)
app.post('/api/pre-remitos/import-xml', verifyToken, verifyAdmin, multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const items = await parseExcelXml(req.file.buffer);

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No valid items found in XML' });
        }

        const orderNumber = `STOCK-${new Date().toISOString().split('T')[0]}-${Date.now().toString().slice(-4)}`;

        // 1. Upsert Products (Ensure they exist in DB)
        // Extract unique products
        const productsMap = new Map();
        items.forEach(item => {
            if (!productsMap.has(item.code)) {
                productsMap.set(item.code, {
                    code: item.code,
                    description: item.description,
                    barcode: item.barcode
                });
            }
        });

        const productsParams = Array.from(productsMap.values());

        // Upsert in batches
        const batchSize = 1000;
        for (let i = 0; i < productsParams.length; i += batchSize) {
            const batch = productsParams.slice(i, i + batchSize);
            const { error: prodError } = await supabase
                .from('products')
                .upsert(batch, { onConflict: 'code' }); // Update description/barcode if code exists

            if (prodError) console.error('Error upserting products batch:', prodError);
        }

        // 2. Create Pre-Remito (Inventory Session)
        const { data, error } = await supabase
            .from('pre_remitos')
            .insert([
                {
                    order_number: orderNumber,
                    items: items, // Save parsed items [ {code, description, quantity}, ... ]
                    status: 'pending'
                }
            ])
            .select()
            .single();

        if (error) throw error;

        res.json({
            message: 'Stock imported successfully',
            orderNumber: data.order_number,
            itemCount: items.length
        });

    } catch (error) {
        console.error('Error importing XML:', error);
        res.status(500).json({ message: 'Error importing XML file: ' + error.message });
    }
});

// Settings API
app.get('/api/settings', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'global_config')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is 'not found'
            // If table doesn't exist, this might fail differently, but we catch it.
            console.error('Error fetching settings:', error);
            // Fallback to default if error (e.g. table missing) but ideally we warn.
            // But to avoid crashing frontend:
            return res.json({ countMode: 'pre_remito' });
        }

        if (!data) {
            return res.json({ countMode: 'pre_remito' }); // Default
        }

        res.json(data.value);
    } catch (error) {
        console.error('Server error fetching settings:', error);
        res.status(500).json({ message: 'Error fetching settings' });
    }
});

app.put('/api/settings', verifyToken, verifyAdmin, async (req, res) => {
    const { countMode } = req.body;

    if (!['pre_remito', 'products'].includes(countMode)) {
        return res.status(400).json({ message: 'Invalid count mode' });
    }

    try {
        // Upsert setting
        const { error } = await supabase
            .from('app_settings')
            .upsert({
                key: 'global_config',
                value: { count_mode: countMode },
                updated_at: new Date()
            });

        if (error) {
            console.error('Error updating settings:', error);
            // If error is "relation "app_settings" does not exist", user needs to run SQL.
            if (error.code === '42P01') {
                return res.status(500).json({ message: 'Settings table missing. Please run setup_settings.sql in Database.' });
            }
            throw error;
        }

        res.json({ success: true, countMode });
    } catch (error) {
        console.error('Server error updating settings:', error);
        res.status(500).json({ message: 'Error updating settings' });
    }
});

// General Counts API
app.get('/api/general-counts/active', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('general_counts')
            .select('*')
            .eq('status', 'open')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching active count:', error);
            return res.status(500).json({ message: 'Error fetching active count' });
        }

        res.json(data || null);
    } catch (error) {
        console.error('Server error fetching active count:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/general-counts', verifyToken, verifyAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    try {
        // Check for existing open count
        const { data: existing } = await supabase
            .from('general_counts')
            .select('id')
            .eq('status', 'open')
            .single();

        if (existing) {
            return res.status(400).json({ message: 'Ya existe un conteo activo. Debe cerrarlo antes de iniciar uno nuevo.' });
        }

        const { data, error } = await supabase
            .from('general_counts')
            .insert([{
                name,
                status: 'open'
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '42P01') {
                return res.status(500).json({ message: 'Table missing. Run setup_general_counts.sql' });
            }
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('Error creating count:', error);
        res.status(500).json({ message: 'Error creating count' });
    }
});

app.put('/api/general-counts/:id/close', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Close the count
        const { data: updatedCount, error: updateError } = await supabase
            .from('general_counts')
            .update({ status: 'closed', closed_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        // 2. Generate Report
        const { data: scans, error: scansError } = await supabase
            .from('inventory_scans')
            .select('code, quantity')
            .eq('order_number', id);

        if (scansError) throw scansError;

        // Aggregate
        const totals = {};
        scans.forEach(scan => {
            totals[scan.code] = (totals[scan.code] || 0) + (scan.quantity || 0);
        });

        // Loop products
        const codes = Object.keys(totals);
        let productsMap = {};

        if (codes.length > 0) {
            const { data: products, error: prodError } = await supabase
                .from('products')
                .select('code, description, barcode, current_stock')
                .in('code', codes);

            if (!prodError && products) {
                products.forEach(p => productsMap[p.code] = p);
            }
        }

        // Build Report Array
        const report = codes.map(code => {
            const stock = productsMap[code]?.current_stock || 0;
            const quantity = totals[code] || 0;
            return {
                code,
                barcode: productsMap[code]?.barcode || '',
                description: productsMap[code]?.description || 'Desconocido',
                quantity,
                stock,
                difference: quantity - stock
            };
        });

        report.sort((a, b) => a.description.localeCompare(b.description));

        // 3. Save snapshot to Remitos table (Upsert logic manual since remito_number might not be unique in schema)
        const discrepancies = {
            missing: report.filter(i => i.difference < 0).map(i => ({
                code: i.code,
                barcode: i.barcode,
                description: i.description,
                expected: i.stock,
                scanned: i.quantity,
                reason: 'missing'
            })),
            extra: report.filter(i => i.difference > 0).map(i => ({
                code: i.code,
                barcode: i.barcode,
                description: i.description,
                expected: i.stock,
                scanned: i.quantity
            }))
        };

        const { data: existingRemito } = await supabase
            .from('remitos')
            .select('id')
            .eq('remito_number', id)
            .maybeSingle();

        const remitoData = {
            remito_number: id,
            items: scans, // Save the raw aggregated scans as items
            discrepancies: discrepancies,
            status: 'processed',
            date: new Date().toISOString(),
            created_by: req.user ? req.user.username : 'Sistema'
        };

        if (existingRemito) {
            await supabase.from('remitos').update(remitoData).eq('id', existingRemito.id);
        } else {
            await supabase.from('remitos').insert([remitoData]);
        }

        res.json({ count: updatedCount, report });
    } catch (error) {
        console.error('Error closing count:', error);
        res.status(500).json({ message: 'Error closing count' });
    }
});

// Inventory Scans Endpoints

// Get Inventory State (Progress)
app.get('/api/inventory/:orderNumber', verifyToken, async (req, res) => {
    const { orderNumber } = req.params;
    const userId = req.user.id;

    try {
        // 1. Get Expected Items (Pre-Remito)
        const { data: preRemito, error: preError } = await supabase
            .from('pre_remitos')
            .select('items')
            .eq('order_number', orderNumber)
            .single();

        if (preError) {
            if (preError.code === 'PGRST116') return res.status(404).json({ message: 'Order not found' });
            throw preError;
        }

        // 2. Get All Scans for this Order
        const { data: scans, error: scanError } = await supabase
            .from('inventory_scans')
            .select('user_id, code, quantity')
            .eq('order_number', orderNumber);

        if (scanError) throw scanError;

        // 3. Aggregate Scans
        const scannedMap = {}; // { code: totalQuantity }
        const myScansMap = {}; // { code: myQuantity }

        scans.forEach(scan => {
            const qty = scan.quantity || 0;

            // Global Total
            scannedMap[scan.code] = (scannedMap[scan.code] || 0) + qty;

            // My Scans
            if (scan.user_id === userId) {
                myScansMap[scan.code] = (myScansMap[scan.code] || 0) + qty;
            }
        });

        res.json({
            orderNumber,
            expected: preRemito.items || [],
            scanned: scannedMap,
            myScans: myScansMap
        });

    } catch (error) {
        console.error('Error fetching inventory state:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Submit/Sync Scans
app.post('/api/inventory/scan', verifyToken, async (req, res) => {
    const { orderNumber, items } = req.body; // items: [{ code, quantity }] - Quantity is the absolute user count

    if (!orderNumber || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Invalid data' });
    }

    try {
        const userId = req.user.id;

        // Prepare Upsert Data
        const upsertData = items.map(item => ({
            order_number: orderNumber,
            user_id: userId,
            code: item.code,
            quantity: item.quantity,
            timestamp: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('inventory_scans')
            .upsert(upsertData, { onConflict: 'order_number, user_id, code' });

        if (error) throw error;

        res.json({ message: 'Scans synced successfully', count: items.length });

    } catch (error) {
        console.error('Error syncing scans:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Upload PDF Remito
// Upload PDF Remito
app.post('/api/remitos/upload-pdf', verifyToken, multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        console.log(`Received PDF upload. Size: ${req.file.size} bytes`);
        const extractedItems = await parseRemitoPdf(req.file.buffer);

        // Enrich items with barcodes from DB
        const enrichedItems = [];
        for (const item of extractedItems) {
            const internalCode = String(item.code).trim();

            // Lookup product by internal code
            const { data: product } = await supabase
                .from('products')
                .select('barcode, description')
                .eq('code', internalCode)
                .maybeSingle(); // Use maybeSingle to avoid error if 0 rows (though unlikely with checking)

            if (product && product.barcode) {
                enrichedItems.push({
                    code: internalCode,
                    barcode: product.barcode,
                    quantity: item.quantity,
                    description: product.description || item.description
                });
            } else {
                enrichedItems.push({
                    code: internalCode,
                    barcode: null, // Frontend will fallback to code
                    quantity: item.quantity,
                    description: item.description
                });
            }
        }

        res.json({ items: enrichedItems });
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ message: 'Error processing PDF' });
    }
});

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ... (existing imports)

const { v4: uuidv4 } = require('uuid');

// ... (existing imports)

// Auth Routes

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        // Check if user exists
        const { data: existingUser, error: searchError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate Session ID
        const sessionId = uuidv4();

        // Create user
        const { data, error } = await supabase
            .from('users')
            .insert([
                {
                    username,
                    password: hashedPassword,
                    current_session_id: sessionId,
                    role: 'user' // Default role
                }
            ])
            .select();

        if (error) throw error;

        // Generate Token
        const token = jwt.sign(
            { id: data[0].id, username: data[0].username, role: data[0].role, session_id: sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(201).json({ token, user: { id: data[0].id, username: data[0].username, role: data[0].role } });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        // Check if user exists
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate New Session ID
        const sessionId = uuidv4();

        // Update user with new session ID
        const { error: updateError } = await supabase
            .from('users')
            .update({ current_session_id: sessionId })
            .eq('id', user.id);

        if (updateError) throw updateError;

        // Generate Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, session_id: sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Example protected route
app.get('/api/auth/user', verifyToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, role, created_at')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// The catch-all handler must be at the end, after all other routes
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
