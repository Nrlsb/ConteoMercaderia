const express = require('express');
const router = express.Router();
const labelController = require('../controllers/labelController');
const { verifyToken } = require('../middleware/auth');

router.get('/history', verifyToken, labelController.getLabelHistory);
router.post('/history', verifyToken, labelController.addLabelHistory);

module.exports = router;
