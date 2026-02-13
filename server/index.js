const compression = require('compression');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { parseRemitoPdf } = require('./pdfParser');
const { parseExcelXml } = require('./xmlParser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

console.log('[AI CONFIG] GEMINI_API_KEY is', process.env.GEMINI_API_KEY ? 'DEFINED' : 'MISSING');
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    console.log('[AI CONFIG] GEMINI_API_KEY prefix:', process.env.GEMINI_API_KEY.substring(0, 5) + '...');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usar gemini-2.5-flash según confirmación del usuario de que es lo que le funciona
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const app = express();
const port = process.env.PORT || 3000;

// Configure CORS
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://conteo-mercaderia.vercel.app',
    'https://conteomercaderia.onrender.com',
    'https://conteo-mercaderia-khtxajjex-luksbs-projects.vercel.app',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const isAllowed = allowedOrigins.indexOf(origin) !== -1 ||
            (origin.endsWith('.vercel.app') && origin.includes('conteo-mercaderia'));

        if (!isAllowed) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            console.error('BLOCKED BY CORS:', origin);
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));
app.use(express.json());
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env file');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// Basic Route (API check)
app.get('/api/health', (req, res) => {
    res.send('Control de Remitos API Running');
});

// Middleware to verify token
const verifyToken = async (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Verify session is still valid in DB
        const { data: user, error } = await supabase
            .from('users')
            .select('current_session_id, role, is_session_active, sucursal_id') // Select session status and branch
            .eq('id', decoded.id)
            .single();

        if (error || !user) {
            return res.status(401).json({ message: 'User not found' });
        }

        if (user.current_session_id !== decoded.session_id || !user.is_session_active) {
            return res.status(401).json({ message: 'Sesión iniciada en otro dispositivo o sesión expirada' });
        }

        req.user = { ...decoded, role: user.role, sucursal_id: user.sucursal_id }; // Ensure role and branch are up to date
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

// AI Parsing Endpoint
app.post('/api/ai/parse-remito', verifyToken, async (req, res) => {
    const { text } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({ message: 'No se recibió texto para procesar' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'tu_clave_aqui') {
        return res.status(503).json({ message: 'AI Parsing not configured (Missing API Key)' });
    }

    try {
        console.log(`[AI PARSER] Recibido texto para procesar. Longitud: ${text.length}`);

        const prompt = `
            Eres un experto en extraer datos de documentos de logística (Remitos).
            Dado el siguiente texto extraído por un OCR de una imagen, identifica los productos, códigos y cantidades.
            
            REGLAS:
            1. Devuelve SOLO un array JSON de objetos.
            2. Cada objeto debe tener las llaves: "code" (string), "quantity" (number), "description" (string).
            3. Si una línea no parece un producto (encabezados, fechas, totales), ignórala.
            4. Si el código parece estar pegado a la cantidad o descripción, sepáralos.
            5. Los códigos suelen ser numéricos largos.
            6. Sé conservador: si no estás seguro de un campo, intenta deducirlo o ignora la línea.
            
            TEXTO OCR:
            ---
            ${text}
            ---
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const resultText = response.text();

        console.log(`[AI PARSER] Respuesta de Gemini recibida`);

        // Extract JSON from response (handling potential markdown formatting)
        const jsonMatch = resultText.match(/\[[\s\S]*\]/);
        const parsedItems = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        console.log(`[AI PARSER] Sincronización exitosa: ${parsedItems.length} items encontrados`);
        res.json(parsedItems);

    } catch (error) {
        console.error('CRITICAL ERROR in AI parsing:', error);
        res.status(500).json({
            message: 'Error procesando el texto con IA',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// AI Image Parsing Endpoint (Gemini Vision)
app.post('/api/ai/parse-image', verifyToken, multer({ storage: multer.memoryStorage() }).single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ninguna imagen' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'tu_clave_aqui') {
        return res.status(503).json({ message: 'AI Parsing not configured (Missing API Key)' });
    }

    try {
        console.log(`[AI IMAGE PARSER] Procesando imagen. Tamaño: ${req.file.size} bytes`);

        // Convert buffer to generative parts
        const imageParts = [
            {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: req.file.mimetype
                },
            },
        ];

        const prompt = `
            Eres un experto en extracción de datos de remitos de logística.
            Analiza la imagen adjunta y extrae todos los productos listados en la tabla del remito.
            
            REGLAS CRÍTICAS:
            1. Devuelve SOLO un array JSON válido de objetos.
            2. Cada objeto DEBE tener: "code" (string), "quantity" (number), "description" (string).
            3. El "code" es el código del producto (suele estar en la primera columna).
            4. La "quantity" es la cantidad pedida/enviada. Si ves decimales (ej: 42,00), conviértelos a número (42).
            5. La "description" es el nombre del producto.
            6. Ignora encabezados, totales, firmas o notas que no sean ítems de la tabla.
            7. Si hay marcas manuscritas (como tildes o números escritos a mano al lado de la cantidad), dales prioridad si indican una cantidad controlada, de lo contrario usa la impresa.
            8. Sé extremadamente preciso con los códigos numéricos.

            Formato esperado:
            [
              {"code": "123456", "quantity": 10, "description": "PRODUCTO EJEMPLO"},
              ...
            ]
        `;

        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        const resultText = response.text();

        console.log(`[AI IMAGE PARSER] Respuesta recibida de Gemini`);

        // Extract JSON from response
        const jsonMatch = resultText.match(/\[[\s\S]*\]/);
        const parsedItems = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        console.log(`[AI IMAGE PARSER] Extracción exitosa: ${parsedItems.length} items encontrados`);
        res.json(parsedItems);

    } catch (error) {
        console.error('CRITICAL ERROR in AI image parsing:', error);
        res.status(500).json({
            message: 'Error procesando la imagen con IA',
            details: error.message
        });
    }
});

// --- RECEIPTS ROUTES ---

// Create Receipt
app.post('/api/receipts', verifyToken, async (req, res) => {
    const { remitoNumber } = req.body;
    if (!remitoNumber) return res.status(400).json({ message: 'Missing remito number' });

    try {
        const { data, error } = await supabase
            .from('receipts')
            .insert([{
                remito_number: remitoNumber,
                created_by: req.user.username,
                date: new Date()
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating receipt:', error);
        res.status(500).json({ message: 'Error creating receipt' });
    }
});

// Get Receipts
app.get('/api/receipts', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('receipts')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching receipts:', error);
        res.status(500).json({ message: 'Error fetching receipts' });
    }
});

// Get Receipt Details
app.get('/api/receipts/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', id)
            .single();

        if (receiptError) throw receiptError;

        const { data: items, error: itemsError } = await supabase
            .from('receipt_items')
            .select(`
                *,
                products (
                    description,
                    brand,
                    code,
                    barcode,
                    provider_code
                )
            `)
            .eq('receipt_id', id);

        if (itemsError) throw itemsError;

        res.json({ ...receipt, items });
    } catch (error) {
        console.error('Error fetching receipt details:', error);
        res.status(500).json({ message: 'Error fetching receipt details' });
    }
});

// Add/Update Expected Item (by Provider Code or Internal Code)
// mode: 'provider' (default) or 'internal'
app.post('/api/receipts/:id/items', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { code, quantity } = req.body;

    if (!code || !quantity) return res.status(400).json({ message: 'Missing code or quantity' });

    try {
        // 1. Find the product first
        // Search by provider_code first, then internal code
        let { data: product, error: prodError } = await supabase
            .from('products')
            .select('code, provider_code, description')
            .eq('provider_code', code)
            .maybeSingle();

        if (!product) {
            // Try internal code
            const { data: productInternal } = await supabase
                .from('products')
                .select('code, provider_code, description')
                .eq('code', code)
                .maybeSingle();
            product = productInternal;
        }

        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado con ese código' });
        }

        // 2. Fetch existing item to log history
        const { data: existingItem } = await supabase
            .from('receipt_items')
            .select('*')
            .eq('receipt_id', id)
            .eq('product_code', product.code)
            .maybeSingle();

        let newQuantity = quantity;
        if (existingItem) {
            // If it exists, we add to expectation
            newQuantity = (Number(existingItem.expected_quantity) || 0) + Number(quantity);
        }

        const { data: savedItem, error: saveError } = await supabase
            .from('receipt_items')
            .upsert({
                receipt_id: id,
                product_code: product.code,
                expected_quantity: newQuantity
            }, { onConflict: 'receipt_id, product_code' })
            .select()
            .single();

        if (saveError) throw saveError;

        // 3. Log History
        const oldExpected = existingItem ? Number(existingItem.expected_quantity) : 0;
        console.log(`[DEBUG_HISTORY] Adding item - Old Expected: ${oldExpected}, New Expected: ${newQuantity}`);

        if (oldExpected !== newQuantity) {
            const { error: historyError } = await supabase.from('receipt_items_history').insert({
                receipt_id: id,
                user_id: req.user.id,
                operation: existingItem ? 'UPDATE_EXPECTED' : 'INSERT_EXPECTED',
                product_code: product.code,
                old_data: { expected_quantity: oldExpected },
                new_data: { expected_quantity: newQuantity },
                changed_at: new Date().toISOString()
            });

            if (historyError) {
                console.error('[DEBUG_HISTORY] Error inserting history (Add Item):', historyError);
            } else {
                console.log('[DEBUG_HISTORY] History insertion successful (Add Item)');
            }
        } else {
            console.log('[DEBUG_HISTORY] Quantities are equal, skipping history log.');
        }

        res.json(savedItem);
    } catch (error) {
        console.error('Error adding receipt item:', error);
        res.status(500).json({ message: 'Error adding receipt item' });
    }
});

// Increment Scanned Quantity (Control)
app.post('/api/receipts/:id/scan', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { code, quantity } = req.body;

    if (!code) return res.status(400).json({ message: 'Missing code' });
    const qtyToAdd = quantity || 1;

    try {
        let productCode = null;

        // Try exact match on code (internal)
        const { data: pCode } = await supabase.from('products').select('code').eq('code', code).maybeSingle();
        if (pCode) productCode = pCode.code;

        if (!productCode) {
            // Try barcode
            const { data: pBar } = await supabase.from('products').select('code').eq('barcode', code).maybeSingle();
            if (pBar) productCode = pBar.code;
        }

        if (!productCode) {
            // Try provider code
            const { data: pProv } = await supabase.from('products').select('code').eq('provider_code', code).maybeSingle();
            if (pProv) productCode = pProv.code;
        }

        if (!productCode) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        const { data: existingItem } = await supabase
            .from('receipt_items')
            .select('*')
            .eq('receipt_id', id)
            .eq('product_code', productCode)
            .maybeSingle();

        let newScanned = qtyToAdd;
        let currentExpected = 0;
        let oldScanned = 0;

        if (existingItem) {
            oldScanned = (Number(existingItem.scanned_quantity) || 0);
            newScanned = oldScanned + qtyToAdd;
            currentExpected = existingItem.expected_quantity;
        }

        const { data: savedItem, error: saveError } = await supabase
            .from('receipt_items')
            .upsert({
                receipt_id: id,
                product_code: productCode,
                scanned_quantity: newScanned,
                expected_quantity: currentExpected
            }, { onConflict: 'receipt_id, product_code' })
            .select()
            .single();

        if (saveError) throw saveError;

        // Log History
        console.log(`[DEBUG_HISTORY] Scan item - Old Scanned: ${oldScanned}, New Scanned: ${newScanned}`);

        if (oldScanned !== newScanned) {
            const { error: historyError } = await supabase.from('receipt_items_history').insert({
                receipt_id: id,
                user_id: req.user.id,
                operation: existingItem ? 'UPDATE_SCANNED' : 'INSERT_SCANNED',
                product_code: productCode,
                old_data: { scanned_quantity: oldScanned },
                new_data: { scanned_quantity: newScanned },
                changed_at: new Date().toISOString()
            });

            if (historyError) {
                console.error('[DEBUG_HISTORY] Error inserting history (Scan Item):', historyError);
            } else {
                console.log('[DEBUG_HISTORY] History insertion successful (Scan Item)');
            }
        } else {
            console.log('[DEBUG_HISTORY] Scanned quantities are equal, skipping history log.');
        }

        res.json(savedItem);

    } catch (error) {
        console.error('Error scanning receipt item:', error);
        res.status(500).json({ message: 'Error scanning item' });
    }
});

// Close Receipt
app.put('/api/receipts/:id/close', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('receipts')
            .update({ status: 'finalized' })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Error closing receipt:', error);
        res.status(500).json({ message: 'Error closing receipt' });
    }
});

// Reopen Receipt (Admin only)
app.put('/api/receipts/:id/reopen', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('receipts')
            .update({ status: 'open' })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Error reopening receipt:', error);
        res.status(500).json({ message: 'Error reopening receipt' });
    }
});

// Update Receipt Item (Manual override)
app.put('/api/receipts/:id/items/:itemId', verifyToken, async (req, res) => {
    const { id, itemId } = req.params;
    const { expected_quantity, scanned_quantity } = req.body;

    try {
        // Fetch existing for history
        const { data: oldItem } = await supabase
            .from('receipt_items')
            .select('*')
            .eq('id', itemId)
            .single();

        const { data, error } = await supabase
            .from('receipt_items')
            .update({ expected_quantity, scanned_quantity })
            .eq('id', itemId)
            .eq('receipt_id', id)
            .select();

        if (error) throw error;

        // Log History
        if (oldItem) {
            const hasChanged = Number(oldItem.expected_quantity) !== Number(expected_quantity) || Number(oldItem.scanned_quantity) !== Number(scanned_quantity);
            console.log(`[DEBUG_HISTORY] Manual Override - Changed: ${hasChanged}`);
            console.log(`[DEBUG_HISTORY] Old: Esp=${oldItem.expected_quantity}, Ctr=${oldItem.scanned_quantity}`);
            console.log(`[DEBUG_HISTORY] New: Esp=${expected_quantity}, Ctr=${scanned_quantity}`);

            if (hasChanged) {
                const { error: historyError } = await supabase.from('receipt_items_history').insert({
                    receipt_id: id,
                    user_id: req.user.id,
                    operation: 'MANUAL_OVERRIDE',
                    product_code: oldItem.product_code,
                    old_data: { expected_quantity: oldItem.expected_quantity, scanned_quantity: oldItem.scanned_quantity },
                    new_data: { expected_quantity, scanned_quantity },
                    changed_at: new Date().toISOString()
                });

                if (historyError) {
                    console.error('[DEBUG_HISTORY] Error inserting history (Manual Override):', historyError);
                } else {
                    console.log('[DEBUG_HISTORY] History insertion successful (Manual Override)');
                }
            } else {
                console.log('[DEBUG_HISTORY] No changes detected, skipping history log.');
            }
        } else {
            console.log('[DEBUG_HISTORY] Old item not found for history logging.');
        }

        res.json(data[0]);

    } catch (error) {
        console.error('Error updating receipt item:', error);
        res.status(500).json({ message: 'Error updating item' });
    }
});

// Get Receipt History
app.get('/api/receipt-history/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { data: history, error } = await supabase
            .from('receipt_items_history')
            .select('*')
            .eq('receipt_id', id)
            .order('changed_at', { ascending: false });

        if (error) throw error;

        // Enrich with usernames and product descriptions
        const userIds = [...new Set(history.map(h => h.user_id).filter(Boolean))];
        const productCodes = [...new Set(history.map(h => h.product_code).filter(Boolean))];

        const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
        const { data: products } = await supabase.from('products').select('code, description').in('code', productCodes);

        const userMap = {};
        if (users) users.forEach(u => userMap[u.id] = u.username);

        const productMap = {};
        if (products) products.forEach(p => productMap[p.code] = p.description);

        const enrichedHistory = history.map(entry => ({
            ...entry,
            username: userMap[entry.user_id] || 'Desconocido',
            description: productMap[entry.product_code] || 'Sin descripción'
        }));

        res.json(enrichedHistory);
    } catch (error) {
        console.error('Error fetching receipt history:', error);
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// Export Receipt to Excel
app.get('/api/receipts/:id/export', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', id)
            .single();

        if (receiptError) throw receiptError;

        const { data: items, error: itemsError } = await supabase
            .from('receipt_items')
            .select(`
                *,
                products (
                    description,
                    code,
                    provider_code
                )
            `)
            .eq('receipt_id', id);

        if (itemsError) throw itemsError;

        const xlsx = require('xlsx');
        const workbook = xlsx.utils.book_new();

        const data = items.map(item => ({
            'Código Interno': item.product_code,
            'Código Proveedor': item.products?.provider_code || '-',
            'Descripción': item.products?.description || 'Sin descripción',
            'Cant. Esperada': Number(item.expected_quantity) || 0,
            'Cant. Controlada': Number(item.scanned_quantity) || 0,
            'Diferencia': (Number(item.scanned_quantity) || 0) - (Number(item.expected_quantity) || 0)
        }));

        const worksheet = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Detalle Remito');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Remito_${receipt.remito_number}.xlsx`);
        res.send(buffer);

    } catch (error) {
        console.error('Error exporting receipt:', error);
        res.status(500).json({ message: 'Error al exportar remito' });
    }
});

// Export Receipt Differences to Excel
app.get('/api/receipts/:id/export-differences', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', id)
            .single();

        if (receiptError) throw receiptError;

        const { data: items, error: itemsError } = await supabase
            .from('receipt_items')
            .select(`
                *,
                products (
                    description,
                    code,
                    provider_code
                )
            `)
            .eq('receipt_id', id);

        if (itemsError) throw itemsError;

        // Filter only differences
        const diffItems = items.filter(item => {
            const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
            return diff !== 0;
        });

        if (diffItems.length === 0) {
            return res.status(400).json({ message: 'No hay diferencias para exportar' });
        }

        const xlsx = require('xlsx');
        const workbook = xlsx.utils.book_new();

        const data = diffItems.map(item => {
            const diff = (Number(item.scanned_quantity) || 0) - (Number(item.expected_quantity) || 0);
            return {
                'Código Interno': item.product_code,
                'Código Proveedor': item.products?.provider_code || '-',
                'Descripción': item.products?.description || 'Sin descripción',
                'Cant. Esperada': Number(item.expected_quantity) || 0,
                'Cant. Controlada': Number(item.scanned_quantity) || 0,
                'Diferencia': diff,
                'Estado': diff > 0 ? `Sobra ${diff}` : `Falta ${Math.abs(diff)}`
            };
        });

        const worksheet = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Diferencias');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Diferencias_Remito_${receipt.remito_number}.xlsx`);
        res.send(buffer);

    } catch (error) {
        console.error('Error exporting differences:', error);
        res.status(500).json({ message: 'Error al exportar diferencias' });
    }
});

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
            const brandKey = findKey('Grupo') || findKey('Marca');
            const barcodeKey = findKey('CodeBar') || findKey('BarCode');
            const stockKey = findKey('Saldo') || findKey('Stock') || findKey('Cantidad');

            const code = row[codeKey] ? String(row[codeKey]).trim() : null;
            const description = row[descKey] ? String(row[descKey]).trim() : null;
            const brand = row[brandKey] ? String(row[brandKey]).trim() : null;
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
                brand: brand,
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

// Branch Stock Import Endpoint (Admin only)
app.post('/api/stock/import', verifyToken, verifyAdmin, multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
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
            // Helper to find keys case-insensitively
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

            // Handle quantity (replace comma for dot if string)
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

            // Clave única para deduplicación: "producto|sucursal"
            const uniqueKey = `${productCode}|${sucursalId}`;

            stockEntriesMap.set(uniqueKey, {
                product_code: productCode,
                sucursal_id: sucursalId,
                quantity: isNaN(quantity) ? 0 : quantity,
                updated_at: new Date()
            });
        }

        // Convertir el Map de vuelta a un array de entradas únicas
        const stockEntries = Array.from(stockEntriesMap.values());
        const productsToUpdate = []; // To track products for Deposito sync

        // Identificar productos para sincronización de Depósito (solo después de deduplicar)
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
            // Fetch existing codes in chunks to avoid URL length issues or heavy queries if many unique
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

        // Filter valid entries
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

        // Update productsToUpdate for legacy sync as well (only valid ones)
        // Re-filter productsToUpdate
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
            // We do this in smaller batches to avoid overloading Supabase update
            for (const item of validProductsToUpdate) {
                await supabase
                    .from('products')
                    .update({ current_stock: item.quantity })
                    .eq('code', item.code);
            }
        }

        res.json({
            message: 'Stock imported successfully',
            totalRows: rawData.length,
            imported: upsertedCount,
            skipped: skippedRows,
            skippedProducts: skippedProductsCount,
            message: `Stock imported successfully. Processed: ${validStockEntries.length}. Skipped Rows: ${skippedRows}. Skipped Unknown Products: ${skippedProductsCount}.`
        });

    } catch (error) {
        console.error('Error importing stock:', error);
        res.status(500).json({ message: 'Error importing stock: ' + error.message });
    }
});

// Search products (DEBE IR ANTES de /:barcode para evitar conflicto de routing)
app.get('/api/products/search', verifyToken, async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    try {
        const { data, error } = await supabase
            .rpc('search_products', { search_term: q });

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
        // 1. Try exact match first
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .or(`code.eq.${barcode},barcode.eq.${barcode}`)
            .maybeSingle(); // Changed single() to maybeSingle() to handle null without throwing immediately

        if (data) {
            return res.json(data);
        }

        // 2. If not found, try Fallback using Search (Fuzzy/Relaxed)
        // This handles cases where there might be whitespace differences or if the user scanned a code that exists as a substring in a weird way?
        // But mainly for "invisible" chars or whitespace issues.
        console.log(`Product ${barcode} not found via exact match. Trying fallback search...`);

        const { data: searchResults, error: searchError } = await supabase
            .rpc('search_products', { search_term: barcode });

        if (!searchError && searchResults && searchResults.length > 0) {
            // Try to find a "good enough" match from search results
            // We look for exact string match on code or barcode, ignoring whitespace
            const match = searchResults.find(p =>
                (p.code && p.code.trim() === barcode.trim()) ||
                (p.barcode && p.barcode.trim() === barcode.trim())
            );

            if (match) {
                console.log(`Fallback search found match for ${barcode}:`, match.code);
                return res.json(match);
            }
        }

        // If still not found
        return res.status(404).json({ message: 'Product not found' });

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

        // --- BATCH OPTIMIZATION START ---

        // Collect all IDs that need progress calculation
        const pendingOrderNumbers = pendingPreRemitos.map(p => p.order_number);
        const openCountIds = (openGeneralCounts || []).map(c => c.id);
        const allRelevantIds = [...pendingOrderNumbers, ...openCountIds];

        if (allRelevantIds.length === 0) {
            // If no pending items, just return processed
            const processedFormatted = remitosData.map(remito => {
                const extraInfo = preRemitoMap[remito.remito_number] || { numero_pv: '-', sucursal: '-' };
                return {
                    ...remito,
                    numero_pv: extraInfo.numero_pv,
                    sucursal: extraInfo.sucursal,
                    count_name: countsMap[remito.remito_number] || null,
                    is_finalized: true,
                    type: 'remito'
                };
            });
            return res.json(processedFormatted.sort((a, b) => new Date(b.date) - new Date(a.date)));
        }

        // Batch Fetch 1: All scans for these orders using pagination helper
        const allScans = await getAllScansBatch(allRelevantIds);
        // const { data: allScans, error: scansError } = await supabase
        //     .from('inventory_scans')
        //     .select('order_number, code, quantity')
        //     .in('order_number', allRelevantIds);

        // if (scansError) throw scansError;

        // Batch Fetch 2: Get all unique product details involved in these scans
        const uniqueScanCodes = [...new Set(allScans.map(s => s.code))];
        let productMap = {};

        if (uniqueScanCodes.length > 0) {
            const { data: productsData, error: productError } = await supabase
                .from('products')
                .select('code, description, brand')
                .in('code', uniqueScanCodes);

            if (productError) throw productError;

            if (productsData) {
                productsData.forEach(p => {
                    productMap[p.code] = {
                        brand: p.brand,
                        description: p.description
                    };
                });
            }
        }

        // Helper to process scans for a specific ID
        const processOrderScans = (orderId, expectedItems = []) => {
            const orderScans = allScans.filter(s => s.order_number === orderId);

            let totalScanned = 0;
            let totalExpected = 0;
            let brands = new Set();

            // Calculate totals
            if (expectedItems && Array.isArray(expectedItems)) {
                expectedItems.forEach(item => {
                    totalExpected += (item.quantity || 0);
                });
            }

            orderScans.forEach(scan => {
                totalScanned += (scan.quantity || 0);

                // Resolve Brand
                const pInfo = productMap[scan.code];
                if (pInfo) {
                    if (pInfo.brand) {
                        brands.add(pInfo.brand);
                    } else if (pInfo.description) {
                        const brand = pInfo.description.split(' ')[0];
                        if (brand && brand.length > 2) brands.add(brand.toUpperCase());
                    }
                }
            });

            const progress = totalExpected > 0
                ? Math.min(Math.round((totalScanned / totalExpected) * 100), 100)
                : 0;

            return {
                progress,
                scanned_brands: Array.from(brands).slice(0, 5)
            };
        };

        // 6. Enrich Pending Pre-Remitos
        const pendingFormatted = pendingPreRemitos.map(pre => {
            const stats = processOrderScans(pre.order_number, pre.items);
            return {
                id: pre.id,
                remito_number: pre.order_number,
                items: pre.items,
                status: 'pending_scanned',
                created_by: 'Múltiples',
                date: pre.created_at,
                numero_pv: pre.pedidos_ventas?.[0]?.numero_pv || '-',
                sucursal: pre.pedidos_ventas?.[0]?.sucursal || '-',
                count_name: countsMap[pre.order_number] || null,
                progress: stats.progress,
                scanned_brands: stats.scanned_brands,
                is_finalized: false,
                type: 'pre_remito'
            };
        });

        // 7. Enrich Open General Counts
        const openCountsFormatted = (openGeneralCounts || []).map(count => {
            const stats = processOrderScans(count.id, []); // No expected items for general count
            return {
                id: count.id,
                remito_number: count.id,
                items: [],
                status: 'pending_scanned',
                created_by: count.created_by || 'Admin',
                date: count.created_at,
                numero_pv: '-',
                sucursal: '-',
                count_name: count.name,
                progress: null, // General counts don't have progress bar usually
                scanned_brands: stats.scanned_brands,
                is_finalized: false,
                type: 'general_count'
            };
        });

        // --- BATCH OPTIMIZATION END ---

        // 8. Merge data
        const processedFormatted = remitosData.map(remito => {
            const extraInfo = preRemitoMap[remito.remito_number] || { numero_pv: '-', sucursal: '-' };
            const countName = countsMap[remito.remito_number];

            return {
                ...remito,
                numero_pv: extraInfo.numero_pv,
                sucursal: extraInfo.sucursal,
                count_name: countName || null,
                is_finalized: true,
                type: 'remito'
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

// Delete Remito (Admin only)
app.delete('/api/remitos/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Get remito to find remito_number (for scans deletion)
        const { data: remito, error: fetchError } = await supabase
            .from('remitos')
            .select('remito_number')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. Delete scans associated with this remito (if any)
        if (remito && remito.remito_number) {
            await supabase.from('inventory_scans').delete().eq('order_number', remito.remito_number);
            await supabase.from('inventory_scans_history').delete().eq('order_number', remito.remito_number);
        }

        // 3. Delete the remito itself
        const { error: deleteError } = await supabase.from('remitos').delete().eq('id', id);

        if (deleteError) throw deleteError;

        res.json({ message: 'Remito deleted successfully' });
    } catch (error) {
        console.error('Error deleting remito:', error);
        res.status(500).json({ message: 'Error deleting remito' });
    }
});

// Delete Pre-Remito (Admin only)
app.delete('/api/pre-remitos/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Get pre-remito to find order_number
        const { data: preRemito, error: fetchError } = await supabase
            .from('pre_remitos')
            .select('order_number')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. Delete scans associated
        if (preRemito && preRemito.order_number) {
            await supabase.from('inventory_scans').delete().eq('order_number', preRemito.order_number);
            await supabase.from('inventory_scans_history').delete().eq('order_number', preRemito.order_number);
        }

        // 3. Delete pre-remito
        const { error: deleteError } = await supabase.from('pre_remitos').delete().eq('id', id);

        if (deleteError) throw deleteError;

        res.json({ message: 'Pre-remito deleted successfully' });
    } catch (error) {
        console.error('Error deleting pre-remito:', error);
        res.status(500).json({ message: 'Error deleting pre-remito' });
    }
});

// Delete General Count (Admin only)
app.delete('/api/general-counts/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Delete scans associated (using ID as order_number for general counts)
        await supabase.from('inventory_scans').delete().eq('order_number', id);
        await supabase.from('inventory_scans_history').delete().eq('order_number', id);

        // 2. Delete general count
        const { error: deleteError } = await supabase.from('general_counts').delete().eq('id', id);

        if (deleteError) throw deleteError;

        res.json({ message: 'General count deleted successfully' });
    } catch (error) {
        console.error('Error deleting general count:', error);
        res.status(500).json({ message: 'Error deleting general count' });
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
            // 1b. Fallback: Check if ID is actually the remito_number (General Count ID) which is common for General Counts
            const { data: finalizedRemitoByNumber } = await supabase
                .from('remitos')
                .select('*')
                .eq('remito_number', id)
                .maybeSingle();

            if (finalizedRemitoByNumber) {
                remito = finalizedRemitoByNumber;
            } else {
                // 2. Try Pre-Remitos (Pending)
                const { data: preRemito } = await supabase
                    .from('pre_remitos')
                    .select('*, pedidos_ventas(numero_pv, sucursal)')
                    .eq('id', id)
                    .maybeSingle();

                if (preRemito) {
                    let preRemitoItems = preRemito.items || [];

                    // If no items in pre_remito, fetch all products with stock as expected items
                    if (preRemitoItems.length === 0) {
                        const { data: allProducts } = await supabase
                            .from('products')
                            .select('code, description, current_stock, brand, brand_code')
                            .gt('current_stock', 0);

                        preRemitoItems = (allProducts || []).map(p => ({
                            code: p.code,
                            name: p.description,
                            description: p.description,
                            quantity: p.current_stock,
                            brand: p.brand,
                            brand_code: p.brand_code
                        }));
                    }

                    remito = {
                        id: preRemito.id,
                        remito_number: preRemito.order_number,
                        items: preRemitoItems,
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
                        // Fetch products with stock logic depending on sucursal
                        // If sucursal_id is present, fetch from stock_sucursal
                        // Else, fallback to products.current_stock (Global)

                        let items = [];

                        if (generalCount.sucursal_id) {
                            console.log(`Fetching stock for general count ${generalCount.id} from branch ${generalCount.sucursal_id}`);

                            // Fetch stock specific to branch
                            const { data: branchStock } = await supabase
                                .from('stock_sucursal')
                                .select('product_code, quantity, products(description, brand, brand_code)')
                                .eq('sucursal_id', generalCount.sucursal_id);
                            // Removed .gt('quantity', 0) to include 0 stock items

                            if (branchStock && branchStock.length > 0) {
                                items = branchStock.map(s => ({
                                    code: s.product_code,
                                    name: s.products?.description || 'Desconocido',
                                    description: s.products?.description || 'Desconocido',
                                    quantity: Number(s.quantity),
                                    brand: s.products?.brand,
                                    brand_code: s.products?.brand_code
                                }));
                            } else {
                                // Fallback: If branch has NO data, load ALL products with 0 quantity
                                // This ensures the user sees the master list to count against
                                console.log('Branch has no stock data. Loading master product list...');
                                const { data: allProducts } = await supabase
                                    .from('products')
                                    .select('code, description, current_stock, brand, brand_code');

                                items = (allProducts || []).map(p => ({
                                    code: p.code,
                                    name: p.description,
                                    description: p.description,
                                    quantity: 0, // Assume 0 for blind/initial count
                                    brand: p.brand,
                                    brand_code: p.brand_code
                                }));
                            }
                        } else {
                            // Legacy / Global mode
                            // Fetch all active products
                            const { data: allProducts } = await supabase
                                .from('products')
                                .select('code, description, current_stock, brand, brand_code');
                            // Removed .gt('current_stock', 0) to include everything

                            items = (allProducts || []).map(p => ({
                                code: p.code,
                                name: p.description,
                                description: p.description,
                                quantity: p.current_stock || 0,
                                brand: p.brand,
                                brand_code: p.brand_code
                            }));
                        }

                        remito = {
                            id: generalCount.id,
                            remito_number: generalCount.id,
                            count_name: generalCount.name,
                            items: items,
                            date: generalCount.created_at,
                            status: 'pending',
                            numero_pv: '-',
                            sucursal: generalCount.sucursal_id ? 'Sucursal Seleccionada' : '-', // We could fetch name, but ID is enough for logic
                            sucursal_id: generalCount.sucursal_id
                        };
                        isFinalized = false;
                    }
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
        // Use pagination helper to ensure we get ALL scans
        const scans = await getAllScans(remito.remito_number);
        console.log(`[DEBUG_DETAILS] Scans found in DB for order ${remito.remito_number}: ${scans ? scans.length : 0}`);
        const scansError = null; // Helper throws on error

        // const { data: scans, error: scansError } = await supabase
        //     .from('inventory_scans')
        //     .select('user_id, code, quantity')
        //     .eq('order_number', remito.remito_number);

        let userCounts = [];
        let totalScannedMap = {};

        if (!scansError && scans && scans.length > 0) {
            const userIds = [...new Set(scans.map(s => s.user_id))];
            const codes = [...new Set(scans.map(s => s.code))];

            const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
            const { data: products } = await supabase.from('products').select('code, description, brand, brand_code').in('code', codes);

            const userMap = {};
            const productMap = {};
            if (users) users.forEach(u => userMap[u.id] = u.username);
            // Store complete product info including brand
            if (products) products.forEach(p => productMap[p.code] = {
                description: p.description,
                brand: p.brand,
                brand_code: p.brand_code
            });

            const userCountsMap = {};
            scans.forEach(scan => {
                const username = userMap[scan.user_id] || 'Desconocido';
                const qty = scan.quantity || 0;
                const productInfo = productMap[scan.code] || { description: 'Sin descripción', brand: null, brand_code: null };

                // Track totals for active discrepancy calculation
                totalScannedMap[scan.code] = (totalScannedMap[scan.code] || 0) + qty;

                if (!userCountsMap[username]) {
                    userCountsMap[username] = { username, items: [], totalItems: 0, totalUnits: 0 };
                }
                userCountsMap[username].items.push({
                    code: scan.code,
                    description: productInfo.description,
                    brand: productInfo.brand,
                    brand_code: productInfo.brand_code,
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

                // Only add to extra if scanned quantity is > 0 and (not in expected OR scanned > expected)
                if (scannedQty > 0) {
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
                }
            });

            // Enrich all descriptions (Expected and Extra)
            const allCodes = [
                ...remito.items.map(i => i.code),
                ...discrepancies.extra.map(d => d.code),
                ...discrepancies.missing.map(d => d.code)
            ];

            if (allCodes.length > 0) {
                const { data: pData } = await supabase.from('products').select('code, description, brand').in('code', [...new Set(allCodes)]);
                if (pData) {
                    const pMap = {};
                    pData.forEach(p => pMap[p.code] = { description: p.description, brand: p.brand });

                    // Update expected items
                    remito.items.forEach(item => {
                        if (pMap[item.code]) {
                            item.description = pMap[item.code].description;
                            item.name = pMap[item.code].description;
                            item.brand = pMap[item.code].brand;
                        }
                    });

                    // Update missing items
                    discrepancies.missing.forEach(d => {
                        if (pMap[d.code]) {
                            d.description = pMap[d.code].description;
                            d.name = pMap[d.code].description;
                            d.brand = pMap[d.code].brand;
                        }
                    });

                    // Update extra items
                    discrepancies.extra.forEach(d => {
                        if (pMap[d.code]) {
                            d.description = pMap[d.code].description;
                            d.name = pMap[d.code].description;
                            d.brand = pMap[d.code].brand;
                        }
                    });
                }
            }
            remito.discrepancies = discrepancies;
        } else if (isFinalized && remito.discrepancies) {
            // Enrich descriptions for all items in finalized remitos
            const allCodes = [
                ...(remito.items || []).map(i => i.code),
                ...(remito.discrepancies.missing || []).map(d => d.code),
                ...(remito.discrepancies.extra || []).map(d => d.code)
            ];

            if (allCodes.length > 0) {
                const { data: prods } = await supabase.from('products').select('code, description, brand').in('code', [...new Set(allCodes)]);
                if (prods) {
                    const pMap = {};
                    prods.forEach(p => pMap[p.code] = { description: p.description, brand: p.brand });

                    // Refresh expected items description
                    if (remito.items) {
                        remito.items.forEach(item => {
                            if (pMap[item.code]) {
                                item.description = pMap[item.code].description;
                                item.name = pMap[item.code].description;
                                item.brand = pMap[item.code].brand;
                            }
                        });
                    }

                    [...(remito.discrepancies.missing || []), ...(remito.discrepancies.extra || [])].forEach(item => {
                        if (pMap[item.code]) {
                            item.description = pMap[item.code].description;
                            item.name = pMap[item.code].description;
                            item.brand = pMap[item.code].brand;
                        }
                    });
                }
            }
        }

        // Final marking of finalized status
        remito.is_finalized = isFinalized;

        console.log(`[DEBUG_DETAILS] Fetched details for ID ${id}. Finalized: ${isFinalized}. Found remito_number: ${remito.remito_number}`);
        res.json({ remito, userCounts, is_finalized: isFinalized });

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

        // 2. Fetch User Scans (Paginated)
        const scans = await getAllScans(remito.remito_number);

        // const { data: scans } = await supabase
        //     .from('inventory_scans')
        //     .select('user_id, code, quantity, timestamp')
        //     .eq('order_number', remito.remito_number);

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

        // --- Sheet 1: Diferencias (ONLY) ---
        const discrepanciesData = [];

        // Map to find the last scanner for each product
        const lastScannerMap = {};
        if (scans && scans.length > 0) {
            // Sort scans by timestamp descending to easily pick the first one (latest)
            const sortedScans = [...scans].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            sortedScans.forEach(s => {
                if (!lastScannerMap[s.code]) {
                    lastScannerMap[s.code] = s.users?.username || 'Desconocido';
                }
            });
        }

        if (remito.discrepancies?.missing) {
            remito.discrepancies.missing.forEach(d => {
                discrepanciesData.push({
                    Codigo: d.code,
                    Descripcion: d.description,
                    'Stock actual': d.expected,
                    Diferencia: d.scanned - d.expected,
                    'Último Escaneo': lastScannerMap[d.code] || '-'
                });
            });
        }
        if (remito.discrepancies?.extra) {
            remito.discrepancies.extra.forEach(d => {
                discrepanciesData.push({
                    Codigo: d.code,
                    Descripcion: d.description,
                    'Stock actual': d.expected,
                    Diferencia: d.scanned - d.expected,
                    'Último Escaneo': lastScannerMap[d.code] || '-'
                });
            });
        }

        if (discrepanciesData.length > 0) {
            const wsDisc = xlsx.utils.json_to_sheet(discrepanciesData);
            xlsx.utils.book_append_sheet(workbook, wsDisc, "Diferencias");
        } else {
            // If no discrepancies, maybe add an empty sheet saying so or just the items
            // But request was "only sheet differences", if empty we can just export empty or all items as differences 0?
            // Safest is to just export an empty "Diferencias" sheet if truly empty to avoid corrupt file
            const wsDisc = xlsx.utils.json_to_sheet([{ Info: "Sin discrepancias" }]);
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

                // Reuse logic to generate report (Paginated)
                const scans = await getAllScans(data.remito_number);

                // const { data: scans } = await supabase
                //     .from('inventory_scans')
                //     .select('code, quantity')
                //     .eq('order_number', data.remito_number); // Use remito_number (which is the count ID)

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
        let formattedData = data.map(item => ({
            ...item,
            numero_pv: item.pedidos_ventas?.[0]?.numero_pv || null,
            sucursal: item.pedidos_ventas?.[0]?.sucursal || null
        }));

        // Filter by branch if not admin
        if (req.user.role !== 'admin') {
            const { sucursal_id } = req.user;
            if (sucursal_id) {
                // Get branch name
                const { data: branchData, error: branchError } = await supabase
                    .from('sucursales')
                    .select('name')
                    .eq('id', sucursal_id)
                    .single();

                if (!branchError && branchData) {
                    const userBranchName = branchData.name;
                    // Filter: Keep if matches branch OR is 'Global' OR has no branch assigned (optional, assuming 'Global' if null?)
                    // User request: "only those belonging to that branch".
                    // So strict filtering: match branch name OR explicit 'Global'.
                    formattedData = formattedData.filter(item => {
                        const itemBranch = item.sucursal;
                        if (!itemBranch) return true; // Show if no branch is specified (safest default, or false?) -> Let's keep it visible so they don't lose loose orders.
                        if (itemBranch.toLowerCase() === 'global') return true;

                        // Normalize for comparison
                        return itemBranch.toLowerCase().trim() === userBranchName.toLowerCase().trim();
                    });
                }
            } else {
                // User has no branch assigned.
                // Should they see everything? or nothing?
                // Probably nothing or only Global?
                // Let's assume if no branch assigned, they see nothing branch-specific, only Global/Generic.
                formattedData = formattedData.filter(item => !item.sucursal || item.sucursal.toLowerCase() === 'global');
            }
        }

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
app.get('/api/settings', async (req, res) => {
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
            .select('*, sucursales(name)')
            .eq('status', 'open')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching active counts:', error);
            return res.status(500).json({ message: 'Error fetching active counts' });
        }

        let counts = data.map(c => ({
            ...c,
            sucursal_name: c.sucursales ? c.sucursales.name : null
        }));

        // Filter by branch if not admin
        if (req.user.role !== 'admin') {
            const { sucursal_id } = req.user;
            if (sucursal_id) {
                counts = counts.filter(c => !c.sucursal_id || c.sucursal_id == sucursal_id);
            } else {
                // If user has no branch, only show global ones (no sucursal_id)
                counts = counts.filter(c => !c.sucursal_id);
            }
        }

        res.json(counts);
    } catch (error) {
        console.error('Server error fetching active counts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/general-counts', verifyToken, verifyAdmin, async (req, res) => {
    const { name, sucursal_id } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    try {
        // Removed check for existing open count to allow multiples

        const { data, error } = await supabase
            .from('general_counts')
            .insert([{
                name,
                status: 'open',
                sucursal_id: sucursal_id || null // Optional: defaults to null (Global/Deposito implicitly or just no branch filter)
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

        // 2. Generate Report (Fetch ALL scans paginated)
        const scans = await getAllScans(id);
        const scansError = null;

        // const { data: scans, error: scansError } = await supabase
        //     .from('inventory_scans')
        //     .select('code, quantity')
        //     .eq('order_number', id);

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
            // Expected items for General Count is the theoretical current_stock
            items: allProducts.map(p => ({
                code: p.code,
                description: p.description,
                quantity: p.current_stock || 0
            })),
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
        // 1. Get Expected Items (Pre-Remito OR General Count)
        let expectedItems = [];
        let isGeneralCount = false;

        // Try Pre-Remito first
        const { data: preRemito, error: preError } = await supabase
            .from('pre_remitos')
            .select('items')
            .eq('order_number', orderNumber)
            .maybeSingle();

        if (preError) throw preError;

        if (preRemito) {
            expectedItems = preRemito.items || [];
        } else {
            // Fallback: Check General Counts
            const { data: generalCount, error: genError } = await supabase
                .from('general_counts')
                .select('id')
                .eq('id', orderNumber)
                .maybeSingle();

            if (genError) throw genError;

            if (!generalCount) {
                return res.status(404).json({ message: 'Order not found' });
            }
            // General Count found - keep expectedItems empty (or logic to fetch stock could go here later)
            isGeneralCount = true;
        }

        // ENRICHMENT: Fetch brands for items that might be missing them
        if (expectedItems.length > 0) {
            const codes = expectedItems.map(i => i.code);
            // Fetch brands from products table
            const { data: products } = await supabase
                .from('products')
                .select('code, brand')
                .in('code', codes);

            if (products) {
                const brandMap = {};
                products.forEach(p => brandMap[p.code] = p.brand);

                // Update expected items with brand
                expectedItems = expectedItems.map(item => ({
                    ...item,
                    brand: item.brand || brandMap[item.code] || 'Sin Marca'
                }));
            }
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
        const myCodes = new Set();

        scans.forEach(scan => {
            const qty = scan.quantity || 0;

            // Global Total
            scannedMap[scan.code] = (scannedMap[scan.code] || 0) + qty;

            // My Scans
            if (scan.user_id === userId) {
                myScansMap[scan.code] = (myScansMap[scan.code] || 0) + qty;
                myCodes.add(scan.code);
            }
        });

        // 4. Enrich My Scans with Description for Frontend Restoration
        const myScansList = [];
        const missingCodes = [];

        // Map expected items for quick lookup
        const expectedMap = {};
        expectedItems.forEach(i => expectedMap[i.code] = i);

        Array.from(myCodes).forEach(code => {
            if (expectedMap[code]) {
                myScansList.push({
                    code: code,
                    name: expectedMap[code].description,
                    barcode: expectedMap[code].barcode,
                    quantity: myScansMap[code]
                });
            } else {
                missingCodes.push(code);
            }
        });

        // Fetch details for items not in expected list
        if (missingCodes.length > 0) {
            const { data: found } = await supabase
                .from('products')
                .select('code, description, barcode')
                .in('code', missingCodes);

            const foundMap = {};
            if (found) found.forEach(f => foundMap[f.code] = f);

            missingCodes.forEach(code => {
                const p = foundMap[code];
                myScansList.push({
                    code: code,
                    name: p ? p.description : 'Producto Desconocido',
                    barcode: p ? p.barcode : code,
                    quantity: myScansMap[code]
                });
            });
        }

        res.json({
            orderNumber,
            expected: expectedItems, // Enriched with brands
            scanned: scannedMap,
            myScans: myScansMap,     // Legacy support
            myItems: myScansList     // Rich list for session restore
        });

    } catch (error) {
        console.error('Error fetching inventory state:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Submit/Sync Scans (Absolute Overwrite - Legacy)
app.post('/api/inventory/scan', verifyToken, async (req, res) => {
    const { orderNumber, items } = req.body; // items: [{ code, quantity }]

    if (!orderNumber || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Invalid data' });
    }

    try {
        const userId = req.user.id;
        console.log(`[DEBUG_SCAN] Incoming sync request for order ${orderNumber} from user ${userId}. Items count: ${items.length}`);
        if (items.length > 0) console.log(`[DEBUG_SCAN] Sample item:`, items[0]);

        /* Manual history logging removed as it is handled by DB triggers */

        // Prepare Upsert Data
        const upsertData = items.map(item => ({
            order_number: orderNumber,
            user_id: userId,
            code: item.code,
            quantity: item.quantity,
            timestamp: new Date().toISOString()
        }));

        const { error: upsertError } = await supabase
            .from('inventory_scans')
            .upsert(upsertData, { onConflict: 'order_number, user_id, code' });

        if (upsertError) throw upsertError;

        /* Manual history logging removed */


        console.log(`[DEBUG_SCAN] Synced ${items.length} items for order ${orderNumber} by user ${userId}`);

        res.json({ message: 'Scans synced successfully', count: items.length });

    } catch (error) {
        console.error('Error syncing scans:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Incremental Scan Endpoint (Read-Modify-Write)
app.post('/api/inventory/scan-incremental', verifyToken, async (req, res) => {
    const { orderNumber, items } = req.body; // items: [{ code, quantity }] - Quantity is DELTA

    if (!orderNumber || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Invalid data' });
    }

    try {
        const userId = req.user.id;
        const results = [];
        console.log(`[DEBUG_INCREMENTAL] Incoming request for order ${orderNumber} from user ${userId}. Items: ${JSON.stringify(items)}`);

        // Process sequentially to avoid race conditions on same row if multiple items target same code (unlikely but possible)
        for (const item of items) {
            const internalCode = String(item.code).trim();
            const delta = parseInt(item.quantity, 10);
            if (isNaN(delta) || delta === 0) continue;

            // 1. Fetch current value
            const { data: existing, error: fetchError } = await supabase
                .from('inventory_scans')
                .select('quantity')
                .match({ order_number: orderNumber, user_id: userId, code: internalCode })
                .maybeSingle();

            if (fetchError) throw fetchError;

            const newQuantity = (existing ? existing.quantity : 0) + delta;

            // 2. Upsert new value
            // Note: There is still a tiny race condition here if two requests interleave significantly,
            // but it is much safer than overwriting with frontend state 0.
            const { error: upsertError } = await supabase
                .from('inventory_scans')
                .upsert({
                    order_number: orderNumber,
                    user_id: userId,
                    code: internalCode,
                    quantity: newQuantity,
                    timestamp: new Date().toISOString()
                }, { onConflict: 'order_number, user_id, code' });

            if (upsertError) {
                console.error(`[DEBUG_INCREMENTAL] Error upserting ${internalCode}:`, upsertError);
                throw upsertError;
            }

            /* Manual history logging removed as it is handled by DB triggers */

            results.push({ code: internalCode, newQuantity });
        }

        console.log(`[DEBUG_INCREMENTAL] Updated ${results.length} items for order ${orderNumber} by user ${userId}`);

        res.json({ message: 'Scans incremented successfully', results });

    } catch (error) {
        console.error('Error incrementing scans:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get Inventory History (Audit Log)
app.get('/api/history/:orderNumber', verifyToken, async (req, res) => {
    const { orderNumber } = req.params;

    try {
        const { data: history, error } = await supabase
            .from('inventory_scans_history')
            .select('*')
            .eq('order_number', orderNumber)
            .order('changed_at', { ascending: false });

        if (error) throw error;

        console.log(`[DEBUG_HISTORY] Fetching history for order: ${orderNumber}`);
        console.log(`[DEBUG_HISTORY] Records found: ${history ? history.length : 0}`);
        if (history && history.length > 0) {
            console.log('[DEBUG_HISTORY] Sample record:', history[0]);
        }

        // Enrich with usernames
        // We need to fetch users because history might contain user_ids
        const userIds = [...new Set(history.map(h => h.user_id).filter(Boolean))];
        const { data: users } = await supabase
            .from('users')
            .select('id, username')
            .in('id', userIds);

        const userMap = {};
        if (users) users.forEach(u => userMap[u.id] = u.username);

        // Enrich with Product Info (optional, but good for context if desc is missing)
        const codes = [...new Set(history.map(h => h.code).filter(Boolean))];
        const { data: products } = await supabase
            .from('products')
            .select('code, description')
            .in('code', codes);

        const productMap = {};
        if (products) products.forEach(p => productMap[p.code] = p.description);

        const enrichedHistory = history.map(entry => ({
            ...entry,
            username: userMap[entry.user_id] || 'Desconocido',
            description: productMap[entry.code] || 'Producto sin descripción'
        }));

        res.json(enrichedHistory);

    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

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

// Auth Routes

// Get User Data
app.get('/api/auth/user', verifyToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, role, sucursal_id')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;
        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

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
                    is_session_active: true,
                    role: 'user', // Default role
                    sucursal_id: req.body.sucursal_id || null
                }
            ])
            .select();

        if (error) throw error;

        // Generate Token
        const token = jwt.sign(
            { id: data[0].id, username: data[0].username, role: data[0].role, session_id: sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );

        res.status(201).json({ token, user: { id: data[0].id, username: data[0].username, role: data[0].role, sucursal_id: data[0].sucursal_id } });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password, force } = req.body;

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

        // Check for existing active session if not forcing
        if (!force && user.is_session_active && user.current_session_id) {
            // Check if session is stale (more than 5 minutes since last seen)
            const lastSeen = user.last_seen ? new Date(user.last_seen) : null;
            const now = new Date();
            const isStale = lastSeen && (now - lastSeen > 5 * 60 * 1000); // 5 minutes

            if (!isStale) {
                return res.status(409).json({
                    sessionActive: true,
                    message: 'Ya tienes una sesión activa en otro dispositivo. ¿Deseas cerrarla e iniciar aquí?'
                });
            }
            // If stale, we proceed to overwrite without 409
            console.log(`Session for user ${username} is stale (${lastSeen}). Overwriting.`);
        }

        // Generate New Session ID
        const sessionId = uuidv4();

        // Update user with new session ID and reset last_seen
        const { error: updateError } = await supabase
            .from('users')
            .update({
                current_session_id: sessionId,
                is_session_active: true,
                last_seen: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) throw updateError;

        // Generate Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, session_id: sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );

        res.json({ token, user: { id: user.id, username: user.username, role: user.role, sucursal_id: user.sucursal_id } });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// --- Sucursales Routes ---

// Get all sucursales
app.get('/api/sucursales', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sucursales')
            .select('*')
            .order('name');

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching sucursales:', error);
        res.status(500).json({ message: 'Error fetching sucursales' });
    }
});

// Create sucursal (Admin)
app.post('/api/sucursales', verifyToken, verifyAdmin, async (req, res) => {
    const { name, location, code } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    try {
        const { data, error } = await supabase
            .from('sucursales')
            .insert([{ name, location, code }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating sucursal:', error);
        res.status(500).json({ message: 'Error creating sucursal' });
    }
});

// Update sucursal (Admin)
app.put('/api/sucursales/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, location, code } = req.body;

    try {
        const { data, error } = await supabase
            .from('sucursales')
            .update({ name, location, code })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error updating sucursal:', error);
        res.status(500).json({ message: 'Error updating sucursal' });
    }
});

// Delete sucursal (Admin)
app.delete('/api/sucursales/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('sucursales')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Sucursal deleted' });
    } catch (error) {
        console.error('Error deleting sucursal:', error);
        res.status(500).json({ message: 'Error deleting sucursal' });
    }
});

// --- User Management Routes (Admin) ---

// Get all users
app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, role, is_session_active, last_seen, created_at, sucursal_id, sucursales(name)')
            .order('username');

        if (error) throw error;

        // Flatten sucursal name
        const users = data.map(u => ({
            ...u,
            sucursal_name: u.sucursales ? u.sucursales.name : 'N/A'
        }));

        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// Update user (including sucursal)
app.put('/api/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { role, sucursal_id, password } = req.body;

    try {
        const updates = {};
        if (role) updates.role = role;
        if (sucursal_id !== undefined) updates.sucursal_id = sucursal_id; // Allow null to clear
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updates.password = await bcrypt.hash(password, salt);
        }

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'User updated', user: { id: data.id, username: data.username, role: data.role, sucursal_id: data.sucursal_id } });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

// --- Stock Management Routes ---

// Get stock for a product across all branches
app.get('/api/products/:code/stock', verifyToken, async (req, res) => {
    const { code } = req.params;
    try {
        // 1. Get Product Info (including global stock)
        const { data: product, error: prodError } = await supabase
            .from('products')
            .select('code, description, current_stock')
            .eq('code', code)
            .single();

        if (prodError) throw prodError;

        // 2. Get Branch Stock
        const { data: branchStock, error: stockError } = await supabase
            .from('stock_sucursal')
            .select('sucursal_id, quantity, sucursales(name)')
            .eq('product_code', code);

        if (stockError) throw stockError;

        // 3. Combine
        // Always include "Deposito" (Global Stock) as one entry if we want to present it uniformly
        // OR return separate fields.
        // Decision: Return a list of all stocks.

        // Get all branches to ensure we show 0 for those with no record
        const { data: allBranches } = await supabase.from('sucursales').select('id, name');

        const stocks = allBranches.map(branch => {
            if (branch.name === 'Deposito') {
                // Return the global stock from products table (assuming Deposito = Global for now as per plan)
                // OR check if we are migrating. Plan said "Parallel structure". 
                // Let's check if there is an entry in stock_sucursal for Deposito.
                const entry = branchStock.find(s => s.sucursal_id === branch.id);
                return {
                    sucursal_id: branch.id,
                    sucursal_name: branch.name,
                    quantity: entry ? entry.quantity : (product.current_stock || 0) // Fallback to product.current_stock if not in stock_sucursal yet
                };
            }

            const entry = branchStock.find(s => s.sucursal_id === branch.id);
            return {
                sucursal_id: branch.id,
                sucursal_name: branch.name,
                quantity: entry ? entry.quantity : 0
            };
        });

        res.json({
            product,
            stocks
        });

    } catch (error) {
        console.error('Error fetching stock:', error);
        res.status(500).json({ message: 'Error fetching stock' });
    }
});

// Update stock for a specific branch
app.put('/api/products/:code/stock', verifyToken, async (req, res) => {
    const { code } = req.params;
    const { sucursal_id, quantity, operation } = req.body; // operation: 'set', 'add', 'subtract'

    if (!sucursal_id || quantity === undefined) return res.status(400).json({ message: 'Missing parameters' });

    try {
        // Check permissions? Manager/Admin only? Allow for now.

        // 1. Check if it's Deposito
        const { data: branch } = await supabase.from('sucursales').select('name').eq('id', sucursal_id).single();
        const isDeposito = branch && branch.name === 'Deposito';

        let newQuantity = Number(quantity);

        if (operation && operation !== 'set') {
            // We need to fetch current first
            const { data: current } = await supabase
                .from('stock_sucursal')
                .select('quantity')
                .match({ product_code: code, sucursal_id })
                .maybeSingle();

            const currentQty = current ? Number(current.quantity) : 0;
            if (operation === 'add') newQuantity = currentQty + newQuantity;
            if (operation === 'subtract') newQuantity = currentQty - newQuantity;
        }

        // 2. Upsert stock_sucursal
        const { error } = await supabase
            .from('stock_sucursal')
            .upsert({
                product_code: code,
                sucursal_id,
                quantity: newQuantity,
                updated_at: new Date()
            }, { onConflict: 'product_code, sucursal_id' });

        if (error) throw error;

        // 3. If Deposito, also sync with products.current_stock (Legacy Sync)
        if (isDeposito) {
            await supabase
                .from('products')
                .update({ current_stock: newQuantity })
                .eq('code', code);
        }

        res.json({ message: 'Stock updated', newQuantity });

    } catch (error) {
        console.error('Error updating stock:', error);
        res.status(500).json({ message: 'Error updating stock' });
    }
});

// Get Stock Matrix (Paginated)
app.get('/api/stock/matrix', verifyToken, async (req, res) => {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (page - 1) * limit;

    try {
        // 1. Get Branches to build columns
        const { data: branches, error: branchError } = await supabase
            .from('sucursales')
            .select('id, name')
            .order('name');

        if (branchError) throw branchError;

        // 2. Fetch Products (Paginated & Filtered)
        let query = supabase
            .from('products')
            .select('code, description, current_stock', { count: 'exact' });

        if (search) {
            query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`);
        }

        const { data: products, count, error: prodError } = await query
            .range(offset, offset + Number(limit) - 1)
            .order('code');

        if (prodError) throw prodError;

        if (!products || products.length === 0) {
            return res.json({ data: [], total: 0, branches });
        }

        // 3. Fetch Stock for these products
        const productCodes = products.map(p => p.code);
        const { data: stocks, error: stockError } = await supabase
            .from('stock_sucursal')
            .select('product_code, sucursal_id, quantity')
            .in('product_code', productCodes);

        if (stockError) throw stockError;

        // 4. Build Matrix
        const matrix = products.map(p => {
            const row = {
                code: p.code,
                description: p.description,
                stocks: {}
            };

            // Initialize all branches with 0
            branches.forEach(b => {
                row.stocks[b.id] = 0;
            });

            // Set specific stocks
            // Also handle "Deposito" special case if we decide to use current_stock from products
            // For now, let's prefer stock_sucursal if exists, else 0.
            // BUT wait, "Deposito" might be in stock_sucursal OR just in products.current_stock.
            // My migration script inserted Deposito into stock_sucursal optionally. 
            // If I didn't run that optional part, Deposito stock is only in products.current_stock.
            // Let's assume we want to show 'Deposito' branch column.

            const depositoBranch = branches.find(b => b.name === 'Deposito');
            if (depositoBranch) {
                // If we have an entry in stock_sucursal, use it. If not, use product.current_stock?
                // Best is to assume migration ran OR just show product.current_stock as Deposito
                // logic:
                // row.stocks[depositoBranch.id] = p.current_stock; 
                // But let's check stocks array first.
            }

            // Fill from stocks array
            stocks.filter(s => s.product_code === p.code).forEach(s => {
                row.stocks[s.sucursal_id] = s.quantity;
            });

            // Fallback for Deposito if 0 and current_stock > 0? (Optional)
            if (depositoBranch && row.stocks[depositoBranch.id] === 0 && p.current_stock > 0) {
                // Optimization: If the stock_sucursal entry didn't exist, we might want to default to current_stock
                // But strictly speaking, stock_sucursal is the source of truth for branches.
                // Let's stick to what's in stock_sucursal. 
                // Actually, user plan said "Products.current_stock will be treated as Global/Deposito". 
                // So we SHOULD populate Deposito column with p.current_stock if using that paradigm.
                // Let's override Deposito stock with p.current_stock for now to ensure visibility of legacy stock.
                row.stocks[depositoBranch.id] = p.current_stock;
            }

            return row;
        });

        res.json({
            data: matrix,
            total: count,
            branches
        });

    } catch (error) {
        console.error('Error fetching stock matrix:', error);
        res.status(500).json({ message: 'Error fetching stock matrix' });
    }
});

// Logout
app.post('/api/auth/logout', verifyToken, async (req, res) => {
    try {
        // Clear session ID in DB
        const { error } = await supabase
            .from('users')
            .update({ is_session_active: false })
            .eq('id', req.user.id);

        if (error) throw error;

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error logging out:', error);
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

// Heartbeat to keep session alive
app.post('/api/auth/heartbeat', verifyToken, async (req, res) => {
    try {
        await supabase
            .from('users')
            .update({ last_seen: new Date().toISOString(), is_session_active: true })
            .eq('id', req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ message: 'Internal server error' });
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

// Helper to fetch ALL scans for a specific order (Batching)
async function getAllScans(orderNumber) {
    let allScans = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('inventory_scans')
            .select('user_id, code, quantity, timestamp') // Include potential fields
            .eq('order_number', orderNumber)
            .range(from, from + step - 1);

        if (error) {
            console.error('Error in getAllScans:', error);
            throw error;
        }

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

// Helper for batch fetching scans for multiple orders
async function getAllScansBatch(orderNumbers) {
    let allScans = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    // Supabase .in() limit is around 65k parameters, but URL length might be an issue.
    // Assuming orderNumbers list is reasonable (<100).

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

// The catch-all handler must be at the end, after all other routes
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
