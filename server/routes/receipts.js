const express = require('express');
const router = express.Router();

const supabase = require('../services/supabaseClient');
const { verifyToken, verifyAdmin, verifySuperAdmin, hasPermission, verifyBranchAccess } = require('../middleware/auth');
const multer = require('multer');
const xlsx = require('xlsx');
const { fetchProductsByCodes, findProductByAnyCode } = require('../utils/dbHelpers');
const { parseRemitoPdf } = require('../pdfParser');
const { parseExcelXml } = require('../xmlParser');


// --- RECEIPTS ROUTES ---

// Create Receipt
router.post('//api/receipts', verifyToken, async (req, res) => {
    const { remitoNumber, type } = req.body;
    if (!remitoNumber) return res.status(400).json({ message: 'Missing remito number' });

    try {
        const { data, error } = await supabase
            .from('receipts')
            .insert([{
                remito_number: remitoNumber,
                type: type || 'normal',
                created_by: req.user.username,
                sucursal_id: req.user.sucursal_id || null,
                date: new Date()
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating receipt:', error);
        res.status(500).json({ message: 'Error creating receipt' });
    }
});

// Get Receipts
router.get('//api/receipts', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('receipts')
            .select('*')
            .is('deleted_at', null)
            .neq('type', 'sucursal_transfer')
            .order('date', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching receipts:', error);
        res.status(500).json({ message: 'Error fetching receipts' });
    }
});

// Get Receipt Details
router.get('//api/receipts/:id', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', id)
            .is('deleted_at', null)
            .single();

        if (receiptError) throw receiptError;

        const { data: items, error: itemsError } = await supabase
            .from('receipt_items')
            .select(`
                *,
                products (
                    description,
                    brand,
                    code,
                    barcode,
                    provider_code,
                    primary_unit,
                    secondary_unit,
                    conversion_factor,
                    conversion_type
                )
            `)
            .eq('receipt_id', id);

        if (itemsError) throw itemsError;

        res.json({ ...receipt, items });
    } catch (error) {
        console.error('Error fetching receipt details:', error);
        res.status(500).json({ message: 'Error fetching receipt details' });
    }
});

// Add/Update Expected Item (by Provider Code or Internal Code)
// mode: 'provider' (default) or 'internal'
router.post('//api/receipts/:id/items', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    const { code, quantity } = req.body;

    if (!code || !quantity) return res.status(400).json({ message: 'Missing code or quantity' });

    try {
        // 1. Find the product first using the unified helper
        const product = await findProductByAnyCode(code, req.body.searchType || 'any');

        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado en el catálogo' });
        }

        // 2. Fetch existing item to log history
        const { data: existingItem } = await supabase
            .from('receipt_items')
            .select('*')
            .eq('receipt_id', id)
            .eq('product_code', product.code)
            .maybeSingle();

        let newQuantity = quantity;
        if (existingItem) {
            // If it exists, we add to expectation
            newQuantity = (Number(existingItem.expected_quantity) || 0) + Number(quantity);
        }

        const { data: savedItem, error: saveError } = await supabase
            .from('receipt_items')
            .upsert({
                receipt_id: id,
                product_code: product.code,
                expected_quantity: newQuantity
            }, { onConflict: 'receipt_id, product_code' })
            .select()
            .single();

        if (saveError) throw saveError;

        // 3. Log History
        const oldExpected = existingItem ? Number(existingItem.expected_quantity) : 0;
        console.log(`[DEBUG_HISTORY] Adding item - Old Expected: ${oldExpected}, New Expected: ${newQuantity}`);

        if (oldExpected !== newQuantity) {
            const { error: historyError } = await supabase.from('receipt_items_history').insert({
                receipt_id: id,
                user_id: req.user.id,
                operation: existingItem ? 'UPDATE_EXPECTED' : 'INSERT_EXPECTED',
                product_code: product.code,
                old_data: { expected_quantity: oldExpected },
                new_data: { expected_quantity: newQuantity },
                changed_at: new Date().toISOString()
            });

            if (historyError) {
                console.error('[DEBUG_HISTORY] Error inserting history (Add Item):', historyError);
            } else {
                console.log('[DEBUG_HISTORY] History insertion successful (Add Item)');
            }
        } else {
            console.log('[DEBUG_HISTORY] Quantities are equal, skipping history log.');
        }

        res.json(savedItem);
    } catch (error) {
        console.error('Error adding receipt item:', error);
        res.status(500).json({ message: 'Error adding receipt item' });
    }
});

// Increment Scanned Quantity (Control)
router.post('//api/receipts/:id/scan', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    const { code, quantity } = req.body;

    if (!code) return res.status(400).json({ message: 'Missing code' });
    const qtyToAdd = quantity || 1;

    try {
        const product = await findProductByAnyCode(code, req.body.searchType || 'any');

        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const productCode = product.code;

        const { data: existingItem } = await supabase
            .from('receipt_items')
            .select('*')
            .eq('receipt_id', id)
            .eq('product_code', productCode)
            .maybeSingle();

        let newScanned = qtyToAdd;
        let currentExpected = 0;
        let oldScanned = 0;

        if (existingItem) {
            oldScanned = (Number(existingItem.scanned_quantity) || 0);
            newScanned = oldScanned + qtyToAdd;
            currentExpected = existingItem.expected_quantity;
        }

        const { data: savedItem, error: saveError } = await supabase
            .from('receipt_items')
            .upsert({
                receipt_id: id,
                product_code: productCode,
                scanned_quantity: newScanned,
                expected_quantity: currentExpected
            }, { onConflict: 'receipt_id, product_code' })
            .select()
            .single();

        if (saveError) throw saveError;

        // Log History
        console.log(`[DEBUG_HISTORY] Scan item - Old Scanned: ${oldScanned}, New Scanned: ${newScanned}`);

        if (oldScanned !== newScanned) {
            const { error: historyError } = await supabase.from('receipt_items_history').insert({
                receipt_id: id,
                user_id: req.user.id,
                operation: existingItem ? 'UPDATE_SCANNED' : 'INSERT_SCANNED',
                product_code: productCode,
                old_data: { scanned_quantity: oldScanned },
                new_data: { scanned_quantity: newScanned },
                changed_at: new Date().toISOString()
            });

            if (historyError) {
                console.error('[DEBUG_HISTORY] Error inserting history (Scan Item):', historyError);
            } else {
                console.log('[DEBUG_HISTORY] History insertion successful (Scan Item)');
            }
        } else {
            console.log('[DEBUG_HISTORY] Scanned quantities are equal, skipping history log.');
        }

        res.json(savedItem);

    } catch (error) {
        console.error('Error scanning receipt item:', error);
        res.status(500).json({ message: 'Error scanning item' });
    }
});

// Close Receipt
router.put('//api/receipts/:id/close', verifyToken, hasPermission('close_ingresos'), verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('receipts')
            .update({ status: 'finalized' })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Error closing receipt:', error);
        res.status(500).json({ message: 'Error closing receipt' });
    }
});

// Reopen Receipt (Admin only)
router.put('//api/receipts/:id/reopen', verifyToken, hasPermission('close_ingresos'), verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('receipts')
            .update({ status: 'open' })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Error reopening receipt:', error);
        res.status(500).json({ message: 'Error reopening receipt' });
    }
});

// Delete Receipt (Admin only)
router.delete('//api/receipts/:id', verifyToken, hasPermission('delete_ingresos'), verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    try {
        // Soft delete receipt
        const { error } = await supabase
            .from('receipts')
            .update({ deleted_at: new Date() })
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Recibo borrado correctamente' });
    } catch (error) {
        console.error('Error deleting receipt:', error);
        res.status(500).json({ message: 'Error deleting receipt' });
    }
});

// Update Receipt Item (Manual override)
router.put('//api/receipts/:id/items/:itemId', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id, itemId } = req.params;
    const { expected_quantity, scanned_quantity } = req.body;

    try {
        // Fetch existing for history
        const { data: oldItem } = await supabase
            .from('receipt_items')
            .select('*')
            .eq('id', itemId)
            .single();

        const { data, error } = await supabase
            .from('receipt_items')
            .update({ expected_quantity, scanned_quantity })
            .eq('id', itemId)
            .eq('receipt_id', id)
            .select();

        if (error) throw error;

        // Log History
        if (oldItem) {
            const hasChanged = Number(oldItem.expected_quantity) !== Number(expected_quantity) || Number(oldItem.scanned_quantity) !== Number(scanned_quantity);
            console.log(`[DEBUG_HISTORY] Manual Override - Changed: ${hasChanged}`);
            console.log(`[DEBUG_HISTORY] Old: Esp=${oldItem.expected_quantity}, Ctr=${oldItem.scanned_quantity}`);
            console.log(`[DEBUG_HISTORY] New: Esp=${expected_quantity}, Ctr=${scanned_quantity}`);

            if (hasChanged) {
                const { error: historyError } = await supabase.from('receipt_items_history').insert({
                    receipt_id: id,
                    user_id: req.user.id,
                    operation: 'MANUAL_OVERRIDE',
                    product_code: oldItem.product_code,
                    old_data: { expected_quantity: oldItem.expected_quantity, scanned_quantity: oldItem.scanned_quantity },
                    new_data: { expected_quantity, scanned_quantity },
                    changed_at: new Date().toISOString()
                });

                if (historyError) {
                    console.error('[DEBUG_HISTORY] Error inserting history (Manual Override):', historyError);
                } else {
                    console.log('[DEBUG_HISTORY] History insertion successful (Manual Override)');
                }
            } else {
                console.log('[DEBUG_HISTORY] No changes detected, skipping history log.');
            }
        } else {
            console.log('[DEBUG_HISTORY] Old item not found for history logging.');
        }

        res.json(data[0]);

    } catch (error) {
        console.error('Error updating receipt item:', error);
        res.status(500).json({ message: 'Error updating item' });
    }
});

// Update Barcode and log history for a specific receipt
router.post('//api/receipt-items-history/barcode', verifyToken, async (req, res) => {
    const { receipt_id, product_code, new_barcode, old_barcode } = req.body;

    if (!receipt_id || !product_code || !new_barcode) {
        return res.status(400).json({ message: 'Faltan campos (receipt_id, product_code, new_barcode)' });
    }

    try {
        // Log History explicitly for the receipt
        const { error: historyError } = await supabase.from('receipt_items_history').insert({
            receipt_id: receipt_id,
            user_id: req.user.id,
            operation: 'UPDATE_BARCODE',
            product_code: product_code,
            old_data: { barcode: old_barcode || null },
            new_data: { barcode: new_barcode },
            changed_at: new Date().toISOString()
        });

        if (historyError) {
            console.error('[DEBUG_HISTORY] Error inserting history (Barcode Update):', historyError);
            return res.status(500).json({ message: 'Error al guardar el historial del código de barras en el remito' });
        }

        console.log('[DEBUG_HISTORY] History insertion successful (Barcode Update)');
        res.status(201).json({ message: 'Historial guardado exitosamente' });

    } catch (error) {
        console.error('Error recording barcode update history for receipt:', error);
        res.status(500).json({ message: 'Error general de servidor al guardar historial' });
    }
});

// Get Receipt History
router.get('//api/receipt-history/:id', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    try {
        // Fetch ALL history for this receipt using pagination to bypass 1000 record limit
        let history = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('receipt_items_history')
                .select('*')
                .eq('receipt_id', id)
                .order('changed_at', { ascending: false })
                .range(from, from + step - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                history = [...history, ...data];
                from += step;
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        // Enrich with usernames and product descriptions
        const userIds = [...new Set(history.map(h => h.user_id).filter(Boolean))];
        const productCodes = [...new Set(history.map(h => h.product_code).filter(Boolean))];

        const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
        const products = await fetchProductsByCodes(productCodes);

        const userMap = {};
        if (users) users.forEach(u => userMap[u.id] = u.username);

        const productMap = {};
        if (products) products.forEach(p => {
            productMap[p.code] = {
                description: p.description,
                provider_code: p.provider_code
            };
        });

        const enrichedHistory = history.map(entry => {
            const product = productMap[entry.product_code] || { description: 'Sin descripción', provider_code: null };
            return {
                ...entry,
                username: userMap[entry.user_id] || 'Desconocido',
                description: product.description,
                provider_code: product.provider_code
            };
        });

        res.json(enrichedHistory);
    } catch (error) {
        console.error('Error fetching receipt history:', error);
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// Export Receipt History to Excel
router.get('//api/receipt-history/:id/export', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    try {
        // Fetch ALL history for this receipt using pagination to bypass 1000 record limit
        let history = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('receipt_items_history')
                .select('*')
                .eq('receipt_id', id)
                .order('changed_at', { ascending: false })
                .range(from, from + step - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                history = [...history, ...data];
                from += step;
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        const userIds = [...new Set(history.map(h => h.user_id).filter(Boolean))];
        const productCodes = [...new Set(history.map(h => h.product_code).filter(Boolean))];

        const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
        const products = await fetchProductsByCodes(productCodes);

        const userMap = {};
        if (users) users.forEach(u => userMap[u.id] = u.username);

        const productMap = {};
        if (products) products.forEach(p => {
            productMap[p.code] = { description: p.description, provider_code: p.provider_code };
        });

        const exportData = history.map(entry => {
            const product = productMap[entry.product_code] || { description: 'Sin descripción', provider_code: null };
            let operacion = 'Otro';
            if (entry.operation === 'INSERT_EXPECTED' || entry.operation === 'UPDATE_EXPECTED') operacion = 'Esperado';
            else if (entry.operation === 'INSERT_SCANNED' || entry.operation === 'UPDATE_SCANNED') operacion = 'Control';
            else if (entry.operation === 'MANUAL_OVERRIDE') operacion = 'Manual';
            else if (entry.operation === 'UPDATE_BARCODE') operacion = 'Cód Barras';

            return {
                'Fecha y Hora': new Date(entry.changed_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
                'Usuario': userMap[entry.user_id] || 'Desconocido',
                'Operación': operacion,
                'Código': entry.product_code,
                'Proveedor': product.provider_code || '-',
                'Descripción': product.description,
                'Esp. Anterior': entry.old_data?.expected_quantity ?? '-',
                'Esp. Nuevo': entry.new_data?.expected_quantity ?? '-',
                'Cont. Anterior': entry.old_data?.scanned_quantity ?? '-',
                'Cont. Nuevo': entry.new_data?.scanned_quantity ?? '-'
            };
        });

        const workbook = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(exportData);
        xlsx.utils.book_append_sheet(workbook, ws, "Historial Ingreso");

        const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="Historial_Ingreso_${id}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (error) {
        console.error('Error exporting receipt history:', error);
        res.status(500).json({ message: 'Error generatig history excel' });
    }
});

// Export Receipt to Excel
router.get('//api/receipts/:id/export', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', id)
            .single();

        if (receiptError) throw receiptError;

        const { data: items, error: itemsError } = await supabase
            .from('receipt_items')
            .select(`
                *,
                products (
                    description,
                    code,
                    provider_code
                )
            `)
            .eq('receipt_id', id);

        if (itemsError) throw itemsError;

        const xlsx = require('xlsx');
        const workbook = xlsx.utils.book_new();

        const data = items.map(item => ({
            'Código Interno': item.product_code,
            'Código Proveedor': item.products?.provider_code || '-',
            'Descripción': item.products?.description || 'Sin descripción',
            'Cant. Esperada': Number(item.expected_quantity) || 0,
            'Cant. Controlada': Number(item.scanned_quantity) || 0,
            'Diferencia': (Number(item.scanned_quantity) || 0) - (Number(item.expected_quantity) || 0)
        }));

        const worksheet = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Detalle Remito');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Remito_${receipt.remito_number}.xlsx`);
        res.send(buffer);

    } catch (error) {
        console.error('Error exporting receipt:', error);
        res.status(500).json({ message: 'Error al exportar remito' });
    }
});

// Export Receipt Differences to Excel
router.get('//api/receipts/:id/export-differences', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', id)
            .single();

        if (receiptError) throw receiptError;

        const { data: items, error: itemsError } = await supabase
            .from('receipt_items')
            .select(`
                *,
                products (
                    description,
                    code,
                    provider_code
                )
            `)
            .eq('receipt_id', id);

        if (itemsError) throw itemsError;

        // Filter only differences
        const diffItems = items.filter(item => {
            const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
            return diff !== 0;
        });

        if (diffItems.length === 0) {
            return res.status(400).json({ message: 'No hay diferencias para exportar' });
        }

        const xlsx = require('xlsx');
        const workbook = xlsx.utils.book_new();

        const data = diffItems.map(item => {
            const diff = (Number(item.scanned_quantity) || 0) - (Number(item.expected_quantity) || 0);
            return {
                'Código Interno': item.product_code,
                'Código Proveedor': item.products?.provider_code || '-',
                'Descripción': item.products?.description || 'Sin descripción',
                'Cant. Esperada': Number(item.expected_quantity) || 0,
                'Cant. Controlada': Number(item.scanned_quantity) || 0,
                'Diferencia': diff,
                'Estado': diff > 0 ? `Sobra ${diff}` : `Falta ${Math.abs(diff)}`
            };
        });

        const worksheet = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Diferencias');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Diferencias_Remito_${receipt.remito_number}.xlsx`);
        res.send(buffer);

    } catch (error) {
        console.error('Error exporting differences:', error);
        res.status(500).json({ message: 'Error al exportar diferencias' });
    }
});

// Export scanned items from one receipt to another receipt's expected items
router.post('//api/receipts/:id/export-to-receipt', verifyToken, verifyBranchAccess('receipts'), async (req, res) => {
    const { id } = req.params;
    const { targetReceiptId } = req.body;

    if (!targetReceiptId) return res.status(400).json({ message: 'Falta targetReceiptId' });
    if (targetReceiptId === id) return res.status(400).json({ message: 'El ingreso destino debe ser diferente al actual' });

    try {
        // Check target receipt exists and is open
        const { data: targetReceipt, error: targetError } = await supabase
            .from('receipts')
            .select('id, remito_number, status')
            .eq('id', targetReceiptId)
            .single();

        if (targetError || !targetReceipt) return res.status(404).json({ message: 'Ingreso destino no encontrado' });
        if (targetReceipt.status === 'finalized') return res.status(400).json({ message: 'El ingreso destino está finalizado' });

        // Get scanned items from source receipt
        const { data: sourceItems, error: sourceError } = await supabase
            .from('receipt_items')
            .select('product_code, scanned_quantity')
            .eq('receipt_id', id)
            .gt('scanned_quantity', 0);

        if (sourceError) throw sourceError;
        if (!sourceItems || sourceItems.length === 0) return res.status(400).json({ message: 'No hay productos controlados para exportar' });

        // Upsert each item into target receipt
        let exportedCount = 0;
        for (const item of sourceItems) {
            const { data: existing } = await supabase
                .from('receipt_items')
                .select('id, expected_quantity')
                .eq('receipt_id', targetReceiptId)
                .eq('product_code', item.product_code)
                .maybeSingle();

            const newExpected = (Number(existing?.expected_quantity) || 0); // User requested only to update scanned, not expected
            const newScanned = (Number(existing?.scanned_quantity) || 0) + Number(item.scanned_quantity);

            const { error: upsertError } = await supabase
                .from('receipt_items')
                .upsert({
                    receipt_id: targetReceiptId,
                    product_code: item.product_code,
                    expected_quantity: newExpected,
                    scanned_quantity: newScanned
                }, { onConflict: 'receipt_id, product_code' });

            if (!upsertError) {
                exportedCount++;
                // Log history
                await supabase.from('receipt_items_history').insert({
                    receipt_id: targetReceiptId,
                    user_id: req.user.id,
                    operation: existing ? 'UPDATE_EXPECTED_SCANNED' : 'INSERT_EXPECTED_SCANNED',
                    product_code: item.product_code,
                    old_data: {
                        expected_quantity: Number(existing?.expected_quantity) || 0,
                        scanned_quantity: Number(existing?.scanned_quantity) || 0
                    },
                    new_data: {
                        expected_quantity: newExpected,
                        scanned_quantity: newScanned
                    },
                    changed_at: new Date().toISOString()
                });
            }
        }

        res.json({ exported: exportedCount, total: sourceItems.length, targetRemito: targetReceipt.remito_number });
    } catch (error) {
        console.error('Error exporting to receipt:', error);
        res.status(500).json({ message: 'Error al exportar productos' });
    }
});

// Create Receipt via PDF Upload (Handles Normal and Overstock)
router.post('//api/receipts/upload', verifyToken, multer({ storage: multer.memoryStorage() }).any(), async (req, res) => {
    const files = req.files || [];
    const pdfFiles = files.filter(f => f.fieldname === 'pdf' || f.fieldname === 'file');
    const type = req.body.type || 'normal'; // 'normal' or 'overstock'

    if (pdfFiles.length === 0) {
        return res.status(400).json({ message: 'No se recibió ningún archivo PDF' });
    }

    try {
        let allExtractedItems = [];
        let firstRemitoNumber = null;

        for (const file of pdfFiles) {
            try {
                let items = [];
                let metadata = null;

                // For NORMAL receipts, we use AI PRIORITY as requested
                if (type === 'normal' && process.env.GEMINI_API_KEY) {
                    console.log(`[RECEIPT PDF] Processing NORMAL receipt with AI: ${file.originalname}`);
                    try {
                        const pdfParts = [{
                            inlineData: {
                                data: file.buffer.toString("base64"),
                                mimeType: "application/pdf"
                            },
                        }];

                        const prompt = `
                            Eres un experto en extracción de datos de remitos de proveedores.
                            Analiza el PDF adjunto y extrae TODOS los productos listados en la tabla.
                            
                            REGLAS CRÍTICAS:
                            1. Devuelve SOLO un array JSON válido de objetos.
                            2. Cada objeto DEBE tener: "code" (string), "quantity" (number), "description" (string).
                            3. El "code" es el código del producto del PROVEEDOR.
                            4. La "quantity" es la cantidad enviada.
                            5. La "description" es el nombre del producto tal como figura en el remito.
                            6. Extrae TODOS los productos.
                            
                            Formato esperado:
                            [
                              {"code": "123456", "quantity": 10, "description": "PRODUCTO EJEMPLO"},
                              ...
                            ]
                        `;

                        const aiResult = await model.generateContent([prompt, ...pdfParts]);
                        const aiResponse = await aiResult.response;
                        const aiResultText = aiResponse.text();

                        const jsonMatch = aiResultText.match(/\[[\s\S]*\]/);
                        if (jsonMatch) {
                            items = JSON.parse(jsonMatch[0]);
                        }
                    } catch (aiError) {
                        console.error('[RECEIPT PDF] AI failed for normal receipt, falling back to regex:', aiError.message);
                        const result = await parseRemitoPdf(file.buffer, true);
                        items = result.items;
                        metadata = result.metadata;
                    }
                } else {
                    // For OVERSTOCK or if AI is unavailable, use Regex + IA Fallback
                    let result = await parseRemitoPdf(file.buffer, true);
                    items = result.items;
                    metadata = result.metadata;
                    
                    if ((!items || items.length === 0) && process.env.GEMINI_API_KEY) {
                        console.log(`[RECEIPT PDF] No items found in ${file.originalname} with regex. Falling back to Gemini AI...`);
                        try {
                            const pdfParts = [{
                                inlineData: {
                                    data: file.buffer.toString("base64"),
                                    mimeType: "application/pdf"
                                },
                            }];

                            const prompt = `
                                Eres un experto en extracción de datos de remitos.
                                Analiza el PDF adjunto y extrae TODOS los productos listados.
                                
                                REGLAS CRÍTICAS:
                                1. Devuelve SOLO un array JSON válido de objetos.
                                2. Cada objeto DEBE tener: "code" (string), "quantity" (number), "description" (string).
                                3. El "code" es el código que aparece en el remito (Código Interno si es sobrestock).
                                4. La "quantity" es la cantidad.
                                5. La "description" es el nombre del producto.
                                
                                Formato esperado:
                                [
                                  {"code": "123456", "quantity": 10, "description": "PRODUCTO EJEMPLO"},
                                  ...
                                ]
                            `;

                            const aiResult = await model.generateContent([prompt, ...pdfParts]);
                            const aiResponse = await aiResult.response;
                            const aiResultText = aiResponse.text();

                            const jsonMatch = aiResultText.match(/\[[\s\S]*\]/);
                            if (jsonMatch) {
                                items = JSON.parse(jsonMatch[0]);
                            }
                        } catch (aiError) {
                            console.error('[RECEIPT PDF] Gemini fallback failed:', aiError.message);
                        }
                    }
                }

                if (items && items.length > 0) {
                    // Aggregate items: sum quantities if code is same
                    items.forEach(item => {
                        const existingIdx = allExtractedItems.findIndex(i => i.code === item.code);
                        if (existingIdx !== -1) {
                            allExtractedItems[existingIdx].quantity += item.quantity;
                        } else {
                            allExtractedItems.push({ ...item });
                        }
                    });

                    if (!firstRemitoNumber) {
                        firstRemitoNumber = metadata?.remitoNumber || file.originalname.replace(/\.pdf$/i, '');
                    }
                }
            } catch (err) {
                console.error(`Error parsing file ${file.originalname}:`, err);
            }
        }

        if (allExtractedItems.length === 0) {
            return res.status(400).json({ message: 'No se pudieron extraer productos de los PDFs proporcionados' });
        }

        const manualRemitoNumber = req.body.remitoNumber;
        const remitoNumber = manualRemitoNumber 
            ? manualRemitoNumber 
            : (pdfFiles.length > 1 ? `${firstRemitoNumber} (+${pdfFiles.length - 1} PDFS)` : firstRemitoNumber);

        // 2. Check for duplicate to avoid double creation if possible
        const { data: existing } = await supabase
            .from('receipts')
            .select('id')
            .eq('remito_number', remitoNumber)
            .is('deleted_at', null)
            .maybeSingle();

        if (existing) {
            return res.status(400).json({ message: `El remito ${remitoNumber} ya existe.` });
        }

        // 3. Create Receipt
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .insert([{
                remito_number: remitoNumber,
                type: type,
                created_by: req.user.username,
                sucursal_id: req.user.sucursal_id || null,
                date: new Date()
            }])
            .select()
            .single();

        if (receiptError) throw receiptError;

        // Product Matching Logic according to Type
        const results = { success: [], failed: [] };
        const uniqueCodes = allExtractedItems.map(i => i.code);
        
        let productMap = new Map();

        if (type === 'overstock') {
            // SOBRESTOCK: Match ONLY by Internal Code
            const { data: foundProducts, error: prodError } = await supabase
                .from('products')
                .select('code, description, provider_description, provider_code')
                .in('code', uniqueCodes);
            
            if (prodError) throw prodError;
            if (foundProducts) foundProducts.forEach(p => productMap.set(p.code, p));
        } else {
            // NORMAL: Match by Provider Code first, then handle fallback to description later
            const { data: foundProducts, error: prodError } = await supabase
                .from('products')
                .select('code, description, provider_description, provider_code')
                .in('provider_code', uniqueCodes);
            
            if (prodError) throw prodError;
            if (foundProducts) foundProducts.forEach(p => productMap.set(p.provider_code, p));
        }

        const itemsToInsert = [];
        const historyToInsert = [];
        
        for (const item of allExtractedItems) {
            let product = productMap.get(item.code);
            
            // Try stripping leading zeros if not found (mostly for provider codes)
            if (!product) {
                const stripped = item.code.replace(/^0+/, '');
                if (stripped && stripped !== item.code) {
                    product = productMap.get(stripped);
                }
            }
            
            // If NORMAL and still no product, try by provider_description (High Precision match)
            if (!product && type === 'normal' && item.description) {
                const cleanDesc = item.description.trim().replace(/\s+/g, ' ');
                const { data: matches } = await supabase
                    .from('products')
                    .select('code, description')
                    .ilike('provider_description', `%${cleanDesc}%`)
                    .limit(1);
                
                if (matches && matches.length > 0) product = matches[0];
            }
            
            if (!product) {
                results.failed.push({
                    code: item.code,
                    description: item.description,
                    quantity: item.quantity,
                    error: 'Producto no encontrado'
                });
                continue;
            }

            itemsToInsert.push({
                receipt_id: receipt.id,
                product_code: product.code,
                expected_quantity: item.quantity,
                scanned_quantity: 0
            });

            historyToInsert.push({
                receipt_id: receipt.id,
                user_id: req.user.id,
                operation: 'PDF_IMPORT',
                product_code: product.code,
                new_data: { expected_quantity: item.quantity },
                changed_at: new Date().toISOString()
            });

            results.success.push({ code: product.code, description: product.description, quantity: item.quantity });
        }

        // Perform bulk inserts
        if (itemsToInsert.length > 0) {
            const { error: batchItemError } = await supabase
                .from('receipt_items')
                .insert(itemsToInsert);
            if (batchItemError) throw batchItemError;
        }

        if (historyToInsert.length > 0) {
            const { error: batchHistoryError } = await supabase
                .from('receipt_items_history')
                .insert(historyToInsert);
            if (batchHistoryError) throw batchHistoryError;
        }

        res.status(201).json({ receipt, results });
    } catch (error) {
        console.error('Error creating overstock receipt:', error);
        res.status(500).json({ message: 'Error al procesar el PDF de sobrestock' });
    }
});



module.exports = router;
