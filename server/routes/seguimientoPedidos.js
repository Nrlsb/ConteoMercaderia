const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const { verifyToken, verifyAdmin, hasStrictPermission } = require('../middleware/auth');
const seguimientoPedidosController = require('../controllers/seguimientoPedidosController');

// Rutas estáticas de seguimiento_pedidos (deben ir antes de las parametrizadas)
router.get('/', verifyToken, seguimientoPedidosController.getAllPedidos);
router.post('/', verifyToken, hasStrictPermission('manage_seguimiento_pedidos'), seguimientoPedidosController.createPedido);

// Importar planilla desde PDF
router.post('/import-pdf', verifyToken, hasStrictPermission('manage_seguimiento_pedidos'), upload.single('file'), seguimientoPedidosController.importPedidosPdf);

// Exportar planilla a Excel
router.get('/export', verifyToken, seguimientoPedidosController.exportPedidosExcel);

// Configuración de notificaciones
router.get('/notification-settings', verifyToken, seguimientoPedidosController.getNotificationSettings);
router.put('/notification-settings', verifyToken, verifyAdmin, seguimientoPedidosController.updateNotificationSettings);

// Carga de imágenes (Gerencia)
router.post('/:id/upload-imagenes', verifyToken, upload.array('imagenes', 5), seguimientoPedidosController.uploadImagenes);

// Rutas parametrizadas (comodines)
router.put('/:id/confirmar-recepcion', verifyToken, seguimientoPedidosController.confirmarRecepcionDestinatario);
router.put('/:id', verifyToken, hasStrictPermission('manage_seguimiento_pedidos'), seguimientoPedidosController.updatePedido);
router.delete('/:id', verifyToken, verifyAdmin, hasStrictPermission('manage_seguimiento_pedidos'), seguimientoPedidosController.deletePedido);

module.exports = router;
