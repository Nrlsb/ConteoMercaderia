const express = require('express');
const router = express.Router();

const supabase = require('../services/supabaseClient');
const { verifyToken, verifyAdmin, verifySuperAdmin, hasPermission, verifyBranchAccess } = require('../middleware/auth');
const multer = require('multer');
const xlsx = require('xlsx');
const { fetchProductsByCodes, findProductByAnyCode } = require('../utils/dbHelpers');
const { parseRemitoPdf } = require('../pdfParser');
const { parseExcelXml } = require('../xmlParser');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI model
let genAI = null;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}


// --- EGRESOS (OUTGOING MERCHANDISE) ROUTES ---

// Create Egreso via PDF Upload (auto-create)
router.post('/upload-pdf', verifyToken, multer({ storage: multer.memoryStorage() }).any(), async (req, res) => {
    const files = req.files || [];
    const pdfFiles = files.filter(f => f.fieldname === 'pdf' || f.fieldname === 'file');
    const firstPdf = pdfFiles.length > 0 ? pdfFiles[0] : null;

    if (!firstPdf) {
        console.error('[EGRESO PDF] No se recibió ningún archivo. Fields received:', Object.keys(req.files || {}));
        return res.status(400).json({ message: 'No se recibió ningún archivo PDF (esperado campo "pdf" o "file")' });
    }

    try {
        // 1. Parse PDF
        let items = [];
        let metadata = null;
        let textSnippet = '';
        let isDevolucion = false;
        let isTransferencia = false;
        let isRemito = false;

        // Si es una subida a un egreso existente, solo procesamos los archivos para el storage
        // pero NO extraemos items si ya existen.
        // Sin embargo, para mantener la compatibilidad, procesamos el primero para el referenceNumber si es nuevo.
        if (firstPdf) {
            const parsed = await parseRemitoPdf(firstPdf.buffer);
            items = parsed.items;
            metadata = parsed.metadata;
            textSnippet = parsed.textSnippet;
            isDevolucion = parsed.isDevolucion;
            isTransferencia = parsed.isTransferencia;
            isRemito = parsed.isRemito;
        }

        // Stricter validation for 14-digit system files: Must contain the word "REMITO"
        const nameWithoutExt = firstPdf.originalname.replace(/\.pdf$/i, '');
        if (/^\d{14}$/.test(nameWithoutExt) && !isRemito) {
            console.log(`[EGRESO PDF] Documento omitido por seguridad (Nombre de 14 dígitos sin la palabra REMITO): ${firstPdf.originalname}`);
            return res.status(400).json({
                message: `El archivo "${firstPdf.originalname}" no parece ser un remito válido (formato genérico y sin la palabra REMITO).`
            });
        }

        // FALLBACK TO GEMINI if no items found (likely a scan or non-standard format)
        if ((!items || items.length === 0) && genAI) {
            console.log('[EGRESO PDF] No items found with regex. Falling back to Gemini AI...');
            try {
                const pdfParts = [{
                    inlineData: {
                        data: firstPdf.buffer.toString("base64"),
                        mimeType: "application/pdf"
                    },
                }];

                const prompt = `
                    Eres un experto en extracción de datos de remitos de logística para EGRESOS (salida de mercadería).
                    Analiza el PDF adjunto y extrae TODOS los productos listados en la tabla del remito.
                    
                    REGLAS CRÍTICAS:
                    1. Devuelve SOLO un array JSON válido de objetos.
                    2. Cada objeto DEBE tener: "code" (string), "quantity" (number), "description" (string).
                    3. El "code" es el código del producto (Código Interno).
                    4. La "quantity" es la cantidad pedida/enviada.
                    5. La "description" es el nombre del producto.
                    6. Extrae TODOS los productos. No te detengas hasta haber procesado toda la tabla.
                    7. Ignora encabezados, totales, firmas o notas que no sean ítems de la tabla.
                    8. Si hay marcas manuscritas (como tildes o números escritos a mano al lado de la cantidad), dales prioridad si indican una cantidad controlada.
                    9. Sé extremadamente preciso con los códigos numéricos.
                    
                    Formato esperado:
                    [
                      {"code": "123456", "quantity": 10, "description": "PRODUCTO EJEMPLO"},
                      ...
                    ]
                `;

                const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                const aiResult = await aiModel.generateContent([prompt, ...pdfParts]);
                const aiResponse = await aiResult.response;
                const aiResultText = aiResponse.text();

                const jsonMatch = aiResultText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const aiItems = JSON.parse(jsonMatch[0]);
                    if (aiItems && aiItems.length > 0) {
                        items = aiItems;
                        console.log(`[EGRESO PDF] Gemini successfully extracted ${items.length} items.`);
                    }
                }
            } catch (aiError) {
                console.error('[EGRESO PDF] Gemini fallback failed:', aiError.message);
            }
        }

        if (!items || items.length === 0) {
            console.error('[EGRESO PDF] No se pudieron extraer productos del archivo:', firstPdf.originalname);
            const errorMsg = !isRemito
                ? `El archivo "${firstPdf.originalname}" no parece ser un remito válido (no contiene la palabra "REMITO").`
                : `No se pudieron extraer productos del PDF (${firstPdf.originalname}). Verifique que el formato sea el correcto o que el archivo no esté corrupto.`;

            return res.status(400).json({
                message: errorMsg,
                debug: {
                    textLength: textSnippet?.length || 0,
                    preview: textSnippet ? textSnippet.substring(0, 100) : 'N/A',
                    isRemito
                }
            });
        }

        // 2. Create Egreso automatically with metadata (Client Name + Remito Number) or filename as fallback
        let referenceNumber = '';
        if (metadata && metadata.clientName && metadata.remitoNumber) {
            referenceNumber = `${metadata.clientName} ${metadata.remitoNumber}`;
        } else if (firstPdf) {
            referenceNumber = firstPdf.originalname.replace('.pdf', '').replace('.PDF', '');
        }

        let sucursalId = req.user.sucursal_id || req.body.sucursal_id || null;

        // Intentar detectar sucursal de destino por nombre (clientName del PDF)
        if (metadata && metadata.clientName) {
            const { data: branchMatch } = await supabase
                .from('sucursales')
                .select('id, name')
                .ilike('name', metadata.clientName)
                .maybeSingle();

            if (branchMatch) {
                console.log(`[EGRESO PDF] Destino detectado: ${branchMatch.name} (ID: ${branchMatch.id})`);
                sucursalId = branchMatch.id;
            } else {
                // Intento secundario: buscar coincidencias parciales
                const { data: allBranches } = await supabase.from('sucursales').select('id, name');
                if (allBranches) {
                    const bestMatch = allBranches.find(b =>
                        b.name !== 'Deposito' && (
                            metadata.clientName.toLowerCase().includes(b.name.toLowerCase()) ||
                            b.name.toLowerCase().includes(metadata.clientName.toLowerCase())
                        )
                    );
                    if (bestMatch) {
                        console.log(`[EGRESO PDF] Destino detectado por coincidencia parcial: ${bestMatch.name}`);
                        sucursalId = bestMatch.id;
                    }
                }
            }
        }

        // Check for duplicate reference to avoid double uploads
        const { data: existingEgreso, error: checkError } = await supabase
            .from('egresos')
            .select('id, reference_number')
            .eq('reference_number', referenceNumber)
            .maybeSingle();

        if (checkError) {
            console.error('[EGRESO PDF] Error checking for duplicate:', checkError);
        }

        if (existingEgreso && req.user.role !== 'superadmin') {
            console.warn(`[EGRESO PDF] Duplicate detected and blocked for role ${req.user.role}: ${referenceNumber}`);
            return res.status(400).json({
                message: `Este remito ya fue cargado previamente (Referencia: ${referenceNumber}).`,
                duplicateId: existingEgreso.id
            });
        }

        let egreso = null;
        const existingEgresoId = req.body.existingEgresoId;

        if (existingEgresoId) {
            const { data: found, error: findError } = await supabase
                .from('egresos')
                .select('*')
                .eq('id', existingEgresoId)
                .single();
            
            if (findError || !found) {
                return res.status(404).json({ message: 'El egreso de destino no existe.' });
            }
            egreso = found;
            console.log(`[EGRESO PDF] Usando egreso existente ID: ${egreso.id} para asociar PDF`);
        } else {
            const { data: newEgreso, error: egresoError } = await supabase
                .from('egresos')
                .insert([{
                    reference_number: referenceNumber,
                    pdf_filename: firstPdf.originalname,
                    created_by: req.user.username,
                    sucursal_id: sucursalId,
                    is_devolucion: isDevolucion || false,
                    is_transferencia: isTransferencia || false,
                    date: new Date()
                }])
                .select()
                .single();

            if (egresoError) throw egresoError;
            egreso = newEgreso;
        }

        // 2.5 Guardar TODOS los PDFs en Storage para referencia
        try {
            const newUrls = [];
            for (const file of pdfFiles) {
                const fileExt = 'pdf';
                const fileName = `${egreso.id}/${Date.now()}_${file.originalname}`;
                const filePath = `egresos/${fileName}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('receipt-documents')
                    .upload(filePath, file.buffer, {
                        contentType: 'application/pdf',
                        upsert: true
                    });

                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('receipt-documents')
                        .getPublicUrl(filePath);
                    
                    newUrls.push(publicUrl);
                    console.log(`[EGRESO PDF] Documento guardado: ${publicUrl}`);
                } else {
                    console.error('[EGRESO PDF] Error al subir archivo:', file.originalname, uploadError);
                }
            }

            if (newUrls.length > 0) {
                let finalUrls = [];
                if (egreso.document_url) {
                    try {
                        const existing = JSON.parse(egreso.document_url);
                        finalUrls = Array.isArray(existing) ? existing : [egreso.document_url];
                    } catch (e) {
                        finalUrls = [egreso.document_url];
                    }
                }
                finalUrls = [...finalUrls, ...newUrls];

                await supabase
                    .from('egresos')
                    .update({ document_url: JSON.stringify(finalUrls) })
                    .eq('id', egreso.id);
            }
        } catch (err) {
            console.error('[EGRESO PDF] Error al guardar PDF en Storage:', err);
        }

        // 3. Optimized processing: Bulk operations to avoid timeouts
        const results = { success: [], failed: [] };
        const failedForPersistence = [];

        const itemCodes = items.map(i => i.code);

        // 3.1 Bulk Product Lookup (Only internal code for Egresos)
        const { data: productsByCode, error: prodError } = await supabase
            .from('products')
            .select('code, barcode, description')
            .in('code', itemCodes);

        if (prodError) throw prodError;

        // Create a map that indexes products by internal code
        const productMap = new Map();
        if (productsByCode) productsByCode.forEach(p => productMap.set(p.code, p));

        const itemsToInsert = [];
        const historyEntries = [];

        for (const item of items) {
            let product = productMap.get(item.code);

            // Try stripping leading zeros for internal codes if not found initially
            if (!product) {
                const stripped = item.code.replace(/^0+/, '');
                if (stripped && stripped !== item.code) {
                    product = productMap.get(stripped);
                }
            }

            if (!product) {
                const failedItem = {
                    code: item.code,
                    description: item.description,
                    quantity: item.quantity,
                    error: 'Producto no encontrado'
                };
                results.failed.push(failedItem);
                failedForPersistence.push(failedItem);
                continue;
            }

            const quantity = Number(item.quantity);

            itemsToInsert.push({
                egreso_id: egreso.id,
                product_code: product.code,
                expected_quantity: quantity
            });

            historyEntries.push({
                egreso_id: egreso.id,
                user_id: req.user.id,
                operation: 'PDF_IMPORT',
                product_code: product.code,
                old_data: { expected_quantity: 0 },
                new_data: { expected_quantity: quantity },
                changed_at: new Date().toISOString()
            });

            results.success.push({
                code: product.code,
                barcode: product.barcode,
                description: product.description,
                quantity: item.quantity
            });
        }

        // 3.2 Bulk Inserts
        if (itemsToInsert.length > 0) {
            const { error: itemsInsertError } = await supabase
                .from('egreso_items')
                .insert(itemsToInsert);

            if (itemsInsertError) {
                console.error('[EGRESO PDF] Bulk items insert error:', itemsInsertError);
                throw itemsInsertError;
            }

            // History entries (asynchronous, don't block response)
            supabase.from('egreso_items_history').insert(historyEntries).then(({ error }) => {
                if (error) console.error('[EGRESO PDF] History log error:', error.message);
            });
        }

        console.log(`[EGRESO PDF] Created egreso ${egreso.id}: ${results.success.length} items imported, ${results.failed.length} failed`);

        // 4. Update egreso with failed items for persistence
        if (failedForPersistence.length > 0) {
            const { error: updateError } = await supabase
                .from('egresos')
                .update({ failed_items: failedForPersistence })
                .eq('id', egreso.id);

            if (updateError) {
                console.error('[EGRESO PDF] Error updating egreso with failed items:', updateError);
            }
        }

        res.status(201).json({
            egreso: { ...egreso, failed_items: failedForPersistence },
            results
        });

    } catch (error) {
        console.error('Error creating egreso from PDF:', error);
        res.status(500).json({ message: 'Error al procesar el PDF de egreso' });
    }
});

// Get all Egresos
router.get('/', verifyToken, async (req, res) => {
    try {
        let query = supabase
            .from('egresos')
            .select('*, sucursales(name)')
            .order('date', { ascending: false });

        // Filter by branch for non-admin roles
        if (!['superadmin', 'admin'].includes(req.user.role) && req.user.sucursal_id) {
            query = query.eq('sucursal_id', req.user.sucursal_id);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Flatten data for frontend
        const enrichedData = data.map(e => ({
            ...e,
            sucursal_name: e.sucursales?.name || 'Deposito'
        }));

        res.json(enrichedData);
    } catch (error) {
        console.error('Error fetching egresos:', error);
        res.status(500).json({ message: 'Error fetching egresos' });
    }
});

// Get Egreso Details
router.get('/:id', verifyToken, verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data: egreso, error: egresoError } = await supabase
            .from('egresos')
            .select('*')
            .eq('id', id)
            .single();

        if (egresoError) throw egresoError;

        const { data: items, error: itemsError } = await supabase
            .from('egreso_items')
            .select(`
                *,
                products (
                    description,
                    brand,
                    code,
                    barcode,
                    barcode_secondary,
                    provider_code
                )
            `)
            .eq('egreso_id', id);

        if (itemsError) throw itemsError;

        res.json({ ...egreso, items });
    } catch (error) {
        console.error('Error fetching egreso details:', error);
        res.status(500).json({ message: 'Error fetching egreso details' });
    }
});

// Scan/Control Egreso Item
router.post('/:id/scan', verifyToken, verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    const { code, quantity } = req.body;

    if (!code) return res.status(400).json({ message: 'Missing code' });
    const qtyToAdd = quantity || 1;

    try {
        let productCode = null;

        // Try exact internal code match first
        const { data: pCode } = await supabase.from('products').select('code').eq('code', code).maybeSingle();
        if (pCode) productCode = pCode.code;

        if (!productCode) {
            // Try barcode
            const { data: pBar } = await supabase.from('products').select('code').eq('barcode', code).maybeSingle();
            if (pBar) productCode = pBar.code;
        }

        if (!productCode) {
            // Try secondary barcode
            const { data: pSec } = await supabase.from('products').select('code').eq('barcode_secondary', code).maybeSingle();
            if (pSec) productCode = pSec.code;
        }

        if (!productCode) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        const { data: existingItem } = await supabase
            .from('egreso_items')
            .select('*')
            .eq('egreso_id', id)
            .eq('product_code', productCode)
            .maybeSingle();

        if (!existingItem || !(Number(existingItem.expected_quantity) > 0)) {
            return res.status(400).json({ message: 'El producto no forma parte de este remito de egreso o no tiene cantidad esperada.' });
        }

        let oldScanned = (Number(existingItem.scanned_quantity) || 0);
        let newScanned = oldScanned + qtyToAdd;
        let currentExpected = Number(existingItem.expected_quantity) || 0;

        // Validation: Cannot exceed expected quantity for Egresos
        if (newScanned > currentExpected) {
            return res.status(400).json({
                message: `No se puede exceder la cantidad esperada. Máximo permitido: ${currentExpected - oldScanned}`
            });
        }

        const { data: savedItem, error: saveError } = await supabase
            .from('egreso_items')
            .upsert({
                egreso_id: id,
                product_code: productCode,
                scanned_quantity: newScanned,
                expected_quantity: currentExpected,
                last_scanned_at: new Date().toISOString()
            }, { onConflict: 'egreso_id, product_code' })
            .select()
            .single();

        if (saveError) throw saveError;

        // Log History
        if (oldScanned !== newScanned) {
            await supabase.from('egreso_items_history').insert({
                egreso_id: id,
                user_id: req.user.id,
                operation: 'UPDATE_SCANNED',
                product_code: productCode,
                old_data: { scanned_quantity: oldScanned },
                new_data: { scanned_quantity: newScanned },
                changed_at: new Date().toISOString()
            });
        }

        res.json(savedItem);
    } catch (error) {
        console.error('Error scanning egreso item:', error);
        res.status(500).json({ message: 'Error at processing scan' });
    }
});

// Resolve a failed PDF item by linking it to a correct catalog product
router.post('/:id/resolve-failed', verifyToken, verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    const { index, productCode } = req.body;

    if (index === undefined || !productCode) {
        return res.status(400).json({ message: 'Missing index or productCode' });
    }

    try {
        // 1. Fetch the egreso to get failed_items
        const { data: egreso, error: egresoError } = await supabase
            .from('egresos')
            .select('*')
            .eq('id', id)
            .single();

        if (egresoError || !egreso) throw egresoError || new Error('Egreso no encontrado');
        if (egreso.status === 'finalized') return res.status(400).json({ message: 'No se puede modificar un egreso finalizado' });

        const failedItems = egreso.failed_items || [];
        if (index < 0 || index >= failedItems.length) {
            return res.status(404).json({ message: 'Item fallido no encontrado en la lista' });
        }

        const itemToResolve = failedItems[index];

        // 2. Fetch the correct product
        const { data: product } = await supabase
            .from('products')
            .select('code, description')
            .eq('code', productCode)
            .maybeSingle();

        if (!product) return res.status(404).json({ message: 'Producto del catálogo no encontrado' });

        // 3. Insert or update in egreso_items
        const { data: existingItem } = await supabase
            .from('egreso_items')
            .select('*')
            .eq('egreso_id', id)
            .eq('product_code', product.code)
            .maybeSingle();

        const newExpected = (existingItem ? (Number(existingItem.expected_quantity) || 0) : 0) + (Number(itemToResolve.quantity) || 0);

        const { error: saveError } = await supabase
            .from('egreso_items')
            .upsert({
                egreso_id: id,
                product_code: product.code,
                expected_quantity: newExpected
            }, { onConflict: 'egreso_id, product_code' });

        if (saveError) throw saveError;

        // 4. Remove from failed_items
        const updatedFailedItems = [...failedItems];
        updatedFailedItems.splice(index, 1);

        const { error: updateEgresoError } = await supabase
            .from('egresos')
            .update({ failed_items: updatedFailedItems })
            .eq('id', id);

        if (updateEgresoError) throw updateEgresoError;

        // 5. Log History
        await supabase.from('egreso_items_history').insert({
            egreso_id: id,
            user_id: req.user.id,
            operation: 'PDF_IMPORT',
            product_code: product.code,
            description: `Vinculación manual de item fallido: ${itemToResolve.description} (${itemToResolve.code})`,
            old_data: { expected_quantity: existingItem ? Number(existingItem.expected_quantity) : 0 },
            new_data: { expected_quantity: newExpected },
            changed_at: new Date().toISOString()
        });

        res.json({ success: true, message: 'Producto vinculado correctamente' });
    } catch (error) {
        console.error('Error resolving failed item:', error);
        res.status(500).json({ message: 'Error interno al vincular el producto' });
    }
});

// Update shortage reason for Egreso Item
router.put('/:id/items/:productCode/reason', verifyToken, verifyBranchAccess('egresos'), async (req, res) => {
    const { id, productCode } = req.params;
    const { reason } = req.body;

    try {
        const { data, error } = await supabase
            .from('egreso_items')
            .update({ shortage_reason: reason })
            .eq('egreso_id', id)
            .eq('product_code', productCode)
            .select()
            .single();

        if (error) throw error;

        // Log history
        await supabase.from('egreso_items_history').insert({
            egreso_id: id,
            user_id: req.user.id,
            operation: 'UPDATE_REASON',
            product_code: productCode,
            new_data: { shortage_reason: reason },
            changed_at: new Date().toISOString()
        });

        res.json(data);
    } catch (error) {
        console.error('Error updating shortage reason:', error);
        res.status(500).json({ message: 'Error updating reason' });
    }
});

// Close Egreso
router.put('/:id/close', verifyToken, hasPermission('close_egresos'), verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Borrar documentos del Storage si existen
        const { data: egresoData } = await supabase
            .from('egresos')
            .select('document_url')
            .eq('id', id)
            .single();

        if (egresoData?.document_url) {
            try {
                let urls = [];
                try {
                    const parsed = JSON.parse(egresoData.document_url);
                    urls = Array.isArray(parsed) ? parsed : [egresoData.document_url];
                } catch (e) {
                    urls = [egresoData.document_url];
                }

                for (const url of urls) {
                    const urlParts = url.split('/receipt-documents/');
                    if (urlParts.length > 1) {
                        const filePath = urlParts[1];
                        await supabase.storage.from('receipt-documents').remove([filePath]);
                        console.log(`[STORAGE] Archivo de egreso eliminado: ${filePath}`);
                    }
                }
            } catch (err) {
                console.error('[STORAGE DELETE FAIL]', err);
            }
        }

        const { data, error } = await supabase
            .from('egresos')
            .update({
                status: 'finalized',
                document_url: null
            })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Error closing egreso:', error);
        res.status(500).json({ message: 'Error closing egreso' });
    }
});

// Reopen Egreso
router.put('/:id/reopen', verifyToken, hasPermission('close_egresos'), verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('egresos')
            .update({ status: 'open' })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Error reopening egreso:', error);
        res.status(500).json({ message: 'Error reopening egreso' });
    }
});

// Finalize Egreso and set all quantities as complete (Admin only)
router.put('/:id/finalize', verifyToken, verifyAdmin, verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Fetch current items
        const { data: items, error: fetchError } = await supabase
            .from('egreso_items')
            .select('product_code, expected_quantity, scanned_quantity')
            .eq('egreso_id', id);

        if (fetchError) throw fetchError;

        // 2. Prepare updates (only for those that aren't already complete)
        const itemsToUpdate = items.filter(item => Number(item.scanned_quantity) !== Number(item.expected_quantity));

        if (itemsToUpdate.length > 0) {
            const updates = itemsToUpdate.map(item => ({
                egreso_id: id,
                product_code: item.product_code,
                scanned_quantity: item.expected_quantity,
                expected_quantity: item.expected_quantity
            }));

            const { error: updateItemsError } = await supabase
                .from('egreso_items')
                .upsert(updates, { onConflict: 'egreso_id, product_code' });

            if (updateItemsError) throw updateItemsError;

            // 3. Log history for these items
            const historyEntries = itemsToUpdate.map(item => ({
                egreso_id: id,
                user_id: req.user.id,
                operation: 'ADMIN_FINALIZE',
                product_code: item.product_code,
                old_data: { scanned_quantity: item.scanned_quantity },
                new_data: { scanned_quantity: item.expected_quantity },
                changed_at: new Date().toISOString()
            }));

            await supabase.from('egreso_items_history').insert(historyEntries);
        }

        // 4. Finalize the Egreso status
        const { data: egreso, error: egresoError } = await supabase
            .from('egresos')
            .update({ status: 'finalized' })
            .eq('id', id)
            .select()
            .single();

        if (egresoError) throw egresoError;

        // 5. Borrar documentos del Storage si existen
        if (egreso.document_url) {
            try {
                let urls = [];
                try {
                    const parsed = JSON.parse(egreso.document_url);
                    urls = Array.isArray(parsed) ? parsed : [egreso.document_url];
                } catch (e) {
                    urls = [egreso.document_url];
                }

                for (const url of urls) {
                    const urlParts = url.split('/receipt-documents/');
                    if (urlParts.length > 1) {
                        const filePath = urlParts[1];
                        await supabase.storage.from('receipt-documents').remove([filePath]);
                        console.log(`[STORAGE] Archivo de egreso eliminado tras finalizar: ${filePath}`);
                    }
                }
                // Limpiar la URL en la BD
                await supabase.from('egresos').update({ document_url: null }).eq('id', id);
            } catch (err) {
                console.error('[STORAGE DELETE FAIL]', err);
            }
        }

        res.json({ message: 'Egreso finalizado y cantidades completadas', egreso });
    } catch (error) {
        console.error('Error finalizing egreso:', error);
        res.status(500).json({ message: 'Error al finalizar el egreso' });
    }
});

// Delete Egreso
router.delete('/:id', verifyToken, hasPermission('delete_egresos'), verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    try {
        await supabase.from('egreso_items_history').delete().eq('egreso_id', id);
        await supabase.from('egreso_items').delete().eq('egreso_id', id);
        const { error } = await supabase.from('egresos').delete().eq('id', id);

        if (error) throw error;
        res.json({ message: 'Egreso deleted successfully' });
    } catch (error) {
        console.error('Error deleting egreso:', error);
        res.status(500).json({ message: 'Error deleting egreso' });
    }
});

// Get Egreso History
router.get('/:id/history', verifyToken, verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data: history, error } = await supabase
            .from('egreso_items_history')
            .select('*')
            .eq('egreso_id', id)
            .order('changed_at', { ascending: false });

        if (error) throw error;

        const userIds = [...new Set(history.map(h => h.user_id).filter(Boolean))];
        const productCodes = [...new Set(history.map(h => h.product_code).filter(Boolean))];

        const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
        const { data: products } = await supabase.from('products').select('code, description').in('code', productCodes);

        const userMap = {};
        if (users) users.forEach(u => userMap[u.id] = u.username);

        const productMap = {};
        if (products) products.forEach(p => productMap[p.code] = p.description);

        const enrichedHistory = history.map(entry => ({
            ...entry,
            username: userMap[entry.user_id] || 'Desconocido',
            description: productMap[entry.product_code] || 'Sin descripción'
        }));

        res.json(enrichedHistory);
    } catch (error) {
        console.error('Error fetching egreso history:', error);
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// Export Egreso to Excel
router.get('/:id/export', verifyToken, verifyBranchAccess('egresos'), async (req, res) => {
    const { id } = req.params;
    try {
        const { data: egreso, error: egresoError } = await supabase
            .from('egresos')
            .select('*')
            .eq('id', id)
            .single();

        if (egresoError) throw egresoError;

        const { data: items, error: itemsError } = await supabase
            .from('egreso_items')
            .select(`
                *,
                products (
                    description,
                    code,
                    barcode,
                    provider_code
                )
            `)
            .eq('egreso_id', id);

        if (itemsError) throw itemsError;

        const xlsx = require('xlsx');
        const workbook = xlsx.utils.book_new();

        let data = items.map(item => ({
            'Código Interno': item.product_code,
            'Código de Barras': item.products?.barcode || '-',
            'Descripción': item.products?.description || 'Sin descripción',
            'Cant. Esperada': Number(item.expected_quantity) || 0,
            'Cant. Controlada': Number(item.scanned_quantity) || 0,
            'Diferencia': (Number(item.scanned_quantity) || 0) - (Number(item.expected_quantity) || 0),
            'Motivo Faltante': item.shortage_reason || '-'
        }));

        const onlyDifferences = req.query.onlyDifferences === 'true';
        if (onlyDifferences) {
            data = data.filter(item => item.Diferencia !== 0);
        }

        const worksheet = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(workbook, worksheet, onlyDifferences ? 'Diferencias' : 'Detalle Egreso');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const filename = onlyDifferences
            ? `Diferencias_Egreso_${egreso.reference_number}.xlsx`
            : `Egreso_${egreso.reference_number}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

    } catch (error) {
        console.error('Error exporting egreso:', error);
        res.status(500).json({ message: 'Error al exportar egreso' });
    }
});



module.exports = router;
