const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// Rutas de notificaciones
router.get('/', verifyToken, notificationController.getNotifications);
router.put('/mark-all-read', verifyToken, notificationController.markAllAsRead);
router.put('/:id/read', verifyToken, notificationController.markAsRead);

module.exports = router;
