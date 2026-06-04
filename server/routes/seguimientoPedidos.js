const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const { verifyToken, verifyAdmin } = require('../middleware/auth');
const seguimientoPedidosController = require('../controllers/seguimientoPedidosController');

// Rutas para seguimiento_pedidos
router.get('/', verifyToken, seguimientoPedidosController.getAllPedidos);
router.post('/', verifyToken, seguimientoPedidosController.createPedido);
router.put('/:id', verifyToken, seguimientoPedidosController.updatePedido);
router.delete('/:id', verifyToken, verifyAdmin, seguimientoPedidosController.deletePedido);

// Importar planilla desde PDF
router.post('/import-pdf', verifyToken, upload.single('file'), seguimientoPedidosController.importPedidosPdf);

// Exportar planilla a Excel
router.get('/export', verifyToken, seguimientoPedidosController.exportPedidosExcel);

module.exports = router;
