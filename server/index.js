const compression = require('compression');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

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

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// Serve APK files for App Updater
app.use('/apk', express.static(path.join(__dirname, 'public/apk')));

// --- Import Route Modules ---
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const sucursalesRoutes = require('./routes/sucursales');
const barcodesRoutes = require('./routes/barcodes');
const labelsRoutes = require('./routes/labels');
const aiRoutes = require('./routes/ai');
const receiptsRoutes = require('./routes/receipts');
const egresosRoutes = require('./routes/egresos');
const transfersRoutes = require('./routes/transfers');
const settingsRoutes = require('./routes/settings');
const stockRoutes = require('./routes/stock');
const productsRoutes = require('./routes/products');
const inventoryRoutes = require('./routes/inventory');

// --- Import Services ---
const { startLabelHistoryCleanupTask } = require('./services/cronJobs');

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.send('Control de Remitos API Running');
});

// --- Bug Report (standalone, no module needed) ---
const supabase = require('./services/supabaseClient');
const { verifyToken } = require('./middleware/auth');

app.post('/api/reports', verifyToken, async (req, res) => {
    const { description, errorData, pageUrl, userAgent, appVersion } = req.body;

    try {
        const { data, error } = await supabase
            .from('bug_reports')
            .insert([{
                user_id: req.user.id,
                username: req.user.username,
                description,
                error_data: errorData || {},
                page_url: pageUrl,
                user_agent: userAgent,
                app_version: appVersion,
                sucursal_id: req.user.sucursal_id,
                status: 'open',
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        
        console.log(`[BUG REPORT] Nuevo reporte de ${req.user.username}: ${description?.substring(0, 50)}...`);
        
        res.status(201).json({ message: 'Reporte enviado con éxito', data });
    } catch (error) {
        console.error('Error saving bug report:', error);
        res.status(500).json({ message: 'Error al enviar el reporte' });
    }
});

// --- Mount All Route Modules ---
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sucursales', sucursalesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/receipts', receiptsRoutes);
app.use('/api/receipt-items-history', receiptsRoutes);
app.use('/api/receipt-history', receiptsRoutes);
app.use('/api/egresos', egresosRoutes);
app.use('/api/egreso-history', egresosRoutes);
app.use('/api/branch-transfers', transfersRoutes);
app.use('/api', settingsRoutes);
app.use('/api', stockRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/barcode-history', barcodesRoutes);
app.use('/api/labels', labelsRoutes);
app.use('/api', inventoryRoutes);

// --- Catch-All: Serve React App ---
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    if (err.name === 'MulterError') {
        return res.status(400).json({ message: `Error al subir archivo: ${err.message}` });
    }
    console.error('[GLOBAL ERROR HANDLER]', err);
    res.status(500).json({
        message: err.message || 'Error interno del servidor',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// --- Start Scheduled Tasks ---
startLabelHistoryCleanupTask();

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
