const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const { verifyToken, verifyAdmin, hasPermission } = require('../middleware/auth');
const seguimientoPedidosController = require('../controllers/seguimientoPedidosController');

// Rutas para seguimiento_pedidos
router.get('/', verifyToken, seguimientoPedidosController.getAllPedidos);
router.post('/', verifyToken, hasPermission('manage_seguimiento_pedidos'), seguimientoPedidosController.createPedido);
router.put('/:id', verifyToken, hasPermission('manage_seguimiento_pedidos'), seguimientoPedidosController.updatePedido);
router.delete('/:id', verifyToken, verifyAdmin, seguimientoPedidosController.deletePedido);

// Importar planilla desde PDF
router.post('/import-pdf', verifyToken, hasPermission('manage_seguimiento_pedidos'), upload.single('file'), seguimientoPedidosController.importPedidosPdf);

// Exportar planilla a Excel
router.get('/export', verifyToken, seguimientoPedidosController.exportPedidosExcel);

module.exports = router;
