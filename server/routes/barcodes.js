const express = require('express');
const router = express.Router();
const barcodeController = require('../controllers/barcodeController');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.get('/', verifyToken, barcodeController.getBarcodeHistory);
router.get('/missing', verifyToken, barcodeController.getMissingLayoutProducts);
router.get('/export', verifyToken, barcodeController.exportBarcodeHistoryCsv);
router.get('/layout-excel', verifyToken, barcodeController.exportLayoutExcel);
router.post('/', verifyToken, barcodeController.addBarcodeHistory);
router.post('/bulk', verifyToken, barcodeController.addBulkBarcodeHistory);
router.post('/bulk-transfer-filtered', verifyToken, barcodeController.bulkTransferFiltered);
router.delete('/bulk', verifyToken, verifyAdmin, barcodeController.deleteBulkBarcodeHistory);

// Import missing products from Excel to DB
router.post('/missing/sync', upload.single('file'), barcodeController.syncMissingProducts);

module.exports = router;
