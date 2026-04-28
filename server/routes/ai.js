const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/parse-remito', verifyToken, aiController.parseRemito);
router.post('/parse-image', verifyToken, upload.single('image'), aiController.parseImage);

module.exports = router;
