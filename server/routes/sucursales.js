const express = require('express');
const router = express.Router();
const sucursalController = require('../controllers/sucursalController');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

router.get('/', verifyToken, sucursalController.getAllSucursales);
router.post('/', verifyToken, verifyAdmin, sucursalController.createSucursal);
router.put('/:id', verifyToken, verifyAdmin, sucursalController.updateSucursal);
router.delete('/:id', verifyToken, verifyAdmin, sucursalController.deleteSucursal);

module.exports = router;
