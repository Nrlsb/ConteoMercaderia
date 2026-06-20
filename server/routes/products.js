const express = require('express');
const router = express.Router();
const multer = require('multer');
const productController = require('../controllers/productController');
const { verifyToken, hasPermission } = require('../middleware/auth');

// Search & Sync
router.get('/search', verifyToken, productController.searchProducts);
router.get('/sync', verifyToken, productController.syncProducts);
router.post('/sync-from-protheus', verifyToken, productController.syncProductsFromProtheus);
router.get('/sync-from-protheus/status', verifyToken, productController.getProtheusSyncStatus);
router.get('/colorants-by-category', verifyToken, productController.getColorantsByCategory);
router.get('/export-protheus/csv', verifyToken, productController.exportAllProductsProtheusCsv);


// Get by exact barcode (must be before /:barcode to avoid conflict)
router.get('/barcode/:barcode', verifyToken, productController.getByBarcode);

// Import products from Excel (Admin)
router.post('/import', verifyToken, hasPermission('import_data'), multer({ storage: multer.memoryStorage() }).single('file'), productController.importProducts);

// Create a new product
router.post('/', verifyToken, hasPermission('create_products'), productController.createProduct);

// Update product details
router.put('/:id', verifyToken, hasPermission('edit_products'), productController.updateProduct);

// Update product barcode by code
router.put('/:code/barcode', verifyToken, productController.updateBarcode);

// Update product secondary barcode by code
router.put('/:code/barcode-secondary', verifyToken, productController.updateBarcodeSecondary);

// Get product by barcode/code with unified search (catch-all for products)
router.get('/:barcode', verifyToken, productController.getProductByCode);

module.exports = router;
