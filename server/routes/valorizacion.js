const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { verifyToken } = require('../middleware/auth');
const xlsx = require('xlsx');
const dolarService = require('../services/dolarService');

// Función auxiliar para obtener y calcular los datos de valorización
async function getValorizacionData(remitoNumber) {
    const cotizaciones = await dolarService.getCotizaciones();
    // 1. Buscar en la tabla de egresos por coincidencia parcial en reference_number o pdf_filename
    const { data: egresos, error: egresosError } = await supabase
        .from('egresos')
        .select('*, sucursales(name)')
        .or(`reference_number.ilike.%${remitoNumber}%,pdf_filename.ilike.%${remitoNumber}%`);

    if (egresosError) {
        console.error('[VALORIZACION] Error buscando egreso:', egresosError);
        throw egresosError;
    }

    // Si encontramos en egresos
    if (egresos && egresos.length > 0) {
        const egreso = egresos[0];
        const sucursalName = egreso.sucursales?.name || 'Deposito';
        
        // Obtener los items del egreso enriquecidos con la info del producto (especialmente cost_price)
        const { data: egresoItems, error: itemsError } = await supabase
            .from('egreso_items')
            .select(`
                *,
                products (
                    description,
                    brand,
                    code,
                    barcode,
                    cost_price,
                    moneda
                )
            `)
            .eq('egreso_id', egreso.id);

        if (itemsError) {
            console.error('[VALORIZACION] Error obteniendo egreso_items:', itemsError);
            throw itemsError;
        }

        let totalEsperado = 0;
        let totalControlado = 0;

        const itemsMapped = egresoItems.map(item => {
            const rawCost = Number(item.products?.cost_price) || 0;
            const costPrice = dolarService.convertirPrecio(rawCost, item.products?.moneda, cotizaciones);
            const expectedQty = Number(item.expected_quantity) || 0;
            const scannedQty = Number(item.scanned_quantity) || 0;

            const subtotalEsperado = expectedQty * costPrice;
            const subtotalControlado = scannedQty * costPrice;

            totalEsperado += subtotalEsperado;
            totalControlado += subtotalControlado;

            return {
                code: item.product_code,
                barcode: item.products?.barcode || '-',
                description: item.products?.description || 'Sin descripción',
                brand: item.products?.brand || '-',
                expected_quantity: expectedQty,
                scanned_quantity: scannedQty,
                cost_price: costPrice,
                subtotal_esperado: subtotalEsperado,
                subtotal_controlado: subtotalControlado,
                difference: scannedQty - expectedQty,
                difference_cost: subtotalControlado - subtotalEsperado,
                shortage_reason: item.shortage_reason || '-'
            };
        });

        return {
            found: true,
            type: 'egreso',
            id: egreso.id,
            number: egreso.reference_number,
            pdf_filename: egreso.pdf_filename,
            status: egreso.status,
            created_by: egreso.created_by,
            date: egreso.date,
            sucursal_name: sucursalName,
            items: itemsMapped,
            totals: {
                total_esperado: totalEsperado,
                total_controlado: totalControlado,
                diferencia_costo: totalControlado - totalEsperado
            }
        };
    }

    // 2. Si no se encontró en egresos, buscar en la tabla remitos (conteos finalizados)
    const { data: remitos, error: remitosError } = await supabase
        .from('remitos')
        .select('*')
        .ilike('remito_number', `%${remitoNumber}%`);

    if (remitosError) {
        console.error('[VALORIZACION] Error buscando remito:', remitosError);
        throw remitosError;
    }

    if (remitos && remitos.length > 0) {
        const remito = remitos[0];
        
        const itemsRaw = remito.items || [];
        const discrepancies = remito.discrepancies || {};
        const missing = discrepancies.missing || [];
        const extra = discrepancies.extra || [];

        // Recopilar todos los códigos de producto
        const allCodes = [...new Set([
            ...itemsRaw.map(i => String(i.code).trim()),
            ...missing.map(i => String(i.code).trim()),
            ...extra.map(i => String(i.code).trim())
        ])].filter(Boolean);

        // Consultar a la base de datos de productos por estos códigos
        let productMap = new Map();
        if (allCodes.length > 0) {
            const { data: productsData, error: productsError } = await supabase
                .from('products')
                .select('code, barcode, description, brand, cost_price, moneda')
                .in('code', allCodes);

            if (productsError) {
                console.error('[VALORIZACION] Error cargando productos de remito:', productsError);
            } else if (productsData) {
                productsData.forEach(p => productMap.set(p.code, p));
            }
        }

        let totalEsperado = 0;
        let totalControlado = 0;

        const missingMap = new Map(missing.map(m => [m.code, m]));
        const extraMap = new Map(extra.map(e => [e.code, e]));

        const itemsMapped = itemsRaw.map(item => {
            const code = item.code;
            const dbProd = productMap.get(code);
            const rawCost = Number(dbProd?.cost_price) || 0;
            const costPrice = dolarService.convertirPrecio(rawCost, dbProd?.moneda, cotizaciones);
            
            const expectedQty = Number(item.quantity) || 0;
            let scannedQty = expectedQty;

            if (missingMap.has(code)) {
                scannedQty = Number(missingMap.get(code).scanned) || 0;
            } else if (extraMap.has(code)) {
                scannedQty = Number(extraMap.get(code).scanned) || 0;
            }

            const subtotalEsperado = expectedQty * costPrice;
            const subtotalControlado = scannedQty * costPrice;

            totalEsperado += subtotalEsperado;
            totalControlado += subtotalControlado;

            return {
                code: code,
                barcode: dbProd?.barcode || '-',
                description: dbProd?.description || item.description || 'Sin descripción',
                brand: dbProd?.brand || '-',
                expected_quantity: expectedQty,
                scanned_quantity: scannedQty,
                cost_price: costPrice,
                subtotal_esperado: subtotalEsperado,
                subtotal_controlado: subtotalControlado,
                difference: scannedQty - expectedQty,
                difference_cost: subtotalControlado - subtotalEsperado,
                shortage_reason: '-'
            };
        });

        // Agregar items que solo fueron escaneados de más y no estaban en itemsRaw (extras)
        extra.forEach(ext => {
            const code = ext.code;
            if (!itemsRaw.some(i => i.code === code)) {
                const dbProd = productMap.get(code);
                const rawCost = Number(dbProd?.cost_price) || 0;
                const costPrice = dolarService.convertirPrecio(rawCost, dbProd?.moneda, cotizaciones);
                
                const expectedQty = 0;
                const scannedQty = Number(ext.scanned) || 0;

                const subtotalEsperado = expectedQty * costPrice;
                const subtotalControlado = scannedQty * costPrice;

                totalEsperado += subtotalEsperado;
                totalControlado += subtotalControlado;

                itemsMapped.push({
                    code: code,
                    barcode: dbProd?.barcode || '-',
                    description: dbProd?.description || ext.description || 'Sin descripción',
                    brand: dbProd?.brand || '-',
                    expected_quantity: expectedQty,
                    scanned_quantity: scannedQty,
                    cost_price: costPrice,
                    subtotal_esperado: subtotalEsperado,
                    subtotal_controlado: subtotalControlado,
                    difference: scannedQty - expectedQty,
                    difference_cost: subtotalControlado - subtotalEsperado,
                    shortage_reason: '-'
                });
            }
        });

        return {
            found: true,
            type: 'remito',
            id: remito.id,
            number: remito.remito_number,
            pdf_filename: '-',
            status: remito.status,
            created_by: remito.created_by,
            date: remito.date,
            sucursal_name: '-',
            items: itemsMapped,
            totals: {
                total_esperado: totalEsperado,
                total_controlado: totalControlado,
                diferencia_costo: totalControlado - totalEsperado
            }
        };
    }

    return null;
}

// GET /api/valorizacion/:remitoNumber
router.get('/:remitoNumber', verifyToken, async (req, res) => {
    const { remitoNumber } = req.params;
    if (!remitoNumber) {
        return res.status(400).json({ message: 'Debe ingresar un número de remito' });
    }

    try {
        const data = await getValorizacionData(remitoNumber);
        
        if (data) {
            return res.json(data);
        }

        return res.status(404).json({
            found: false,
            message: `No se encontró ningún remito o egreso finalizado con el número "${remitoNumber}"`
        });

    } catch (error) {
        console.error('[VALORIZACION] Error en endpoint JSON:', error);
        res.status(500).json({ message: 'Error interno al buscar y valorizar el remito' });
    }
});

// GET /api/valorizacion/:remitoNumber/export
router.get('/:remitoNumber/export', verifyToken, async (req, res) => {
    const { remitoNumber } = req.params;
    if (!remitoNumber) {
        return res.status(400).json({ message: 'Debe ingresar un número de remito' });
    }

    try {
        const result = await getValorizacionData(remitoNumber);
        
        if (!result) {
            return res.status(404).json({ message: `No se encontró el remito "${remitoNumber}" para exportar` });
        }

        const workbook = xlsx.utils.book_new();

        // Estructurar los datos para el Excel
        const data = result.items.map(item => ({
            'Código': item.code,
            'Código de Barras': item.barcode,
            'Descripción': item.description,
            'Marca': item.brand,
            'Cant. Esperada': item.expected_quantity,
            'Cant. Controlada': item.scanned_quantity,
            'Diferencia Cant.': item.difference,
            'Precio de Costo Unit.': item.cost_price,
            'Costo Esperado': item.subtotal_esperado,
            'Costo Controlado': item.subtotal_controlado,
            'Diferencia Costo': item.difference_cost,
            'Motivo Faltante': item.shortage_reason
        }));

        // Fila de resumen de totales al final
        data.push({
            'Código': 'TOTALES',
            'Código de Barras': '',
            'Descripción': '',
            'Marca': '',
            'Cant. Esperada': '',
            'Cant. Controlada': '',
            'Diferencia Cant.': '',
            'Precio de Costo Unit.': '',
            'Costo Esperado': result.totals.total_esperado,
            'Costo Controlado': result.totals.total_controlado,
            'Diferencia Costo': result.totals.diferencia_costo,
            'Motivo Faltante': ''
        });

        const worksheet = xlsx.utils.json_to_sheet(data);
        
        // Ajustar anchos de columnas
        const colWidths = [
            { wch: 12 }, // Código
            { wch: 16 }, // Código de barras
            { wch: 40 }, // Descripción
            { wch: 12 }, // Marca
            { wch: 14 }, // Cant. Esperada
            { wch: 14 }, // Cant. Controlada
            { wch: 14 }, // Diferencia Cant.
            { wch: 18 }, // Precio Costo Unit
            { wch: 16 }, // Costo Esperado
            { wch: 16 }, // Costo Controlado
            { wch: 16 }, // Diferencia Costo
            { wch: 18 }  // Motivo Faltante
        ];
        worksheet['!cols'] = colWidths;

        xlsx.utils.book_append_sheet(workbook, worksheet, 'Valorización');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Valorizacion_Remito_${remitoNumber}.xlsx`);
        res.send(buffer);
    } catch (error) {
        console.error('[VALORIZACION] Error en endpoint Excel:', error);
        res.status(500).json({ message: 'Error al exportar valorización a Excel' });
    }
});

module.exports = router;
