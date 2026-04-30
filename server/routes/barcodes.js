const express = require('express');
const router = express.Router();
const barcodeController = require('../controllers/barcodeController');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

router.get('/', verifyToken, barcodeController.getBarcodeHistory);
router.get('/missing', verifyToken, barcodeController.getMissingLayoutProducts);
router.get('/export', verifyToken, barcodeController.exportBarcodeHistoryCsv);
router.get('/layout-excel', verifyToken, barcodeController.exportLayoutExcel);
router.post('/', verifyToken, barcodeController.addBarcodeHistory);
router.post('/bulk', verifyToken, barcodeController.addBulkBarcodeHistory);
router.post('/bulk-transfer-filtered', verifyToken, barcodeController.bulkTransferFiltered);
router.delete('/bulk', verifyToken, verifyAdmin, barcodeController.deleteBulkBarcodeHistory);

module.exports = router;
