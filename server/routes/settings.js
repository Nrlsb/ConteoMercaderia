const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyToken, verifySuperAdmin, hasPermission } = require('../middleware/auth');

// App Version Routes
router.get('/app-version', settingsController.getAppVersion);
router.put('/app-version', verifyToken, verifySuperAdmin, settingsController.updateAppVersion);

// Global Settings Routes
router.get('/settings', settingsController.getSettings);
router.put('/settings', verifyToken, hasPermission('manage_settings'), settingsController.updateSettings);

module.exports = router;
