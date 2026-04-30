const supabase = require('../services/supabaseClient');

exports.getPendingTransfers = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
        let query = supabase
            .from('egresos')
            .select(`
                *,
                sucursal:sucursales (name)
            `, { count: 'exact' })
            .eq('status', 'finalized')
            .is('receipt_id', null)
            .order('date', { ascending: false });

        // If user is not admin/superadmin, filter by their branch
        if (!['superadmin', 'admin'].includes(req.user.role) && req.user.sucursal_id) {
            query = query.eq('sucursal_id', req.user.sucursal_id);
        }

        const { data, error, count } = await query.range(from, to);
        if (error) throw error;
        
        res.json({
            data,
            total: count,
            page,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (error) {
        console.error('Error fetching pending transfers:', error);
        res.status(500).json({ message: 'Error al obtener transferencias pendientes' });
    }
};

exports.receiveTransfer = async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Get egreso and its items
        const { data: egreso, error: egresoError } = await supabase
            .from('egresos')
            .select('*')
            .eq('id', id)
            .single();

        if (egresoError || !egreso) {
            return res.status(404).json({ message: 'Egreso no encontrado' });
        }

        if (egreso.status !== 'finalized') {
            return res.status(400).json({ message: 'Solamente se pueden recibir egresos finalizados' });
        }

        if (egreso.receipt_id) {
            return res.status(400).json({ message: 'Este egreso ya ha sido recibido' });
        }

        const { data: egresoItems, error: itemsError } = await supabase
            .from('egreso_items')
            .select('*')
            .eq('egreso_id', id)
            .gt('scanned_quantity', 0); // Only items that were actually sent

        if (itemsError) throw itemsError;

        if (!egresoItems || egresoItems.length === 0) {
            return res.status(400).json({ message: 'El egreso no tiene productos controlados para recibir' });
        }

        // 2. Create new receipt
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .insert([{
                remito_number: `REC-${egreso.reference_number}`,
                type: 'sucursal_transfer',
                created_by: req.user.username,
                sucursal_id: req.user.sucursal_id || egreso.sucursal_id,
                date: new Date()
            }])
            .select()
            .single();

        if (receiptError) throw receiptError;

        // 3. Copy items to receipt_items, preserving original expected quantity and reason from warehouse
        const receiptItems = egresoItems.map(item => ({
            receipt_id: receipt.id,
            product_code: item.product_code,
            expected_quantity: item.scanned_quantity, // Lo que el depósito dice que mandó
            origin_expected_quantity: item.expected_quantity, // Lo que se pidió originalmente
            origin_shortage_reason: item.shortage_reason, // El motivo si hubo faltante
            scanned_quantity: 0
        }));

        const { error: batchError } = await supabase
            .from('receipt_items')
            .insert(receiptItems);

        if (batchError) throw batchError;

        // 4. Link egreso to receipt
        const { error: updateError } = await supabase
            .from('egresos')
            .update({ receipt_id: receipt.id })
            .eq('id', id);

        if (updateError) throw updateError;

        // 5. Log history for the new receipt
        for (const item of receiptItems) {
            await supabase.from('receipt_items_history').insert({
                receipt_id: receipt.id,
                user_id: req.user.id,
                operation: 'TRANSFER_IMPORT',
                product_code: item.product_code,
                new_data: { expected_quantity: item.expected_quantity },
                changed_at: new Date().toISOString()
            });
        }

        res.status(201).json(receipt);

    } catch (error) {
        console.error('Error receiving transfer:', error);
        res.status(500).json({ message: 'Error al procesar la recepción' });
    }
};

exports.getTransferReceipts = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
        let query = supabase
            .from('receipts')
            .select('*', { count: 'exact' })
            .eq('type', 'sucursal_transfer')
            .is('deleted_at', null)
            .order('date', { ascending: false });

        // Filter by branch for non-admin roles
        if (!['superadmin', 'admin'].includes(req.user.role) && req.user.sucursal_id) {
            query = query.eq('sucursal_id', req.user.sucursal_id);
        }

        const { data, error, count } = await query.range(from, to);
        if (error) throw error;

        res.json({
            data,
            total: count,
            page,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (error) {
        console.error('Error fetching branch transfer receipts:', error);
        res.status(500).json({ message: 'Error al obtener los ingresos de sucursal' });
    }
};

exports.receiveMultipleTransfers = async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'No se enviaron IDs de transferencias' });
    }

    try {
        // 1. Get all egresos
        const { data: egresos, error: egresosError } = await supabase
            .from('egresos')
            .select('*')
            .in('id', ids);

        if (egresosError) throw egresosError;
        if (!egresos || egresos.length === 0) {
            return res.status(404).json({ message: 'Egresos no encontrados' });
        }

        // Validate all are finalized and not received
        for (const egreso of egresos) {
            if (egreso.status !== 'finalized') {
                return res.status(400).json({ message: `El egreso ${egreso.reference_number} no está finalizado` });
            }
            if (egreso.receipt_id) {
                return res.status(400).json({ message: `El egreso ${egreso.reference_number} ya ha sido recibido` });
            }
        }

        // 2. Get all items for these egresos
        const { data: egresoItems, error: itemsError } = await supabase
            .from('egreso_items')
            .select('*')
            .in('egreso_id', ids)
            .gt('scanned_quantity', 0);

        if (itemsError) throw itemsError;
        if (!egresoItems || egresoItems.length === 0) {
            return res.status(400).json({ message: 'Los egresos seleccionados no tienen productos para recibir' });
        }

        // 3. Aggregate items by product_code
        const aggregatedItems = {};
        egresoItems.forEach(item => {
            if (!aggregatedItems[item.product_code]) {
                aggregatedItems[item.product_code] = {
                    product_code: item.product_code,
                    expected_quantity: 0
                };
            }
            aggregatedItems[item.product_code].expected_quantity += item.scanned_quantity;
        });

        // 4. Create new receipt
        // Create a combined reference string
        const combinedReference = egresos.map(e => e.reference_number).join(', ');
        const truncatedRef = combinedReference.length > 50 ? combinedReference.substring(0, 47) + '...' : combinedReference;

        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .insert([{
                remito_number: `MULTI-${truncatedRef}`,
                type: 'sucursal_transfer',
                created_by: req.user.username,
                sucursal_id: req.user.sucursal_id || egresos[0].sucursal_id,
                date: new Date()
            }])
            .select()
            .single();

        if (receiptError) throw receiptError;

        // 5. Insert aggregated items
        const receiptItems = Object.values(aggregatedItems).map(item => ({
            receipt_id: receipt.id,
            product_code: item.product_code,
            expected_quantity: item.expected_quantity,
            scanned_quantity: 0
        }));

        const { error: batchError } = await supabase
            .from('receipt_items')
            .insert(receiptItems);

        if (batchError) throw batchError;

        // 6. Link all egresos to receipt
        const { error: updateError } = await supabase
            .from('egresos')
            .update({ receipt_id: receipt.id })
            .in('id', ids);

        if (updateError) throw updateError;

        // 7. Log history
        for (const item of receiptItems) {
            await supabase.from('receipt_items_history').insert({
                receipt_id: receipt.id,
                user_id: req.user.id,
                operation: 'TRANSFER_IMPORT',
                product_code: item.product_code,
                new_data: { expected_quantity: item.expected_quantity },
                changed_at: new Date().toISOString()
            });
        }

        res.status(201).json(receipt);

    } catch (error) {
        console.error('Error receiving multiple transfers:', error);
        res.status(500).json({ message: 'Error al procesar la recepción múltiple' });
    }
};

exports.attachTransferToReceipt = async (req, res) => {
    const { receiptId } = req.params;
    const { transferId } = req.body;

    if (!receiptId || !transferId) {
        return res.status(400).json({ message: 'Faltan parámetros (receiptId, transferId)' });
    }

    try {
        // 1. Get receipt
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', receiptId)
            .single();

        if (receiptError || !receipt) return res.status(404).json({ message: 'Ingreso no encontrado' });
        if (receipt.status === 'finalized') return res.status(400).json({ message: 'El ingreso ya está finalizado' });

        // 2. Get transfer (egreso)
        const { data: egreso, error: egresoError } = await supabase
            .from('egresos')
            .select('*')
            .eq('id', transferId)
            .single();

        if (egresoError || !egreso) return res.status(404).json({ message: 'Transferencia no encontrada' });
        if (egreso.receipt_id) return res.status(400).json({ message: 'Esta transferencia ya ha sido recibida' });

        // 3. Get items from transfer
        const { data: egresoItems, error: itemsError } = await supabase
            .from('egreso_items')
            .select('*')
            .eq('egreso_id', transferId)
            .gt('scanned_quantity', 0);

        if (itemsError) throw itemsError;

        // 4. Merge items into receipt_items
        for (const item of egresoItems) {
            const { data: existing } = await supabase
                .from('receipt_items')
                .select('*')
                .eq('receipt_id', receiptId)
                .eq('product_code', item.product_code)
                .maybeSingle();

            const newExpected = (Number(existing?.expected_quantity) || 0) + Number(item.scanned_quantity);
            const newScanned = (Number(existing?.scanned_quantity) || 0);

            await supabase
                .from('receipt_items')
                .upsert({
                    receipt_id: receiptId,
                    product_code: item.product_code,
                    expected_quantity: newExpected,
                    scanned_quantity: newScanned
                }, { onConflict: 'receipt_id, product_code' });

            // Log history
            await supabase.from('receipt_items_history').insert({
                receipt_id: receiptId,
                user_id: req.user.id,
                operation: 'TRANSFER_IMPORT',
                product_code: item.product_code,
                new_data: { expected_quantity: newExpected },
                changed_at: new Date().toISOString()
            });
        }

        // 5. Update receipt remito_number (append new ref)
        let newRemitoNumber = receipt.remito_number;
        if (!newRemitoNumber.includes(egreso.reference_number)) {
            newRemitoNumber = `${newRemitoNumber}, ${egreso.reference_number}`;
            if (newRemitoNumber.length > 255) {
                newRemitoNumber = newRemitoNumber.substring(0, 252) + '...';
            }
        }

        await supabase
            .from('receipts')
            .update({ remito_number: newRemitoNumber })
            .eq('id', receiptId);

        // 6. Link egreso to receipt
        await supabase
            .from('egresos')
            .update({ receipt_id: receiptId })
            .eq('id', transferId);

        res.json({ message: 'Transferencia adjuntada correctamente', remito_number: newRemitoNumber });

    } catch (error) {
        console.error('Error attaching transfer:', error);
        res.status(500).json({ message: 'Error al adjuntar la transferencia' });
    }
};
