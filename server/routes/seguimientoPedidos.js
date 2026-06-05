const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const { verifyToken, verifyAdmin, hasStrictPermission } = require('../middleware/auth');
const seguimientoPedidosController = require('../controllers/seguimientoPedidosController');

// Rutas para seguimiento_pedidos
router.get('/', verifyToken, seguimientoPedidosController.getAllPedidos);
router.post('/', verifyToken, hasStrictPermission('manage_seguimiento_pedidos'), seguimientoPedidosController.createPedido);
router.put('/:id', verifyToken, hasStrictPermission('manage_seguimiento_pedidos'), seguimientoPedidosController.updatePedido);
router.delete('/:id', verifyToken, verifyAdmin, hasStrictPermission('manage_seguimiento_pedidos'), seguimientoPedidosController.deletePedido);

// Importar planilla desde PDF
router.post('/import-pdf', verifyToken, hasStrictPermission('manage_seguimiento_pedidos'), upload.single('file'), seguimientoPedidosController.importPedidosPdf);

// Exportar planilla a Excel
router.get('/export', verifyToken, seguimientoPedidosController.exportPedidosExcel);

module.exports = router;
