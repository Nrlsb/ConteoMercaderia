const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const xlsx = require('xlsx');

// Get recent measurements
router.get('/', verifyToken, async (req, res) => {
    try {
        let query = supabase
            .from('product_measurements')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(50);

        if (req.user.role !== 'superadmin') {
            query = query.eq('created_by', req.user.username);
        }

        const { data, error } = await query;

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
                metadata: metadata || {},
                created_by: req.user.username
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

// Obtener todos los conteos de colorantes (no eliminados)
router.get('/dye-counts', verifyToken, async (req, res) => {
    try {
        let query = supabase
            .from('dye_counting_lists')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (req.user.role !== 'superadmin') {
            query = query.eq('created_by', req.user.username);
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching dye counts:', error);
        res.status(500).json({ message: 'Error al obtener conteos de colorantes' });
    }
});

// Obtener conteos de colorantes activos
router.get('/dye-counts/active', verifyToken, async (req, res) => {
    try {
        let query = supabase
            .from('dye_counting_lists')
            .select('*')
            .eq('status', 'open')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (req.user.role !== 'superadmin') {
            query = query.eq('created_by', req.user.username);
        }

        const { data, error } = await query;

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
        // Verificar que el conteo le pertenezca al usuario (o sea superadmin)
        let countQuery = supabase
            .from('dye_counting_lists')
            .select('id')
            .eq('id', id);
        
        if (req.user.role !== 'superadmin') {
            countQuery = countQuery.eq('created_by', req.user.username);
        }

        const { data: countData, error: countError } = await countQuery.maybeSingle();
        
        if (countError) throw countError;
        if (!countData) return res.status(403).json({ message: 'No tiene permiso para ver este conteo o no existe' });

        const { data: items, error: itemsError } = await supabase
            .from('dye_count_items')
            .select('*')
            .eq('dye_count_id', id);

        if (itemsError) throw itemsError;

        // Buscar los factores de conversión en la tabla de productos
        const productCodes = items.map(i => i.product_code);
        const { data: products, error: prodError } = await supabase
            .from('products')
            .select('code, conversion_factor')
            .in('code', productCodes);

        const factorMap = {};
        if (products) {
            products.forEach(p => {
                factorMap[p.code] = p.conversion_factor;
            });
        }

        // Mapear al formato que espera la tabla (incluyendo el factor de la tabla products)
        const formatted = items.map(item => ({
            code: item.product_code,
            description: item.description,
            current_stock: item.theoretical_stock,
            excel_id: item.excel_id,
            conversion_factor: factorMap[item.product_code] || null
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
        let query = supabase
            .from('dye_counting_lists')
            .update({ status: 'closed', closed_at: new Date() })
            .eq('id', id);

        if (req.user.role !== 'superadmin') {
            query = query.eq('created_by', req.user.username);
        }

        const { error } = await query;

        if (error) throw error;
        res.json({ message: 'Conteo de colorantes finalizado' });
    } catch (error) {
        console.error('Error closing dye count:', error);
        res.status(500).json({ message: 'Error al finalizar el conteo' });
    }
});

// Eliminar (soft delete) un conteo de colorantes
router.delete('/dye-counts/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        let query = supabase
            .from('dye_counting_lists')
            .update({ deleted_at: new Date() })
            .eq('id', id);

        if (req.user.role !== 'superadmin') {
            query = query.eq('created_by', req.user.username);
        }

        const { error } = await query;

        if (error) throw error;
        res.json({ message: 'Conteo eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting dye count:', error);
        res.status(500).json({ message: 'Error al eliminar el conteo' });
    }
});

// Exportar resultados de un conteo de colorantes a Excel
router.get('/dye-counts/:id/export', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Obtener información del conteo
        const { data: dyeCount, error: countError } = await supabase
            .from('dye_counting_lists')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (countError || !dyeCount) {
            return res.status(404).json({ message: 'Conteo no encontrado' });
        }

        // 2. Obtener todos los productos definidos en este conteo
        const { data: items, error: itemsError } = await supabase
            .from('dye_count_items')
            .select('*')
            .eq('dye_count_id', id);

        if (itemsError) throw itemsError;

        // 3. Obtener todas las mediciones vinculadas a este conteo
        // Usamos .contains para filtrar dentro de la columna JSONB 'metadata'
        const { data: measurements, error: measError } = await supabase
            .from('product_measurements')
            .select('*')
            .contains('metadata', { conteoId: id });

        if (measError) throw measError;

        // 4. Agrupar mediciones por código de producto
        const aggregation = {};
        if (measurements) {
            measurements.forEach(m => {
                const code = m.product_code;
                if (!aggregation[code]) {
                    aggregation[code] = { un1: 0, un2: 0 };
                }
                const meta = m.metadata || {};
                aggregation[code].un1 += (parseFloat(meta.un1) || 0);
                aggregation[code].un2 += (parseFloat(meta.un2) || 0);
            });
        }

        // 5. Preparar datos para el Excel
        const exportData = items.map(item => {
            const agg = aggregation[item.product_code] || { un1: 0, un2: 0 };
            return {
                'Codigo': item.product_code,
                'Descripcion': item.description,
                'UN1': agg.un1,
                'UN2': agg.un2
            };
        });

        // 6. Generar el archivo Excel
        const workbook = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(exportData);
        xlsx.utils.book_append_sheet(workbook, ws, "Conteo");

        const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `Conteo_${dyeCount.name.replace(/[/\\?%*:|"<>]/g, '-')}.xlsx`;

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error('Error al exportar conteo de colorantes:', error);
        res.status(500).json({ 
            message: 'Error al generar el Excel', 
            error: error.message,
            details: error.details || error
        });
    }
});

// Delete a measurement
router.delete('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;

    try {
        let query = supabase
            .from('product_measurements')
            .delete()
            .eq('id', id);

        if (req.user.role !== 'superadmin') {
            query = query.eq('created_by', req.user.username);
        }

        const { error } = await query;

        if (error) throw error;
        res.json({ message: 'Registro eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting measurement:', error);
        res.status(500).json({ message: 'Error al eliminar el registro' });
    }
});

module.exports = router;
