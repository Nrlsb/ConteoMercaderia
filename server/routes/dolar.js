const express = require('express');
const router = express.Router();
const dolarService = require('../services/dolarService');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

/**
 * GET /api/dolar/cotizacion
 * Retorna la cotización del dólar actual en la base de datos
 */
router.get('/cotizacion', async (req, res) => {
    try {
        const cotizaciones = await dolarService.getCotizaciones();
        res.json({
            status: 'ok',
            ...cotizaciones
        });
    } catch (error) {
        console.error('[DOLAR ROUTE ERROR] Error al obtener cotización:', error);
        res.status(500).json({ message: 'Error al obtener la cotización del dólar' });
    }
});

/**
 * POST /api/dolar/actualizar
 * Fuerza el scraping de BNA y la actualización de la base de datos
 * Solo accesible para administradores
 */
router.post('/actualizar', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const cotizaciones = await dolarService.actualizarCotizacionesBD();
        res.json({
            status: 'ok',
            message: 'Cotizaciones actualizadas con éxito desde el BNA',
            data: cotizaciones
        });
    } catch (error) {
        console.error('[DOLAR ROUTE ERROR] Error al forzar actualización:', error);
        res.status(500).json({ 
            message: 'Error al actualizar cotizaciones desde el BNA', 
            details: error.message 
        });
    }
});

module.exports = router;
