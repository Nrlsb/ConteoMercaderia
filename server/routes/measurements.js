const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const xlsx = require('xlsx');

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
        res.status(500).json({ message: 'Error al obtener registros' });
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
                timestamp: new Date().toISOString(),
                metadata: metadata || {}
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error saving measurement:', error);
        res.status(500).json({ message: 'Error al guardar el registro' });
    }
});

// --- Lógica Separada de Conteos de Colorantes ---

// Importar Excel de Colorantes y crear un nuevo conteo
router.post('/import-dye-excel', verifyToken, multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No se subió ningún archivo' });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]]; // Primera hoja
        const rawData = xlsx.utils.sheet_to_json(sheet);

        // 1. Crear el registro del conteo
        const fileName = req.file.originalname.replace('.xlsx', '').replace('.xls', '');
        const { data: dyeCount, error: countError } = await supabase
            .from('dye_counting_lists')
            .insert([{
                name: `Conteo ${fileName} - ${new Date().toLocaleDateString()}`,
                sucursal_id: req.user.sucursal_id,
                created_by: req.user.username,
                status: 'open'
            }])
            .select()
            .single();

        if (countError) throw countError;

        // 2. Procesar ítems del Excel
        const items = [];
        for (const row of rawData) {
            const findKey = (partial) => Object.keys(row).find(k => k.trim().toLowerCase().includes(partial.toLowerCase()));
            
            const idKey = findKey('Id');
            const codeKey = findKey('Codigo') || findKey('Código') || findKey('Producto');
            const descKey = findKey('descripcion') || findKey('Descripción');
            const stockKey = findKey('stock actual') || findKey('Stock');

            const code = row[codeKey] ? String(row[codeKey]).trim() : null;
            if (!code) continue;

            items.push({
                dye_count_id: dyeCount.id,
                product_code: code,
                description: row[descKey] ? String(row[descKey]).trim() : 'Sin descripción',
                theoretical_stock: parseFloat(row[stockKey]) || 0,
                excel_id: row[idKey] ? String(row[idKey]).trim() : null
            });
        }

        // Insertar ítems en lotes
        if (items.length > 0) {
            const { error: itemsError } = await supabase.from('dye_count_items').insert(items);
            if (itemsError) throw itemsError;
        }

        res.json({ 
            message: 'Excel de colorantes importado con éxito', 
            countId: dyeCount.id,
            totalItems: items.length 
        });
    } catch (error) {
        console.error('Error detallado importing dye excel:', error);
        res.status(500).json({ 
            message: 'Error al procesar el Excel de colorantes', 
            error: error.message,
            details: error.details || (error.code ? `Código de error: ${error.code}` : null)
        });
    }
});

// Obtener conteos de colorantes activos
router.get('/dye-counts/active', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('dye_counting_lists')
            .select('*')
            .eq('status', 'open')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching dye counts:', error);
        res.status(500).json({ message: 'Error al obtener conteos de colorantes' });
    }
});

// Obtener productos de un conteo de colorantes específico
router.get('/dye-counts/:id/products', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('dye_count_items')
            .select('*')
            .eq('dye_count_id', id);

        if (error) throw error;

        // Mapear al formato que espera la tabla (compatible con productos normales)
        const formatted = data.map(item => ({
            code: item.product_code,
            description: item.description,
            current_stock: item.theoretical_stock,
            excel_id: item.excel_id
        }));

        res.json({ products: formatted });
    } catch (error) {
        console.error('Error fetching dye count items:', error);
        res.status(500).json({ message: 'Error al obtener ítems del conteo' });
    }
});

// Finalizar un conteo de colorantes
router.post('/dye-counts/:id/close', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('dye_counting_lists')
            .update({ status: 'closed', closed_at: new Date() })
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Conteo de colorantes finalizado' });
    } catch (error) {
        console.error('Error closing dye count:', error);
        res.status(500).json({ message: 'Error al finalizar el conteo' });
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
        res.json({ message: 'Registro eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting measurement:', error);
        res.status(500).json({ message: 'Error al eliminar el registro' });
    }
});

module.exports = router;
