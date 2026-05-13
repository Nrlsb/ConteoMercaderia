const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { verifyToken } = require('../middleware/auth');

// Get recent measurements
router.get('/', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_measurements')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching measurements:', error);
        res.status(500).json({ message: 'Error al obtener pesajes' });
    }
});

// Save a new measurement
router.post('/', verifyToken, async (req, res) => {
    const { productCode, productDescription, weight, unit, metadata } = req.body;

    if (!productCode || weight === undefined) {
        return res.status(400).json({ message: 'Faltan datos requeridos (código o peso)' });
    }

    try {
        const { data, error } = await supabase
            .from('product_measurements')
            .insert([{
                product_code: productCode,
                product_description: productDescription,
                weight: parseFloat(weight),
                unit: unit || 'kg',
                user_id: req.user.id,
                timestamp: new Date().toISOString(),
                metadata: metadata || {}
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error saving measurement:', error);
        res.status(500).json({ 
            message: 'Error al guardar el pesaje', 
            details: error.message,
            error: error 
        });
    }
});

// Delete a measurement
router.delete('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('product_measurements')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Pesaje eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting measurement:', error);
        res.status(500).json({ message: 'Error al eliminar el pesaje' });
    }
});

module.exports = router;
