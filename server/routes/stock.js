const express = require('express');
const router = express.Router();
const multer = require('multer');
const stockController = require('../controllers/stockController');
const productController = require('../controllers/productController');
const { verifyToken, hasPermission } = require('../middleware/auth');

// Stock specific routes (mounted under /api/stock and /api/products)
// We will mount this router at /api

// Matrix Layout
router.get('/stock/matrix', verifyToken, stockController.getStockMatrix);

// Stock Import (Admin)
router.post('/stock/import', verifyToken, hasPermission('import_data'), multer({ storage: multer.memoryStorage() }).single('file'), productController.importStock);

// Individual Product Stock
router.get('/products/:code/stock', verifyToken, stockController.getProductStock);
router.put('/products/:code/stock', verifyToken, stockController.updateProductStock);

// Stock Snapshot & Comparison Routes
router.get('/stock/snapshots/comparisons', verifyToken, hasPermission('tab_registro_stock'), stockController.getStockSnapshotComparisons);
router.get('/stock/snapshots/comparisons/latest', verifyToken, hasPermission('tab_registro_stock'), stockController.getLatestStockSnapshotComparison);
router.get('/stock/snapshots/runs', verifyToken, hasPermission('tab_registro_stock'), stockController.getStockSnapshotRuns);
router.post('/stock/snapshots/trigger', verifyToken, hasPermission('tab_registro_stock'), stockController.triggerStockSnapshot);

module.exports = router;
