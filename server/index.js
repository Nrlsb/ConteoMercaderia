const compression = require('compression');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3000;

// Configure Helmet for secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Configure CORS
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://conteo-mercaderia.vercel.app',
    'https://conteomercaderia-wu8o.onrender.com',
    'https://conteo-mercaderia-khtxajjex-luksbs-projects.vercel.app',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permitir peticiones sin origen (como apps móviles o curl)
        if (!origin) return callback(null, true);

        const isAllowed = allowedOrigins.indexOf(origin) !== -1 ||
            (origin.endsWith('.vercel.app') && origin.includes('conteo-mercaderia'));

        if (!isAllowed) {
            console.error('BLOQUEADO POR CORS:', origin);
            // En lugar de devolver error, devolvemos null para que el navegador maneje el bloqueo
            return callback(null, false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'x-auth-token', 
        'Accept', 
        'X-Requested-With', 
        'Origin',
        'Cache-Control',
        'Pragma'
    ],
    optionsSuccessStatus: 200
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
const measurementsRoutes = require('./routes/measurements');
const branchDyeTypesRoutes = require('./routes/branchDyeTypes');
const seguimientoPedidosRoutes = require('./routes/seguimientoPedidos');
const notificationsRoutes = require('./routes/notifications');
const tintometricoRoutes = require('./routes/tintometrico');
const colorRegistrationsRoutes = require('./routes/colorRegistrations');
const valorizacionRoutes = require('./routes/valorizacion');
const dolarRoutes = require('./routes/dolar');


// --- Import Services ---
const { startLabelHistoryCleanupTask, startProviderContactNotificationTask, startProtheusSyncTask, startDolarScrapingTask, startPaymentExpirationMonitorTask, startStockSnapshotTask } = require('./services/cronJobs');
const dolarService = require('./services/dolarService');

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
app.use('/api/egresos', egresosRoutes);
app.use('/api/branch-transfers', transfersRoutes);
app.use('/api', settingsRoutes);
app.use('/api', stockRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/barcode-history', barcodesRoutes);
app.use('/api/labels', labelsRoutes);
app.use('/api', inventoryRoutes);
app.use('/api/measurements', measurementsRoutes);
app.use('/api/branch-dye-types', branchDyeTypesRoutes);
app.use('/api/seguimiento-pedidos', seguimientoPedidosRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/tintometrico', tintometricoRoutes);
app.use('/api/color-registrations', colorRegistrationsRoutes);
app.use('/api/valorizacion', valorizacionRoutes);
app.use('/api/dolar', dolarRoutes);


// --- Catch-All: Serve React App ---
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    // Asegurar que las cabeceras CORS estén presentes incluso en errores
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || (origin.endsWith('.vercel.app') && origin.includes('conteo-mercaderia')))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (err.name === 'MulterError') {
        return res.status(400).json({ message: `Error al subir archivo: ${err.message}` });
    }
    console.error('[GLOBAL ERROR HANDLER]', err);

    const isDev = process.env.NODE_ENV === 'development';
    const userMessage = isDev
        ? (err.message || 'Error interno del servidor')
        : 'Ocurrió un error inesperado en el servidor';

    res.status(500).json({
        message: userMessage,
        stack: isDev ? err.stack : undefined
    });
});

// --- Start Scheduled Tasks ---
startLabelHistoryCleanupTask();
startProviderContactNotificationTask();
startProtheusSyncTask();
startDolarScrapingTask();
startPaymentExpirationMonitorTask();
startStockSnapshotTask();

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    
    // Intento inicial de scraping de dólares al arrancar el servidor (no bloqueante)
    dolarService.actualizarCotizacionesBD().catch(err => {
        console.warn('[WARNING] No se pudo obtener la cotización inicial del BNA al arrancar:', err.message);
    });
});
