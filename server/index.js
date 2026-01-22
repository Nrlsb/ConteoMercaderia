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
            const findKey = (partialKey) => Object.keys(row).find(k => k.trim() === partialKey);

            const codeKey = findKey('Producto');
            const descKey = findKey('Desc. Prod');
            const barcodeKey = findKey('CodeBar');

            const code = row[codeKey] ? String(row[codeKey]).trim() : null;
            const description = row[descKey] ? String(row[descKey]).trim() : null;
            let barcode = row[barcodeKey] ? String(row[barcodeKey]).trim() : null;

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
                barcode: barcode
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

        // 3. Create a lookup map for speed
        const preRemitoMap = {};
        preRemitosData.forEach(pre => {
            preRemitoMap[pre.order_number] = {
                numero_pv: pre.pedidos_ventas?.[0]?.numero_pv || '-',
                sucursal: pre.pedidos_ventas?.[0]?.sucursal || '-'
            };
        });

        // 4. Merge data
        const formattedData = remitosData.map(remito => {
            const extraInfo = preRemitoMap[remito.remito_number] || { numero_pv: '-', sucursal: '-' };
            return {
                ...remito,
                numero_pv: extraInfo.numero_pv,
                sucursal: extraInfo.sucursal
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
        const { data, error } = await supabase
            .from('remitos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

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
