const supabase = require('./supabaseClient');

/**
 * Servicio encargado de la toma de capturas (snapshots) del stock desde Protheus,
 * la comparación de variaciones y la limpieza del historial.
 */

/**
 * Consulta la API de stock de Protheus, filtra local 00 y filial 010100,
 * y genera una corrida y comparativa.
 * @param {string} scheduleType Tipo de corrida ('19:00', '05:30', 'manual')
 * @returns {Promise<Object>} Resultado del proceso
 */
async function takeStockSnapshot(scheduleType = 'manual') {
    const PROTHEUS_SB2_API_URL = process.env.PROTHEUS_SB2_API_URL;
    if (!PROTHEUS_SB2_API_URL) {
        throw new Error('La variable de entorno PROTHEUS_SB2_API_URL no está configurada.');
    }

    console.log(`[STOCK SNAPSHOT] Iniciando toma de stock (${scheduleType}). Url: ${PROTHEUS_SB2_API_URL}`);

    let currentPage = 1;
    let totalPages = 1;
    const stockItems = [];

    // 1. Descargar catálogo completo paginado desde Protheus
    try {
        do {
            const url = `${PROTHEUS_SB2_API_URL}?page=${currentPage}&pageSize=200`;
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error(`[STOCK SNAPSHOT ERROR] Error al consultar Protheus pág ${currentPage}: ${response.status} ${response.statusText}`);
                throw new Error(`Error en API Protheus: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (!data || !data.objects || !Array.isArray(data.objects)) {
                console.warn(`[STOCK SNAPSHOT] Estructura inesperada en página ${currentPage}:`, data);
                break;
            }

            // Filtrar local '00' y filial '010100'
            const filtered = data.objects.filter(item => 
                item && 
                String(item.b2_local).trim() === '00' && 
                String(item.b2_filial).trim() === '010100'
            );

            stockItems.push(...filtered);
            
            totalPages = data.meta ? parseInt(data.meta.total_pages) : 1;
            currentPage++;

            // Retardo de 50ms para no saturar el ERP
            if (currentPage <= totalPages) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        } while (currentPage <= totalPages);

        console.log(`[STOCK SNAPSHOT] Descarga finalizada. Total de ítems descargados: ${stockItems.length}`);
    } catch (error) {
        console.error('[STOCK SNAPSHOT ERROR] Falló la descarga de stock de Protheus:', error.message);
        throw error;
    }

    // 2. Crear registro en stock_snapshots_runs
    const { data: run, error: runError } = await supabase
        .from('stock_snapshots_runs')
        .insert([{
            schedule_type: scheduleType,
            snapshot_time: new Date().toISOString(),
            total_items: stockItems.length
        }])
        .select()
        .single();

    if (runError) {
        console.error('[STOCK SNAPSHOT ERROR] Error al crear la corrida:', runError.message);
        throw runError;
    }

    // 3. Guardar los ítems de stock en la tabla stock_snapshots_items por lotes (chunks) de 500
    const batchSize = 500;
    try {
        for (let i = 0; i < stockItems.length; i += batchSize) {
            const batch = stockItems.slice(i, i + batchSize).map(item => ({
                run_id: run.id,
                product_code: String(item.b2_cod).trim(),
                product_description: item.b2_xdprod ? String(item.b2_xdprod).trim() : '',
                quantity: parseFloat(item.b2_qatu) || 0,
                local: String(item.b2_local).trim(),
                filial: String(item.b2_filial).trim()
            }));

            const { error: batchError } = await supabase
                .from('stock_snapshots_items')
                .insert(batch);

            if (batchError) {
                console.error('[STOCK SNAPSHOT ERROR] Error al guardar lote de items:', batchError.message);
                throw batchError;
            }
        }
        console.log(`[STOCK SNAPSHOT] Se guardaron ${stockItems.length} registros detallados para la corrida ${run.id}.`);
    } catch (error) {
        console.error('[STOCK SNAPSHOT ERROR] Falló el almacenamiento de los ítems detallados:', error.message);
        // Si falla, intentamos borrar la corrida para evitar inconsistencias
        await supabase.from('stock_snapshots_runs').delete().eq('id', run.id);
        throw error;
    }

    // 4. Comparar con la corrida anterior
    try {
        let targetScheduleType = '';
        if (scheduleType === '05:30') targetScheduleType = '19:00';
        else if (scheduleType === '19:00') targetScheduleType = '05:30';

        let prevRunQuery = supabase
            .from('stock_snapshots_runs')
            .select('*')
            .order('snapshot_time', { ascending: false })
            .limit(1);

        if (targetScheduleType) {
            prevRunQuery = prevRunQuery.eq('schedule_type', targetScheduleType);
        } else {
            // Manual: comparar con la más reciente que no sea ella misma
            prevRunQuery = prevRunQuery.neq('id', run.id);
        }

        const { data: prevRuns, error: prevRunErr } = await prevRunQuery;
        if (prevRunErr) throw prevRunErr;

        const prevRun = prevRuns && prevRuns[0];

        if (prevRun) {
            console.log(`[STOCK COMPARISON] Comparando corrida actual ${run.id} (${scheduleType}) con corrida anterior ${prevRun.id} (${prevRun.schedule_type}).`);
            
            // Descargar ítems de la corrida anterior paginadamente de Supabase (límite default 1000)
            const prevItems = [];
            let offset = 0;
            const limit = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: batch, error: fetchErr } = await supabase
                    .from('stock_snapshots_items')
                    .select('product_code, product_description, quantity')
                    .eq('run_id', prevRun.id)
                    .range(offset, offset + limit - 1);

                if (fetchErr) throw fetchErr;

                if (!batch || batch.length === 0) {
                    hasMore = false;
                } else {
                    prevItems.push(...batch);
                    offset += limit;
                    if (batch.length < limit) hasMore = false;
                }
            }

            // Mapear ítems anteriores por product_code
            const prevMap = new Map();
            prevItems.forEach(pi => {
                prevMap.set(pi.product_code, {
                    qty: parseFloat(pi.quantity) || 0,
                    desc: pi.product_description
                });
            });

            // Mapear ítems actuales por product_code
            const currentMap = new Map();
            stockItems.forEach(ci => {
                currentMap.set(String(ci.b2_cod).trim(), {
                    qty: parseFloat(ci.b2_qatu) || 0,
                    desc: ci.b2_xdprod ? String(ci.b2_xdprod).trim() : ''
                });
            });

            const differences = [];

            // Encontrar variaciones en ítems actuales
            for (const [code, curr] of currentMap.entries()) {
                const prev = prevMap.get(code);
                const prevQty = prev ? prev.qty : 0;

                if (curr.qty !== prevQty) {
                    differences.push({
                        code: code,
                        description: curr.desc || (prev ? prev.desc : ''),
                        qty_start: prevQty,
                        qty_end: curr.qty,
                        diff: curr.qty - prevQty
                    });
                }
            }

            // Encontrar ítems eliminados o que pasaron a 0
            for (const [code, prev] of prevMap.entries()) {
                if (!currentMap.has(code)) {
                    if (prev.qty !== 0) {
                        differences.push({
                            code: code,
                            description: prev.desc,
                            qty_start: prev.qty,
                            qty_end: 0,
                            diff: -prev.qty
                        });
                    }
                }
            }

            const periodType = (prevRun.schedule_type === '19:00' && scheduleType === '05:30')
                ? 'nocturno'
                : (prevRun.schedule_type === '05:30' && scheduleType === '19:00')
                    ? 'diurno'
                    : 'manual';

            // Insertar comparación consolidada
            const { error: compError } = await supabase
                .from('stock_comparisons')
                .insert([{
                    run_start_id: prevRun.id,
                    run_end_id: run.id,
                    start_time: prevRun.snapshot_time,
                    end_time: run.snapshot_time,
                    period_type: periodType,
                    differences: differences
                }]);

            if (compError) {
                console.error('[STOCK COMPARISON ERROR] Falló al guardar la comparación:', compError.message);
                throw compError;
            }

            console.log(`[STOCK COMPARISON] Comparación completada con éxito. Se detectaron ${differences.length} productos con diferencias.`);
        } else {
            console.log('[STOCK COMPARISON] No se encontró una corrida previa válida para realizar la comparación.');
        }
    } catch (error) {
        console.error('[STOCK COMPARISON ERROR] Falló el proceso de comparación:', error.message);
        // Las comparaciones no detienen el flujo principal, pero lo registramos
    }

    // 5. Limpieza automática de ítems detallados de más de 14 días
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 14);

        // Buscar corridas anteriores a 14 días
        const { data: oldRuns, error: oldRunsErr } = await supabase
            .from('stock_snapshots_runs')
            .select('id')
            .lt('created_at', cutoffDate.toISOString());

        if (oldRunsErr) throw oldRunsErr;

        if (oldRuns && oldRuns.length > 0) {
            const oldRunIds = oldRuns.map(r => r.id);
            console.log(`[STOCK CLEANUP] Limpiando items detallados de ${oldRunIds.length} corridas antiguas...`);

            const { error: deleteErr } = await supabase
                .from('stock_snapshots_items')
                .delete()
                .in('run_id', oldRunIds);

            if (deleteErr) throw deleteErr;
            console.log('[STOCK CLEANUP] Limpieza de items detallados completada con éxito.');
        }
    } catch (error) {
        console.error('[STOCK CLEANUP ERROR] Falló la limpieza de historial antiguo:', error.message);
    }

    return {
        success: true,
        runId: run.id,
        itemsSaved: stockItems.length
    };
}

module.exports = {
    takeStockSnapshot
};
