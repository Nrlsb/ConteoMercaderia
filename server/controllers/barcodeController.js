const supabase = require('../services/supabaseClient');
const xlsx = require('xlsx');
const path = require('path');
const { getAllBarcodeHistory } = require('../utils/dbHelpers');

exports.getBarcodeHistory = async (req, res) => {
    const { startDate, endDate, user_id, action_type, productCode, page = 1, limit = 50, unique } = req.query;
    try {
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const from = (pageNum - 1) * limitNum;
        const to = from + limitNum - 1;

        const baseQuery = supabase
            .from('barcode_history')
            .select(`
                id,
                action_type,
                product_id,
                product_description,
                details,
                created_by,
                created_at,
                users:created_by (username),
                products:product_id (barcode)
            `, { count: 'exact' });

        let query = baseQuery;

        // Apply filters
        if (user_id) {
            const userIds = user_id.split(',').filter(id => id.trim() !== '');
            if (userIds.length > 0) {
                query = query.in('created_by', userIds);
            }
        }
        if (action_type) {
            const types = action_type.split(',').filter(t => t.trim() !== '');
            if (types.length > 1) {
                query = query.in('action_type', types);
            } else if (types.length === 1) {
                query = query.eq('action_type', types[0]);
            }
        }
        
        if (productCode) {
            const pCode = productCode.trim();
            
            // Step 1: Find products that match by code or barcode
            const { data: matchedProducts } = await supabase
                .from('products')
                .select('id')
                .or(`code.ilike.%${pCode}%,barcode.ilike.%${pCode}%`);
            
            const productIds = matchedProducts?.map(p => p.id) || [];
            
            // Step 2: Build the OR filter for the history table
            // We search by description OR by any of the matched product IDs
            let orFilter = `product_description.ilike.%${pCode}%`;
            if (productIds.length > 0) {
                // Construct: product_description.ilike.%...%,product_id.in.(uuid1,uuid2,...)
                orFilter += `,product_id.in.(${productIds.join(',')})`;
            }
            
            query = query.or(orFilter);
        }

        // Apply date filters if available
        if (startDate) {
            const startStr = `${startDate}T00:00:00.000Z`;
            query = query.gte('created_at', startStr);
        }
        if (endDate) {
            const endStr = `${endDate}T23:59:59.999Z`;
            query = query.lte('created_at', endStr);
        }

        let finalData, finalCount, finalTotalPages;

        if (unique === 'true') {
            // Fetch a larger set to ensure we have enough unique items for the current filters
            const { data: allItems, error: allErr } = await query.order('created_at', { ascending: false }).range(0, 1999);
            if (allErr) throw allErr;

            const uniqueMap = new Map();
            allItems.forEach(item => {
                const key = item.product_description || item.product_id;
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, item);
                }
            });

            const uniqueList = Array.from(uniqueMap.values());
            finalCount = uniqueList.length;
            finalTotalPages = Math.ceil(finalCount / limitNum);
            finalData = uniqueList.slice(from, to + 1);
        } else {
            const { data: history, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
            if (error) throw error;

            finalData = history;
            finalCount = count;
            finalTotalPages = Math.ceil((count || 0) / limitNum);
        }

        // Logic for including surrounding context (3 items before and 3 items after)
        if (req.query.includeContext === 'true' && productCode && finalData.length > 0) {
            const dataWithContext = [];
            const seenIds = new Set();
            const matchesIds = new Set(finalData.map(item => item.id));

            const selectFields = `
                id,
                action_type,
                product_id,
                product_description,
                details,
                created_by,
                created_at,
                users:created_by (username),
                products:product_id (barcode)
            `;

            for (const item of finalData) {
                // Fetch 3 items scanned AFTER (greater created_at)
                let afterQuery = supabase
                    .from('barcode_history')
                    .select(selectFields)
                    .gt('created_at', item.created_at)
                    .order('created_at', { ascending: true })
                    .limit(3);
                
                // Fetch 3 items scanned BEFORE (lesser created_at)
                let beforeQuery = supabase
                    .from('barcode_history')
                    .select(selectFields)
                    .lt('created_at', item.created_at)
                    .order('created_at', { ascending: false })
                    .limit(3);
                
                // Apply the SAME filters to both queries
                [afterQuery, beforeQuery].forEach(q => {
                    if (user_id) {
                        const userIds = user_id.split(',').filter(id => id.trim() !== '');
                        if (userIds.length > 0) q.in('created_by', userIds);
                    }
                    if (action_type) {
                        const types = action_type.split(',').filter(t => t.trim() !== '');
                        if (types.length > 0) q.in('action_type', types);
                    }
                    if (startDate) q.gte('created_at', `${startDate}T00:00:00.000Z`);
                    if (endDate) q.lte('created_at', `${endDate}T23:59:59.999Z`);
                });

                const [afterRes, beforeRes] = await Promise.all([afterQuery, beforeQuery]);
                
                const itemsAfter = (afterRes.data || []).reverse(); // Reverse so they are in DESC order for the UI (newest top)
                const itemsBefore = beforeRes.data || [];

                // Add "After" context (items scanned later, so they appear ABOVE in the DESC list)
                itemsAfter.forEach(ctx => {
                    if (!seenIds.has(ctx.id) && !matchesIds.has(ctx.id)) {
                        dataWithContext.push({ ...ctx, isContext: true, contextType: 'after' });
                        seenIds.add(ctx.id);
                    }
                });

                // Add the actual MATCH if not already added
                if (!seenIds.has(item.id)) {
                    dataWithContext.push(item);
                    seenIds.add(item.id);
                }

                // Add "Before" context (items scanned earlier, so they appear BELOW in the DESC list)
                itemsBefore.forEach(ctx => {
                    if (!seenIds.has(ctx.id) && !matchesIds.has(ctx.id)) {
                        dataWithContext.push({ ...ctx, isContext: true, contextType: 'before' });
                        seenIds.add(ctx.id);
                    }
                });
            }
            finalData = dataWithContext;
        }
        
        res.json({
            data: finalData,
            total: finalCount,
            page: pageNum,
            limit: limitNum,
            totalPages: finalTotalPages
        });
    } catch (error) {
        console.error('Error fetching barcode history:', error);
        res.status(500).json({ message: 'Error al obtener el historial de códigos' });
    }
};

exports.exportBarcodeHistoryCsv = async (req, res) => {
    const { startDate, endDate, user_id } = req.query;
    try {
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Debe seleccionar Fecha Desde y Fecha Hasta obligatoriamente.' });
        }

        // Usar la función helper para obtener todo el historial sin límites
        const history = await getAllBarcodeHistory({ 
            startDate, 
            endDate,
            user_id,
            productCode: req.query.productCode,
            action_type: req.query.action_type || null,
            unique: req.query.unique === 'true'
        });

        if (!history || history.length === 0) {
            return res.status(404).json({ message: 'No hay datos para exportar en este período' });
        }

        const productIds = [...new Set(history.map(h => h.product_id).filter(Boolean))];

        if (productIds.length === 0) {
            return res.status(404).json({ message: 'No hay productos asociados en este historial' });
        }

        const products = [];
        const chunkSize = 200; // Batch fetching limit to prevent URI too long in Supabase
        for (let i = 0; i < productIds.length; i += chunkSize) {
            const chunkIds = productIds.slice(i, i + chunkSize);
            const { data: prodChunk, error: prodError } = await supabase
                .from('products')
                .select('code, barcode')
                .in('id', chunkIds)
                .not('barcode', 'is', null);

            if (prodError) throw prodError;
            if (prodChunk) products.push(...prodChunk);
        }

        if (products.length === 0) {
            return res.status(404).json({ message: 'Los productos de este historial no tienen código de barras asignado' });
        }

        // Generate CSV files, max 300 rows each
        const MAX_ROWS = 300;
        const files = [];
        let fileIndex = 1;

        for (let i = 0; i < products.length; i += MAX_ROWS) {
            const chunk = products.slice(i, i + MAX_ROWS);

            let csvContent = "B1_COD;B1_CODBAR\n";
            chunk.forEach(p => {
                csvContent += `${p.code || ''};${p.barcode || ''}\n`;
            });

            files.push({
                filename: `Codigos_${startDate}_al_${endDate}_parte${fileIndex}.csv`,
                content: csvContent
            });
            fileIndex++;
        }

        res.json({ files });

    } catch (error) {
        console.error('Error exporting barcode history:', error);
        res.status(500).json({ message: 'Error al generar la exportación a CSV' });
    }
};

exports.exportLayoutExcel = async (req, res) => {
    const { startDate, endDate, user_id, unique, action_type } = req.query;
    try {
        // Obtener historial completo usando la función helper
        const history = await getAllBarcodeHistory({ 
            startDate, 
            endDate, 
            user_id, 
            productCode: req.query.productCode,
            action_type: action_type || 'SCAN', 
            unique: unique === 'true' 
        });

        if (!history || history.length === 0) {
            return res.status(404).json({ message: 'No hay datos para exportar en el rango seleccionado' });
        }

        // Format data for Excel
        const exportData = history.map((item, index) => {
            const dateObj = new Date(item.created_at);
            return {
                "#": history.length - index,
                "Fecha": dateObj.toLocaleDateString('es-AR'),
                "Hora": dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
                "Descripción": item.product_description,
                "Código de Barras": item.products?.barcode || '-',
                "Código Interno": item.products?.code || '-',
                "Cód. Proveedor": item.products?.provider_code || '-',
                "Usuario": item.users?.username || 'Desconocido'
            };
        });

        const workbook = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(exportData);
        
        // Auto-size columns (rough approximation)
        const colWidths = [
            { wch: 5 },  // #
            { wch: 12 }, // Fecha
            { wch: 8 },  // Hora
            { wch: 50 }, // Descripción
            { wch: 18 }, // Código de Barras
            { wch: 12 }, // Código Interno
            { wch: 15 }, // Cód. Proveedor
            { wch: 15 }  // Usuario
        ];
        ws['!cols'] = colWidths;

        xlsx.utils.book_append_sheet(workbook, ws, "Layout");

        const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Layout_${startDate || 'full'}_al_${endDate || 'hoy'}.xlsx"`);
        res.send(buf);

    } catch (error) {
        console.error('Error exporting layout to Excel:', error);
        res.status(500).json({ message: 'Error al generar el archivo Excel' });
    }
};

exports.addBarcodeHistory = async (req, res) => {
    const { action_type, product_id, product_description, details, created_at } = req.body;

    if (!action_type || !product_description) {
        return res.status(400).json({ message: 'Faltan campos requeridos para el historial' });
    }

    try {
        // Protección contra duplicados para acciones de tipo SCAN
        if (action_type === 'SCAN' && product_id) {
            const dateToCheck = created_at ? new Date(created_at) : new Date();
            const startOfDay = new Date(dateToCheck);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateToCheck);
            endOfDay.setHours(23, 59, 59, 999);
            
            const { data: existing } = await supabase
                .from('barcode_history')
                .select('*')
                .eq('action_type', 'SCAN')
                .eq('product_id', product_id)
                .gte('created_at', startOfDay.toISOString())
                .lte('created_at', endOfDay.toISOString())
                .maybeSingle();

            if (existing) {
                // Producto ya escaneado en esa fecha, devolvemos el registro existente sin duplicar
                console.log(`[DUPLICATE IGNORE] Producto ${product_id} ya escaneado en fecha ${startOfDay.toLocaleDateString()}.`);
                return res.status(200).json(existing);
            }
        }

        const { data, error } = await supabase
            .from('barcode_history')
            .insert([{
                action_type,
                product_id: product_id || null,
                product_description,
                details,
                created_by: req.user.id,
                created_at: created_at || new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error recording barcode history:', error);
        res.status(500).json({ message: 'Error registrando el cambio en el historial' });
    }
};

exports.addBulkBarcodeHistory = async (req, res) => {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'No hay items para registrar' });
    }

    try {
        // 1. Agrupar items por fecha para validación masiva por día
        const itemsByDay = {};
        items.forEach(item => {
            // Extraer solo la parte YYYY-MM-DD para agrupar
            const dateStr = item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
            if (!itemsByDay[dateStr]) itemsByDay[dateStr] = [];
            itemsByDay[dateStr].push(item);
        });

        const recordsToInsert = [];
        const seenInThisBatch = new Set(); // Para evitar duplicados dentro del mismo JSON enviado

        for (const [day, dayItems] of Object.entries(itemsByDay)) {
            const startOfDay = `${day}T00:00:00.000Z`;
            const endOfDay = `${day}T23:59:59.999Z`;
            
            const productIds = [...new Set(dayItems.map(i => i.product_id).filter(Boolean))];
            
            let existingIdsOnDay = new Set();
            let existingDescsOnDay = new Set();
            
            // Cargamos todos los registros relevantes del día para validar en memoria
            // Esto es más seguro que filtrar por una lista gigante de IDs/Descripciones (evita errores de URL larga)
            const { data: existingScans } = await supabase
                .from('barcode_history')
                .select('product_id, product_description')
                .in('action_type', ['SCAN', 'ADD_BARCODE', 'UPDATE_BARCODE'])
                .gte('created_at', startOfDay)
                .lte('created_at', endOfDay);
            
            existingIdsOnDay = new Set(existingScans?.map(s => s.product_id).filter(Boolean) || []);
            existingDescsOnDay = new Set(existingScans?.map(s => s.product_description).filter(Boolean) || []);

            dayItems.forEach(item => {
                const itemKey = `${item.product_id}_${day}`;
                // Criterio de inserción:
                // 1. No es un SCAN (ej: es un ADD_BARCODE o UPDATE)
                // 2. O no tiene product_id (ej: log genérico)
                // 3. O el producto NO ha sido escaneado ese día según la DB Y no lo hemos procesado ya en este bucle
                const isDuplicate = (item.product_id && existingIdsOnDay.has(item.product_id)) || 
                                    (item.product_description && existingDescsOnDay.has(item.product_description));
                
                // Usamos la descripción como clave de "visto en este lote" para asegurar unicidad total por nombre
                const batchKey = item.product_description || item.product_id;

                if (
                    ((item.action_type && item.action_type !== 'SCAN') || !item.product_id || !isDuplicate) &&
                    (!batchKey || !seenInThisBatch.has(batchKey))
                ) {
                    recordsToInsert.push({
                        action_type: item.action_type || 'SCAN',
                        product_id: item.product_id || null,
                        product_description: item.product_description,
                        details: item.details || `Re-escaneo desde historial`,
                        created_by: item.created_by || req.user.id,
                        created_at: item.created_at || new Date().toISOString()
                    });
                    if (batchKey) seenInThisBatch.add(batchKey);
                }
            });
        }

        if (recordsToInsert.length === 0) {
            return res.status(200).json({ 
                message: 'No hay items nuevos para registrar. Todos ya se encontraban registrados en sus respectivas fechas.',
                processed: 0,
                skipped: items.length 
            });
        }

        const { data, error } = await supabase
            .from('barcode_history')
            .insert(recordsToInsert)
            .select();

        if (error) throw error;
        res.status(201).json({
            message: `${recordsToInsert.length} productos agregados.`,
            processed: recordsToInsert.length,
            skipped: items.length - recordsToInsert.length,
            data
        });
    } catch (error) {
        console.error('Error recording bulk barcode history:', error);
        res.status(500).json({ message: 'Error registrando los cambios en lote' });
    }
};

exports.bulkTransferFiltered = async (req, res) => {
    const { startDate, endDate, user_id } = req.body;

    try {
        // Obtener historial completo basado en los filtros proporcionados
        const history = await getAllBarcodeHistory({ 
            startDate, 
            endDate, 
            user_id,
            action_type: null // Queremos todos los movimientos (vinculaciones, ediciones, etc)
        });

        if (!history || history.length === 0) {
            return res.status(404).json({ message: 'No hay datos en el historial para los filtros seleccionados' });
        }

        // 1. Agrupar el historial obtenido por día para validación masiva diaria
        const historyByDay = {};
        const totalCandidates = new Set();
        history.forEach(item => {
            const dateStr = item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
            if (!historyByDay[dateStr]) historyByDay[dateStr] = [];
            historyByDay[dateStr].push(item);
            if (item.product_id) {
                totalCandidates.add(`${item.product_id}_${dateStr}`);
            }
        });

        const totalCandidatesCount = totalCandidates.size;
        const finalProductsToInsert = [];
        const seenInThisProcess = new Set(); // Evitar duplicados dentro de la misma operación

        for (const [day, dayItems] of Object.entries(historyByDay)) {
            const startOfDay = `${day}T00:00:00.000Z`;
            const endOfDay = `${day}T23:59:59.999Z`;
            
            const uniqueProductIdsOnDay = [...new Set(dayItems.map(i => i.product_id).filter(Boolean))];
            
            let existingIdsOnDay = new Set();
            let existingDescsOnDay = new Set();
            
            // Cargamos todos los registros relevantes del día una sola vez (eficiente y seguro para lotes grandes)
            const { data: existingScans } = await supabase
                .from('barcode_history')
                .select('product_id, product_description')
                .in('action_type', ['SCAN', 'ADD_BARCODE', 'UPDATE_BARCODE'])
                .gte('created_at', startOfDay)
                .lte('created_at', endOfDay);
            
            existingIdsOnDay = new Set(existingScans?.map(s => s.product_id).filter(Boolean) || []);
            existingDescsOnDay = new Set(existingScans?.map(s => s.product_description).filter(Boolean) || []);

            dayItems.forEach(item => {
                const isDuplicate = (item.product_id && existingIdsOnDay.has(item.product_id)) || 
                                    (item.product_description && existingDescsOnDay.has(item.product_description));

                const processKey = item.product_description || item.product_id;

                if (item.product_id && !isDuplicate && !seenInThisProcess.has(processKey)) {
                    finalProductsToInsert.push({
                        action_type: 'SCAN',
                        product_id: item.product_id,
                        product_description: item.product_description,
                        details: 'Transferencia masiva desde historial',
                        created_by: item.created_by || req.user.id,
                        created_at: item.created_at // Preservar fecha original
                    });
                    seenInThisProcess.add(processKey);
                }
            });
        }

        if (finalProductsToInsert.length === 0) {
            return res.status(200).json({ 
                message: 'No hay productos nuevos para agregar. Todos ya se encuentran en el Layout hoy.',
                processed: 0,
                skipped: totalCandidatesCount 
            });
        }

        // Insertar en lotes si son muchos para evitar límites de Supabase si fuera necesario
        const { data, error } = await supabase
            .from('barcode_history')
            .insert(finalProductsToInsert)
            .select();

        if (error) throw error;

        res.status(201).json({
            message: `Sincronización masiva completada: ${finalProductsToInsert.length} productos agregados.`,
            processed: finalProductsToInsert.length,
            skipped: totalCandidatesCount - finalProductsToInsert.length,
            data
        });

    } catch (error) {
        console.error('Error in bulk-transfer-filtered:', error);
        res.status(500).json({ message: 'Error procesando la transferencia masiva filtrada' });
    }
};

exports.deleteBulkBarcodeHistory = async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Se requiere un array de IDs para eliminar' });
    }

    try {
        const { error } = await supabase
            .from('barcode_history')
            .delete()
            .in('id', ids);

        if (error) throw error;

        // Log security action
        const logData = {
            actor_id: req.user.id,
            action: 'BARCODE_HISTORY_BULK_DELETE',
            details: {
                count: ids.length,
                ids: ids.slice(0, 50) // Log only first 50 IDs to avoid oversized logs
            },
            ip_address: req.ip,
            user_agent: req.get('user-agent')
        };
        supabase.from('security_logs').insert(logData).then(({ error }) => {
            if (error) console.error('[AUDIT ERROR] No se pudo guardar log de eliminación masiva:', error.message);
        });

        res.json({ message: `${ids.length} registros eliminados exitosamente` });
    } catch (error) {
        console.error('Error deleting bulk barcode history:', error);
        res.status(500).json({ message: 'Error al eliminar los registros' });
    }
};

exports.getMissingLayoutProducts = async (req, res) => {
    try {
        const query = (req.query.q || '').toLowerCase();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const startIndex = (page - 1) * limit;

        // 1. Fetch from layout_missing table joined with products to get current barcodes
        // Note: Since Supabase JS client doesn't support complex joins easily without RPC, 
        // we'll fetch missing products and then enrich them or use a view if available.
        // For now, we'll fetch missing products from DB.
        
        let { data: missingFromDb, error: dbError } = await supabase
            .from('layout_missing')
            .select('*');

        if (dbError) throw dbError;

        if (!missingFromDb || missingFromDb.length === 0) {
            return res.json({ data: [], total: 0, page, limit, totalPages: 0 });
        }

        // 2. Filter out products that are already in the layout (barcode_history)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        
        const { data: existingInHistory } = await supabase
            .from('barcode_history')
            .select('product_id, product_description')
            .gte('created_at', thirtyDaysAgo.toISOString());

        const existingIds = new Set(existingInHistory?.map(h => h.product_id).filter(Boolean) || []);
        const existingDescs = new Set(existingInHistory?.map(h => h.product_description).filter(Boolean) || []);

        const filteredMissing = missingFromDb.filter(p => {
            // We don't have product_id in layout_missing yet, but we can match by description or code later
            // For now, let's assume we enriched them or match by description
            return !existingDescs.has(p.description);
        });

        // 3. Apply search filter
        const filteredBySearch = query 
            ? filteredMissing.filter(p => 
                p.description.toLowerCase().includes(query) || 
                p.code.toLowerCase().includes(query)
            )
            : filteredMissing;

        // 4. Enrich with current barcodes from products table (efficiently)
        const codes = filteredBySearch.slice(startIndex, startIndex + limit).map(p => p.code);
        const { data: dbProducts } = await supabase
            .from('products')
            .select('id, code, barcode')
            .in('code', codes);

        const dbMap = new Map();
        dbProducts?.forEach(p => dbMap.set(p.code, p));

        const paginatedProducts = filteredBySearch.slice(startIndex, startIndex + limit).map(p => {
            const dbInfo = dbMap.get(p.code);
            return {
                ...p,
                id: dbInfo?.id || null,
                barcode: dbInfo?.barcode || null
            };
        });

        res.json({ 
            data: paginatedProducts,
            total: filteredBySearch.length,
            page,
            limit,
            totalPages: Math.ceil(filteredBySearch.length / limit)
        });

    } catch (error) {
        console.error('Error in getMissingLayoutProducts:', error);
        res.status(500).json({ message: 'Error al obtener productos faltantes' });
    }
};

exports.syncMissingProducts = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No se subió ningún archivo' });
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetsToRead = ['DepositoConStock', 'DepositoSinStock'];
        let allMissingProducts = [];

        sheetsToRead.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            if (sheet) {
                const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                const dataRows = rows.slice(1);
                dataRows.forEach(row => {
                    if (row[0] && row[1]) {
                        allMissingProducts.push({
                            code: String(row[0]).trim(),
                            description: String(row[1]).trim(),
                            brand: row[2] ? String(row[2]).trim() : '',
                            source: sheetName
                        });
                    }
                });
            }
        });

        // Delete old records
        const { error: deleteError } = await supabase
            .from('layout_missing')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything

        if (deleteError) throw deleteError;

        // Insert new records in chunks
        const chunkSize = 200;
        for (let i = 0; i < allMissingProducts.length; i += chunkSize) {
            const chunk = allMissingProducts.slice(i, i + chunkSize);
            const { error: insertError } = await supabase
                .from('layout_missing')
                .insert(chunk);
            if (insertError) throw insertError;
        }

        // Clean up temp file
        const fs = require('fs');
        fs.unlinkSync(req.file.path);

        res.json({ message: 'Sincronización completada', count: allMissingProducts.length });

    } catch (error) {
        console.error('Error syncing missing products:', error);
        res.status(500).json({ message: 'Error al sincronizar productos faltantes' });
    }
};
