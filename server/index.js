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

// Search products (DEBE IR ANTES de /:barcode para evitar conflicto de routing)
app.get('/api/products/search', verifyToken, async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    try {
        const { data, error } = await supabase
            .from('products')
            .select('code, description, barcode')
            .or(`code.ilike.%${q}%,description.ilike.%${q}%`)
            .limit(20);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({ message: 'Error searching products' });
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

// Get all remitos with manual join to pre-remitos/PV, and include Pending pre-remitos (Progress)
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
                id,
                order_number,
                status,
                items,
                created_at,
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

        // 4. Create lookup and identify Pending ones
        const preRemitoMap = {};
        const pendingPreRemitos = preRemitosData.filter(p => p.status === 'pending');

        preRemitosData.forEach(pre => {
            preRemitoMap[pre.order_number] = {
                numero_pv: pre.pedidos_ventas?.[0]?.numero_pv || '-',
                sucursal: pre.pedidos_ventas?.[0]?.sucursal || '-',
                items: pre.items || []
            };
        });

        // 5. Fetch Open General Counts
        const { data: openGeneralCounts, error: openCountsError } = await supabase
            .from('general_counts')
            .select('*')
            .eq('status', 'open');

        if (openCountsError) console.error('Error fetching open general counts:', openCountsError);

        // 6. Enrich Pending Pre-Remitos with Progress and Brands
        const pendingFormatted = await Promise.all(pendingPreRemitos.map(async (pre) => {
            // Fetch scans for this order
            const { data: scans } = await supabase
                .from('inventory_scans')
                .select('code, quantity')
                .eq('order_number', pre.order_number);

            let progress = 0;
            let brands = new Set();
            let totalScanned = 0;
            let totalExpected = 0;

            // Calculate totals
            if (pre.items && Array.isArray(pre.items)) {
                pre.items.forEach(item => {
                    totalExpected += (item.quantity || 0);
                });
            }

            if (scans && scans.length > 0) {
                scans.forEach(scan => {
                    totalScanned += (scan.quantity || 0);
                });

                // Get brands for scanned items
                const codes = [...new Set(scans.map(s => s.code))];
                const { data: products } = await supabase
                    .from('products')
                    .select('description')
                    .in('code', codes);

                if (products) {
                    products.forEach(p => {
                        if (p.description) {
                            const brand = p.description.split(' ')[0]; // Basic heuristic: first word
                            if (brand && brand.length > 2) brands.add(brand.toUpperCase());
                        }
                    });
                }
            }

            if (totalExpected > 0) {
                progress = Math.min(Math.round((totalScanned / totalExpected) * 100), 100);
            }

            return {
                id: pre.id,
                remito_number: pre.order_number,
                items: pre.items,
                status: 'pending_scanned', // Custom status for frontend
                created_by: 'Múltiples',
                date: pre.created_at,
                numero_pv: pre.pedidos_ventas?.[0]?.numero_pv || '-',
                sucursal: pre.pedidos_ventas?.[0]?.sucursal || '-',
                count_name: countsMap[pre.order_number] || null,
                progress: progress,
                scanned_brands: Array.from(brands).slice(0, 5) // Top 5 brands
            };
        }));

        // 7. Enrich Open General Counts with Scans and Brands
        const openCountsFormatted = await Promise.all((openGeneralCounts || []).map(async (count) => {
            const { data: scans } = await supabase
                .from('inventory_scans')
                .select('code, quantity')
                .eq('order_number', count.id);

            let brands = new Set();
            let totalScanned = 0;

            if (scans && scans.length > 0) {
                scans.forEach(scan => {
                    totalScanned += (scan.quantity || 0);
                });

                const codes = [...new Set(scans.map(s => s.code))];
                const { data: products } = await supabase
                    .from('products')
                    .select('description')
                    .in('code', codes);

                if (products) {
                    products.forEach(p => {
                        if (p.description) {
                            const brand = p.description.split(' ')[0];
                            if (brand && brand.length > 2) brands.add(brand.toUpperCase());
                        }
                    });
                }
            }

            return {
                id: count.id,
                remito_number: count.id,
                items: [], // No expected items
                status: 'pending_scanned',
                created_by: count.created_by || 'Admin',
                date: count.created_at,
                numero_pv: '-',
                sucursal: '-',
                count_name: count.name,
                progress: null, // No progress for general counts
                scanned_brands: Array.from(brands).slice(0, 5)
            };
        }));

        // 8. Merge data
        const processedFormatted = remitosData.map(remito => {
            const extraInfo = preRemitoMap[remito.remito_number] || { numero_pv: '-', sucursal: '-' };
            const countName = countsMap[remito.remito_number];

            return {
                ...remito,
                numero_pv: extraInfo.numero_pv,
                sucursal: extraInfo.sucursal,
                count_name: countName || null
            };
        });

        // Combined and sorted by date
        const combined = [...openCountsFormatted, ...pendingFormatted, ...processedFormatted].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(combined);
    } catch (error) {
        console.error('Error fetching remitos:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get Remito Details with User Breakdown (Supports In-Progress counts)
app.get('/api/remitos/:id/details', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        let remito = null;
        let isFinalized = true;

        // 1. Fetch Remito Base Info - Try Processed first
        let { data: finalizedRemito, error: finalizedError } = await supabase
            .from('remitos')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (finalizedRemito) {
            remito = finalizedRemito;
        } else {
            // 2. Try Pre-Remitos (Pending)
            const { data: preRemito } = await supabase
                .from('pre_remitos')
                .select('*, pedidos_ventas(numero_pv, sucursal)')
                .eq('id', id)
                .maybeSingle();

            if (preRemito) {
                remito = {
                    id: preRemito.id,
                    remito_number: preRemito.order_number,
                    items: preRemito.items || [],
                    date: preRemito.created_at,
                    status: 'pending',
                    numero_pv: preRemito.pedidos_ventas?.[0]?.numero_pv || '-',
                    sucursal: preRemito.pedidos_ventas?.[0]?.sucursal || '-'
                };
                isFinalized = false;
            } else {
                // 3. Try General Counts (Open)
                const { data: generalCount } = await supabase
                    .from('general_counts')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();

                if (generalCount) {
                    remito = {
                        id: generalCount.id,
                        remito_number: generalCount.id,
                        count_name: generalCount.name,
                        items: [],
                        date: generalCount.created_at,
                        status: 'pending',
                        numero_pv: '-',
                        sucursal: '-'
                    };
                    isFinalized = false;
                }
            }
        }

        if (!remito) {
            return res.status(404).json({ message: 'Conteo no encontrado' });
        }

        // Fetch Count Name for finalized ones if not already set
        if (isFinalized && remito.remito_number && !remito.count_name) {
            const { data: countData } = await supabase
                .from('general_counts')
                .select('name')
                .eq('id', remito.remito_number)
                .maybeSingle();
            if (countData) remito.count_name = countData.name;
        }

        // 3. Fetch Scans
        const { data: scans, error: scansError } = await supabase
            .from('inventory_scans')
            .select('user_id, code, quantity')
            .eq('order_number', remito.remito_number);

        let userCounts = [];
        let totalScannedMap = {};

        if (!scansError && scans && scans.length > 0) {
            const userIds = [...new Set(scans.map(s => s.user_id))];
            const codes = [...new Set(scans.map(s => s.code))];

            const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
            const { data: products } = await supabase.from('products').select('code, description').in('code', codes);

            const userMap = {};
            const productMap = {};
            if (users) users.forEach(u => userMap[u.id] = u.username);
            if (products) products.forEach(p => productMap[p.code] = p.description);

            const userCountsMap = {};
            scans.forEach(scan => {
                const username = userMap[scan.user_id] || 'Desconocido';
                const qty = scan.quantity || 0;

                // Track totals for active discrepancy calculation
                totalScannedMap[scan.code] = (totalScannedMap[scan.code] || 0) + qty;

                if (!userCountsMap[username]) {
                    userCountsMap[username] = { username, items: [], totalItems: 0, totalUnits: 0 };
                }
                userCountsMap[username].items.push({
                    code: scan.code,
                    description: productMap[scan.code] || 'Sin descripción',
                    quantity: qty
                });
                userCountsMap[username].totalItems += 1;
                userCountsMap[username].totalUnits += qty;
            });
            userCounts = Object.values(userCountsMap);
        } else if (isFinalized) {
            // Fallback for finalized remitos with no granular scans
            userCounts = [{
                username: remito.created_by || 'Sistema',
                items: remito.items || [],
                totalItems: remito.items ? remito.items.length : 0,
                totalUnits: remito.items ? remito.items.reduce((acc, i) => acc + (i.quantity || 0), 0) : 0
            }];
        }

        // 4. Discrepancies Calculation (Live if not finalized)
        if (!isFinalized && remito.items && remito.items.length > 0) {
            const discrepancies = { missing: [], extra: [] };

            // Expected vs Scanned
            remito.items.forEach(expected => {
                const scannedQty = totalScannedMap[expected.code] || 0;
                if (scannedQty < expected.quantity) {
                    discrepancies.missing.push({
                        code: expected.code,
                        description: expected.description || expected.name,
                        expected: expected.quantity,
                        scanned: scannedQty
                    });
                }
            });

            // Scanned vs Expected
            Object.keys(totalScannedMap).forEach(code => {
                const expected = remito.items.find(i => i.code === code);
                const scannedQty = totalScannedMap[code];
                if (!expected) {
                    discrepancies.extra.push({
                        code,
                        description: 'Desconocido', // Will try to enrich below
                        expected: 0,
                        scanned: scannedQty
                    });
                } else if (scannedQty > expected.quantity) {
                    discrepancies.extra.push({
                        code,
                        description: expected.description || expected.name,
                        expected: expected.quantity,
                        scanned: scannedQty
                    });
                }
            });

            // Enrich extra descriptions
            const extraCodes = discrepancies.extra.filter(d => d.description === 'Desconocido').map(d => d.code);
            if (extraCodes.length > 0) {
                const { data: pData } = await supabase.from('products').select('code, description').in('code', extraCodes);
                if (pData) {
                    const pMap = {};
                    pData.forEach(p => pMap[p.code] = p.description);
                    discrepancies.extra.forEach(d => {
                        if (pMap[d.code]) d.description = pMap[d.code];
                    });
                }
            }
            remito.discrepancies = discrepancies;
        } else if (isFinalized && remito.discrepancies) {
            // Enrich descriptions for finished remitos
            const discrepancyCodes = [
                ...(remito.discrepancies.missing || []).map(d => d.code),
                ...(remito.discrepancies.extra || []).map(d => d.code)
            ];
            if (discrepancyCodes.length > 0) {
                const { data: prods } = await supabase.from('products').select('code, description').in('code', discrepancyCodes);
                if (prods) {
                    const pMap = {};
                    prods.forEach(p => pMap[p.code] = p.description);
                    [...(remito.discrepancies.missing || []), ...(remito.discrepancies.extra || [])].forEach(item => {
                        if (pMap[item.code]) item.description = pMap[item.code];
                    });
                }
            }
        }

        res.json({ remito, userCounts });

    } catch (error) {
        console.error('Error fetching remito details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Export Remito to Excel
app.get('/api/remitos/:id/export', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Fetch Remito Data (Reuse similar logic to details)
        let { data: remito, error } = await supabase
            .from('remitos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Fetch Count Name
        let countName = remito.remito_number;
        if (remito.remito_number) {
            const { data: countData } = await supabase.from('general_counts').select('name').eq('id', remito.remito_number).maybeSingle();
            if (countData) countName = countData.name;
        }

        // 2. Fetch User Scans
        const { data: scans } = await supabase
            .from('inventory_scans')
            .select('user_id, code, quantity')
            .eq('order_number', remito.remito_number);

        // Enrich scans with user and product info if we have scans
        if (scans && scans.length > 0) {
            const userIds = [...new Set(scans.map(s => s.user_id))];
            const codes = [...new Set(scans.map(s => s.code))];

            // Fetch users
            const { data: users } = await supabase
                .from('users')
                .select('id, username')
                .in('id', userIds);

            // Fetch products
            const { data: products } = await supabase
                .from('products')
                .select('code, description')
                .in('code', codes);

            // Create lookup maps
            const userMap = {};
            const productMap = {};

            if (users) {
                users.forEach(u => userMap[u.id] = u.username);
            }

            if (products) {
                products.forEach(p => productMap[p.code] = p.description);
            }

            // Enrich scans
            scans.forEach(scan => {
                scan.users = { username: userMap[scan.user_id] || 'Desconocido' };
                scan.products = { description: productMap[scan.code] || 'Sin descripción' };
            });
        }

        // Update discrepancy descriptions with current product data
        if (remito.discrepancies && (remito.discrepancies.missing?.length > 0 || remito.discrepancies.extra?.length > 0)) {
            const discrepancyCodes = [
                ...(remito.discrepancies.missing || []).map(d => d.code),
                ...(remito.discrepancies.extra || []).map(d => d.code)
            ];

            if (discrepancyCodes.length > 0) {
                const { data: products } = await supabase
                    .from('products')
                    .select('code, description')
                    .in('code', discrepancyCodes);

                if (products && products.length > 0) {
                    const productMap = {};
                    products.forEach(p => productMap[p.code] = p.description);

                    // Update missing items descriptions
                    if (remito.discrepancies.missing) {
                        remito.discrepancies.missing.forEach(item => {
                            if (productMap[item.code]) {
                                item.description = productMap[item.code];
                            }
                        });
                    }

                    // Update extra items descriptions
                    if (remito.discrepancies.extra) {
                        remito.discrepancies.extra.forEach(item => {
                            if (productMap[item.code]) {
                                item.description = productMap[item.code];
                            }
                        });
                    }
                }
            }
        }

        const xlsx = require('xlsx');
        const workbook = xlsx.utils.book_new();

        // --- Sheet 1: General (All Items) ---
        // Basic list of items in the remito record
        const generalData = (remito.items || []).map(item => ({
            Codigo: item.code,
            Descripcion: item.name || item.description,
            Cantidad: item.quantity
        }));
        const wsGeneral = xlsx.utils.json_to_sheet(generalData);
        xlsx.utils.book_append_sheet(workbook, wsGeneral, "General");

        // --- Sheet 2: Por Usuario ---
        if (scans && scans.length > 0) {
            const userData = scans.map(s => ({
                Usuario: s.users?.username || 'Desconocido',
                Codigo: s.code,
                Descripcion: s.products?.description || '-',
                Cantidad: s.quantity
            }));
            const wsUsers = xlsx.utils.json_to_sheet(userData);
            xlsx.utils.book_append_sheet(workbook, wsUsers, "Por Usuario");
        } else {
            // If no granular scans, just list create_by
            const userData = (remito.items || []).map(item => ({
                Usuario: remito.created_by,
                Codigo: item.code,
                Descripcion: item.name || item.description,
                Cantidad: item.quantity
            }));
            const wsUsers = xlsx.utils.json_to_sheet(userData);
            xlsx.utils.book_append_sheet(workbook, wsUsers, "Por Usuario");
        }

        // --- Sheet 3: Diferencias ---
        const discrepancies = [];
        if (remito.discrepancies?.missing) {
            remito.discrepancies.missing.forEach(d => {
                discrepancies.push({
                    Tipo: 'Faltante',
                    Codigo: d.code,
                    Descripcion: d.description,
                    Esperado: d.expected,
                    Escaneado: d.scanned,
                    Diferencia: d.scanned - d.expected,
                    Motivo: d.reason === 'no_stock' ? 'Sin Stock' : d.reason
                });
            });
        }
        if (remito.discrepancies?.extra) {
            remito.discrepancies.extra.forEach(d => {
                discrepancies.push({
                    Tipo: 'Sobrante',
                    Codigo: d.code,
                    Descripcion: d.description,
                    Esperado: d.expected,
                    Escaneado: d.scanned,
                    Diferencia: d.scanned - d.expected,
                    Motivo: '-'
                });
            });
        }

        if (discrepancies.length > 0) {
            const wsDisc = xlsx.utils.json_to_sheet(discrepancies);
            xlsx.utils.book_append_sheet(workbook, wsDisc, "Diferencias");
        }

        // Buffer
        const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="Reporte_${countName}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error('Error generating excel:', error);
        res.status(500).json({ message: 'Error generating excel' });
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
                        // Use the new getAllProducts helper to avoid same 1000 limit here if count is large
                        const allProductsList = await getAllProducts();
                        const products = allProductsList.filter(p => codes.includes(p.code));

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

        const codes = Object.keys(totals);

        // 3. Fetch ALL Products
        // We need the full list to show items that were NOT scanned (quantity 0)
        // Fixed: Use pagination to avoid 1000 records limit
        const allProducts = await getAllProducts();

        // Build Report Array iterating over ALL products
        const report = allProducts.map(product => {
            const quantity = totals[product.code] || 0;
            return {
                code: product.code,
                barcode: product.barcode || '',
                description: product.description || 'Sin descripción',
                quantity,
                stock: product.current_stock || 0,
                difference: quantity - (product.current_stock || 0)
            };
        });

        // Add any scanned items that might not exist in products table (should not happen usually but safe to handle)
        const productCodes = new Set(allProducts.map(p => p.code));
        codes.forEach(scannedCode => {
            if (!productCodes.has(scannedCode)) {
                report.push({
                    code: scannedCode,
                    barcode: '',
                    description: 'Producto Desconocido (No en BD)',
                    quantity: totals[scannedCode],
                    stock: 0,
                    difference: totals[scannedCode]
                });
            }
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

// Helper to fetch ALL products in batches (Supabase/PostgREST 1000 limit)
async function getAllProducts() {
    let allProducts = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('products')
            .select('code, description, barcode, current_stock')
            .range(from, from + step - 1);

        if (error) {
            console.error('Error in getAllProducts:', error);
            throw error;
        }

        if (data && data.length > 0) {
            allProducts = [...allProducts, ...data];
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allProducts;
}

// The catch-all handler must be at the end, after all other routes
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
