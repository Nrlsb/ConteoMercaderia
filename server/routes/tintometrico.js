const express = require('express');
const router = express.Router();
const tintometricoController = require('../controllers/tintometricoController');
const { verifyToken } = require('../middleware/auth');

// Todas las rutas de tintométrico requieren autenticación
router.use(verifyToken);

// Rutas del servicio
router.get('/permissions', tintometricoController.getMyPermissions);
router.get('/colecciones', tintometricoController.getColecciones);
router.get('/colores', tintometricoController.getColores);
router.get('/dosificacion/:colorId', tintometricoController.getColorDosificacion);
router.post('/equivalentes', tintometricoController.getColorEquivalentes);

module.exports = router;
