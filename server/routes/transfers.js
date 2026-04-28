const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const { verifyToken } = require('../middleware/auth');

router.get('/pending', verifyToken, transferController.getPendingTransfers);
router.post('/:id/receive', verifyToken, transferController.receiveTransfer);
router.get('/receipts', verifyToken, transferController.getTransferReceipts);

module.exports = router;
