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
        
        let headerRowIndex = -1;
        let codeColIndex = -1;
        let descColIndex = -1;
        let stockColIndex = -1;
        let idColIndex = -1;
        let foundSheetData = null;

        // 1. Iterar por todas las hojas buscando la estructura de inventario
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
                const row = rows[i];
                if (!row || !Array.isArray(row)) continue;

                const findInRow = (keywords) => row.findIndex(cell => 
                    cell && keywords.some(k => String(cell).toLowerCase().includes(k.toLowerCase()))
                );

                codeColIndex = findInRow(['codigo', 'código', 'producto', 'art', 'referencia']);
                descColIndex = findInRow(['descripcion', 'descripción', 'nombre', 'detalle']);
                stockColIndex = findInRow(['stock', 'cantidad', 'actual', 'saldo']);
                idColIndex = findInRow(['id']);

                if (codeColIndex !== -1 && descColIndex !== -1) {
                    headerRowIndex = i;
                    foundSheetData = rows;
                    console.log(`Estructura encontrada en hoja "${sheetName}", fila ${i + 1}`);
                    break;
                }
            }
            if (foundSheetData) break;
        }

        if (!foundSheetData) {
            return res.status(400).json({ message: 'No se pudo detectar la estructura de inventario en ninguna hoja del Excel.' });
        }

        // 2. Crear el registro del conteo
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

        // 3. Procesar datos
        const items = [];
        for (let i = headerRowIndex + 1; i < foundSheetData.length; i++) {
            const row = foundSheetData[i];
            if (!row || row.length === 0) continue;

            const code = row[codeColIndex] ? String(row[codeColIndex]).trim() : null;
            if (!code) continue;

            items.push({
                dye_count_id: dyeCount.id,
                product_code: code,
                description: row[descColIndex] ? String(row[descColIndex]).trim() : 'Sin descripción',
                theoretical_stock: parseFloat(String(row[stockColIndex] || 0).replace(',', '.')) || 0,
                excel_id: idColIndex !== -1 && row[idColIndex] ? String(row[idColIndex]).trim() : null
            });
        }
        
        if (items.length > 0) {
            const { error: itemsError } = await supabase.from('dye_count_items').insert(items);
            if (itemsError) throw itemsError;
        }

        res.json({ 
            message: `Excel importado con éxito. Se cargaron ${items.length} productos.`, 
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
