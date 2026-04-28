const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../services/supabaseClient');
const { verifyToken, hasPermission } = require('../middleware/auth');
const { fetchProductsByCodes, findProductByAnyCode } = require('../utils/dbHelpers');
const { parseRemitoPdf } = require('../pdfParser');
const { parseExcelXml } = require('../xmlParser');
const xlsx = require('xlsx');

// --- LOCAL HELPERS ---

// Helper to extract capacity from description (e.g., "X 1", "X 4")
const getCapacityFromDescription = (description) => {
    if (!description) return 999999;
    const match = description.match(/\s+X\s+(\d+(?:\.\d+)?)/i);
    if (match) {
        return parseFloat(match[1]);
    }
    return 999999;
};

// Helper to fetch ALL products in detail (bypassing 1000 limit)
async function fetchAllProductsDetailed() {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('products')
            .select('code, description, excel_order, current_stock, brand, brand_code')
            .range(from, from + step - 1);

        if (error) throw error;
        if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < step) hasMore = false;
            else from += step;
        } else {
            hasMore = false;
        }
    }
    return allData;
}

// Helper to fetch ALL stock records for a branch (bypassing 1000 limit)
async function fetchBranchStock(sucursalId) {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('stock_sucursal')
            .select('product_code, quantity, products(description, brand, brand_code)')
            .eq('sucursal_id', sucursalId)
            .range(from, from + step - 1);

        if (error) throw error;
        if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < step) hasMore = false;
            else from += step;
        } else {
            hasMore = false;
        }
    }
    return allData;
}

// Helper to fetch ALL products in batches (Supabase/PostgREST 1000 limit)
async function getAllProducts() {
    let allProducts = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('products')
            .select('code, description, barcode, current_stock, excel_order')
            .order('excel_order', { ascending: true, nullsFirst: false })
            .range(from, from + step - 1);

        if (error) {
            console.error('Error in getAllProducts:', error);
            throw error;
        }

        if (data && data.length > 0) {
            allProducts = [...allProducts, ...data];
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allProducts;
}

// Helper to fetch ALL scans for a specific order (Batching)
async function getAllScans(orderNumber) {
    let allScans = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('inventory_scans')
            .select('user_id, code, quantity, timestamp') // Include potential fields
            .eq('order_number', orderNumber)
            .range(from, from + step - 1);

        if (error) {
            console.error('Error in getAllScans:', error);
            throw error;
        }

        if (data && data.length > 0) {
            allScans = [...allScans, ...data];
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allScans;
}

// Helper for batch fetching scans for multiple orders
async function getAllScansBatch(orderNumbers) {
    let allScans = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    // Supabase .in() limit is around 65k parameters, but URL length might be an issue.
    // Assuming orderNumbers list is reasonable (<100).

    while (hasMore) {
        const { data, error } = await supabase
            .from('inventory_scans')
            .select('order_number, code, quantity')
            .in('order_number', orderNumbers)
            .range(from, from + step - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            allScans = [...allScans, ...data];
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allScans;
}


// Create new remito
router.post('/remitos', verifyToken, async (req, res) => {
    const { remitoNumber, items, discrepancies, clarification } = req.body;

    if (!remitoNumber || !items || items.length === 0) {
        return res.status(400).json({ message: 'Missing remito number or items' });
    }

    try {
        const { data, error } = await supabase
            .from('remitos')
            .insert([
                {
                    remito_number: remitoNumber,
                    items: items,
                    discrepancies: discrepancies || {}, // Save discrepancies if provided
                    clarification: clarification || null,
                    status: 'processed', // Assuming auto-processed for now
                    created_by: req.user.username // Save the username from the token
                }
            ])
            .select();

        if (error) throw error;

        // Update pre-remito status to 'processed'
        // Supports multiple order numbers separated by comma
        const orderNumbers = remitoNumber.split(',').map(n => n.trim());
        await supabase
            .from('pre_remitos')
            .update({ status: 'processed' })
            .in('order_number', orderNumbers);

        res.status(201).json(data[0]);
    } catch (error) {
        console.error('Error creating remito:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all remitos with manual join to pre-remitos/PV, and include Pending pre-remitos (Progress)
router.get('/remitos', verifyToken, async (req, res) => {
    try {
        // 1. Fetch all processed remitos
        const { data: remitosData, error: remitosError } = await supabase
            .from('remitos')
            .select('*')
            .is('deleted_at', null)
            .order('date', { ascending: false });

        if (remitosError) throw remitosError;

        // 2. Fetch all pre-remitos with PV info
        const { data: preRemitosData, error: preRemitosError } = await supabase
            .from('pre_remitos')
            .select(`
                id,
                order_number,
                status,
                items,
                created_at,
                id_inventory,
                pedidos_ventas (
                    numero_pv,
                    sucursal
                )
            `)
            .is('deleted_at', null);

        if (preRemitosError) throw preRemitosError;

        // 3. Fetch General Counts names
        const { data: countsData } = await supabase
            .from('general_counts')
            .select('id, name');

        const countsMap = {};
        if (countsData) {
            countsData.forEach(c => countsMap[c.id] = c.name);
        }

        // 4. Create lookup and identify Pending ones
        const preRemitoMap = {};
        const pendingPreRemitos = preRemitosData.filter(p => p.status === 'pending');

        preRemitosData.forEach(pre => {
            preRemitoMap[pre.order_number] = {
                numero_pv: pre.pedidos_ventas?.[0]?.numero_pv || '-',
                sucursal: pre.pedidos_ventas?.[0]?.sucursal || '-',
                id_inventory: pre.id_inventory,
                items: pre.items || []
            };
        });

        // 5. Fetch Open and Closed General Counts (to ensure historical visibility even if report generation failed previously)
        const { data: generalCounts, error: countsError } = await supabase
            .from('general_counts')
            .select('*')
            .neq('status', 'voided')
            .is('deleted_at', null);

        if (countsError) console.error('Error fetching general counts:', countsError);

        // Split into open and closed
        const openGeneralCounts = (generalCounts || []).filter(c => c.status === 'open');
        const closedGeneralCounts = (generalCounts || []).filter(c => c.status === 'closed');

        // --- BATCH OPTIMIZATION START ---

        // Collect all IDs that need progress calculation
        const pendingOrderNumbers = pendingPreRemitos.map(p => p.order_number);
        const openCountIds = (openGeneralCounts || []).map(c => c.id);
        const allRelevantIds = [...pendingOrderNumbers, ...openCountIds];

        if (allRelevantIds.length === 0) {
            // If no pending items, just return processed
            let processedFormatted = remitosData.map(remito => {
                const extraInfo = preRemitoMap[remito.remito_number] || { numero_pv: '-', sucursal: '-' };
                const gc = generalCounts?.find(c => c.id === remito.remito_number);
                return {
                    ...remito,
                    numero_pv: extraInfo.numero_pv,
                    sucursal: extraInfo.sucursal !== '-' ? extraInfo.sucursal : (gc?.sucursal_name || '-'),
                    branch_sucursal_id: gc?.sucursal_id || null,
                    count_name: countsMap[remito.remito_number] || null,
                    is_finalized: true,
                    type: 'remito'
                };
            });

            // Filter by sucursal for branch_admin users
            if (req.user.role === 'branch_admin' && req.user.sucursal_id) {
                const { data: userBranch } = await supabase
                    .from('sucursales')
                    .select('name')
                    .eq('id', req.user.sucursal_id)
                    .single();

                if (userBranch) {
                    const branchName = userBranch.name.toLowerCase();
                    processedFormatted = processedFormatted.filter(item => {
                        // Match by sucursal_id (for general counts)
                        if (item.branch_sucursal_id && item.branch_sucursal_id === req.user.sucursal_id) return true;
                        // Match by sucursal name (for remitos/PV)
                        if (!item.sucursal || item.sucursal === '-') return false;
                        return item.sucursal.toLowerCase().includes(branchName);
                    });
                }
            }

            return res.json(processedFormatted.sort((a, b) => new Date(b.date) - new Date(a.date)));
        }

        // Batch Fetch 1: All scans for these orders using pagination helper
        const allScans = await getAllScansBatch(allRelevantIds);
        // const { data: allScans, error: scansError } = await supabase
        //     .from('inventory_scans')
        //     .select('order_number, code, quantity')
        //     .in('order_number', allRelevantIds);

        // if (scansError) throw scansError;

        // Batch Fetch 2: Get all unique product details involved in these scans
        const uniqueScanCodes = [...new Set(allScans.map(s => s.code))];
        let productMap = {};

        if (uniqueScanCodes.length > 0) {
            const { data: productsData, error: productError } = await supabase
                .from('products')
                .select('code, description, brand')
                .in('code', uniqueScanCodes);

            if (productError) throw productError;

            if (productsData) {
                productsData.forEach(p => {
                    productMap[p.code] = {
                        brand: p.brand,
                        description: p.description
                    };
                });
            }
        }

        // Helper to process scans for a specific ID
        const processOrderScans = (orderId, expectedItems = []) => {
            const orderScans = allScans.filter(s => s.order_number === orderId);

            let totalScanned = 0;
            let totalExpected = 0;
            let brands = new Set();

            // Calculate totals
            if (expectedItems && Array.isArray(expectedItems)) {
                expectedItems.forEach(item => {
                    totalExpected += (item.quantity || 0);
                });
            }

            orderScans.forEach(scan => {
                totalScanned += (scan.quantity || 0);

                // Resolve Brand
                const pInfo = productMap[scan.code];
                if (pInfo) {
                    if (pInfo.brand) {
                        brands.add(pInfo.brand);
                    } else if (pInfo.description) {
                        const brand = pInfo.description.split(' ')[0];
                        if (brand && brand.length > 2) brands.add(brand.toUpperCase());
                    }
                }
            });

            const progress = totalExpected > 0
                ? Math.min(Math.round((totalScanned / totalExpected) * 100), 100)
                : 0;

            return {
                progress,
                scanned_brands: Array.from(brands).slice(0, 5)
            };
        };

        // 6. Enrich Pending Pre-Remitos
        const pendingFormatted = pendingPreRemitos.map(pre => {
            const stats = processOrderScans(pre.order_number, pre.items);
            return {
                id: pre.id,
                remito_number: pre.order_number,
                items: pre.items,
                status: 'pending_scanned',
                created_by: 'Múltiples',
                date: pre.created_at,
                numero_pv: pre.pedidos_ventas?.[0]?.numero_pv || '-',
                sucursal: pre.pedidos_ventas?.[0]?.sucursal || '-',
                id_inventory: pre.id_inventory,
                count_name: countsMap[pre.order_number] || pre.id_inventory || null,
                progress: stats.progress,
                scanned_brands: stats.scanned_brands,
                is_finalized: false,
                type: 'pre_remito'
            };
        });

        // Helper to format names
        const formatName = (rawName) => {
            if (!rawName) return null;
            const parts = rawName.split(',').map(s => s.trim());
            let newNames = [];
            let isStock = false;
            let sucursales = [];
            let pvs = [];

            parts.forEach(num => {
                const info = preRemitoMap[num];
                if (num.startsWith('STOCK-')) {
                    isStock = true;
                    if (info && info.id_inventory) {
                        newNames.push(info.id_inventory);
                    } else if (countsMap[num]) {
                        newNames.push(countsMap[num]);
                    } else {
                        newNames.push(num);
                    }
                } else {
                    if (info && info.id_inventory) {
                        newNames.push(info.id_inventory);
                    } else if (countsMap[num]) {
                        newNames.push(countsMap[num]);
                    } else {
                        newNames.push(num);
                    }
                }

                if (info) {
                    if (info.sucursal && info.sucursal !== '-') sucursales.push(info.sucursal);
                    if (info.numero_pv && info.numero_pv !== '-') pvs.push(info.numero_pv);
                }
            });

            const uniqueNames = [...new Set(newNames)];
            let finalName = rawName;
            if (uniqueNames.length > 0) {
                finalName = isStock ? 'Stock Inicial - ' + uniqueNames.join(', ') : uniqueNames.join(', ');
            }
            return {
                name: finalName,
                sucursal: sucursales.length > 0 ? [...new Set(sucursales)].join(', ') : '-',
                numero_pv: pvs.length > 0 ? [...new Set(pvs)].join(', ') : '-'
            };
        };

        // 7. Enrich Open General Counts
        const openCountsFormatted = (openGeneralCounts || []).map(count => {
            // Resolve items if grouped
            let groupedItems = [];
            const parts = (count.name || '').split(',').map(s => s.trim());
            const linkedOrders = parts.filter(p => p.startsWith('STOCK-'));

            linkedOrders.forEach(order => {
                const info = preRemitoMap[order];
                if (info && info.items) {
                    groupedItems = [...groupedItems, ...info.items];
                }
            });

            const stats = processOrderScans(count.id, groupedItems);
            const formatted = formatName(count.name || count.id);
            return {
                id: count.id,
                remito_number: count.id,
                items: groupedItems,
                status: 'pending_scanned',
                created_by: count.created_by || 'Admin',
                date: count.created_at,
                numero_pv: formatted.numero_pv,
                sucursal: formatted.sucursal !== '-' ? formatted.sucursal : (count.sucursal_name || '-'),
                branch_sucursal_id: count.sucursal_id || null,
                id_inventory: linkedOrders.length > 0 ? preRemitoMap[linkedOrders[0]]?.id_inventory : null,
                count_name: formatted.name,
                progress: null, // General counts don't have progress bar usually
                scanned_brands: stats.scanned_brands,
                is_finalized: false,
                type: 'general_count'
            };
        });

        // --- BATCH OPTIMIZATION END ---

        // 8. Merge data
        const processedFormatted = remitosData.map(remito => {
            const formatted = formatName(remito.remito_number);
            const gc = generalCounts?.find(c => c.id === remito.remito_number);

            let parsedItems = remito.items;
            if (typeof remito.items === 'string') {
                try {
                    parsedItems = JSON.parse(remito.items);
                } catch (e) {
                    parsedItems = [];
                }
            }

            return {
                ...remito,
                items: parsedItems,
                numero_pv: formatted.numero_pv,
                sucursal: formatted.sucursal !== '-' ? formatted.sucursal : (gc?.sucursal_name || '-'),
                branch_sucursal_id: gc?.sucursal_id || null,
                id_inventory: preRemitoMap[remito.remito_number]?.id_inventory || null,
                count_name: formatted.name,
                is_finalized: true,
                type: 'remito'
            };
        });

        // 7.1. Format Closed General Counts that might not have a Remito entry
        const processedRemitoNumbers = new Set(remitosData.map(r => r.remito_number));
        const closedCountsFormatted = closedGeneralCounts
            .filter(c => !processedRemitoNumbers.has(c.id)) // Only those NOT already in remitos table
            .map(count => {
                const formatted = formatName(count.name || count.id);
                return {
                    id: count.id,
                    remito_number: count.id,
                    items: [], // Report missing, so items unknown or empty here
                    status: 'processed',
                    created_by: count.created_by || 'Admin',
                    date: count.closed_at || count.created_at,
                    numero_pv: formatted.numero_pv,
                    sucursal: formatted.sucursal !== '-' ? formatted.sucursal : (count.sucursal_name || '-'),
                    branch_sucursal_id: count.sucursal_id || null,
                    id_inventory: null,
                    count_name: formatted.name,
                    is_finalized: true,
                    type: 'general_count'
                };
            });

        // Combined and sorted by date
        let combined = [...openCountsFormatted, ...closedCountsFormatted, ...pendingFormatted, ...processedFormatted].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Filter by sucursal for branch_admin users
        if (req.user.role === 'branch_admin' && req.user.sucursal_id) {
            const { data: userBranch } = await supabase
                .from('sucursales')
                .select('name')
                .eq('id', req.user.sucursal_id)
                .single();

            if (userBranch) {
                const branchName = userBranch.name.toLowerCase();
                combined = combined.filter(item => {
                    // Match by sucursal_id (for general counts)
                    if (item.branch_sucursal_id && item.branch_sucursal_id === req.user.sucursal_id) return true;
                    // Match by sucursal name (for remitos/PV)
                    if (!item.sucursal || item.sucursal === '-') return false;
                    return item.sucursal.toLowerCase().includes(branchName);
                });
            }
        }

        res.json(combined);
    } catch (error) {
        console.error('Error fetching remitos:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete Remito (Admin only)
router.delete('/remitos/:id', verifyToken, hasPermission('delete_counts'), async (req, res) => {
    const { id } = req.params;

    try {
        // Soft delete remito
        const { error } = await supabase
            .from('remitos')
            .update({ deleted_at: new Date() })
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Remito borrado correctamente' });
    } catch (error) {
        console.error('Error deleting remito:', error);
        res.status(500).json({ message: 'Error deleting remito' });
    }
});

// Delete Pre-Remito (Admin only)
router.delete('/pre-remitos/:id', verifyToken, hasPermission('delete_counts'), async (req, res) => {
    const { id } = req.params;

    try {
        // Soft delete pre-remito
        const { error } = await supabase
            .from('pre_remitos')
            .update({ deleted_at: new Date() })
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Pre-remito borrado correctamente' });
    } catch (error) {
        console.error('Error deleting pre-remito:', error);
        res.status(500).json({ message: 'Error deleting pre-remito' });
    }
});

// Delete General Count (Admin only)
// Branch Count List: paginated product list with scanned quantities for the requesting user
router.get('/general-counts/:id/product-list', verifyToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize) || 50));
    const search = (req.query.search || '').trim();

    try {
        // Verify count exists and is open
        const { data: count, error: countError } = await supabase
            .from('general_counts')
            .select('id, status, sucursal_id, product_codes')
            .eq('id', id)
            .is('deleted_at', null)
            .maybeSingle();

        if (countError) throw countError;
        if (!count) return res.status(404).json({ message: 'Conteo no encontrado' });
        if (count.status !== 'open') return res.status(400).json({ message: 'El conteo ya fue cerrado' });

        let products = [];
        let total = 0;

        // If the count has specific product_codes (from XML/pre-remito),
        // we fetch all of them and paginate/filter in memory to respect the original order.
        if (Array.isArray(count.product_codes) && count.product_codes.length > 0) {
            const allProductsInCount = await fetchProductsByCodes(count.product_codes);

            const productMap = new Map(allProductsInCount.map(p => [p.code, p]));

            // Reorder products based on count.product_codes
            let orderedProducts = count.product_codes
                .map(code => productMap.get(code))
                .filter(p => p !== undefined); // Filter out any codes not found in products table

            // Add order info if missing and extract capacity for sorting
            let productsWithMeta = orderedProducts.map((p, idx) => ({
                ...p,
                indexInCount: idx,
                capacity: getCapacityFromDescription(p.description)
            }));

            // Apply Grouping by Capacity, preserving relative order (stable sort)
            productsWithMeta.sort((a, b) => {
                if (a.capacity !== b.capacity) {
                    return a.capacity - b.capacity;
                }
                return a.indexInCount - b.indexInCount;
            });

            // Apply search filter in memory
            if (search) {
                const lowerCaseSearch = search.toLowerCase();
                productsWithMeta = productsWithMeta.filter(p =>
                    p.description.toLowerCase().includes(lowerCaseSearch) ||
                    p.code.toLowerCase().includes(lowerCaseSearch)
                );
            }

            total = productsWithMeta.length;
            const from = (page - 1) * pageSize;
            const to = from + pageSize; // 'to' is exclusive for slice
            products = productsWithMeta.slice(from, to);

        } else {
            // Updated logic: Fetch ALL products using helper to avoid 1000 limit
            const allDbProducts = await fetchAllProductsDetailed();

            let productsWithMeta = (allDbProducts || []).map(p => ({
                ...p,
                capacity: getCapacityFromDescription(p.description)
            }));

            // Apply Grouping by Capacity, preserving excel_order
            productsWithMeta.sort((a, b) => {
                if (a.capacity !== b.capacity) {
                    return a.capacity - b.capacity;
                }
                return (a.excel_order || 0) - (b.excel_order || 0);
            });

            // Apply search filter in memory
            if (search) {
                const lowerCaseSearch = search.toLowerCase();
                productsWithMeta = productsWithMeta.filter(p =>
                    p.description.toLowerCase().includes(lowerCaseSearch) ||
                    p.code.toLowerCase().includes(lowerCaseSearch)
                );
            }

            total = productsWithMeta.length;
            const from = (page - 1) * pageSize;
            const to = from + pageSize;
            products = productsWithMeta.slice(from, to);
        }

        // Fetch scans for the current page's product codes to see my qty and if others scanned
        const codes = (products || []).map(p => p.code);
        let myScannedMap = {};
        let othersScannedMap = {};
        if (codes.length > 0) {
            const { data: allScans, error: scanError } = await supabase
                .from('inventory_scans')
                .select('code, quantity, user_id')
                .eq('order_number', id)
                .in('code', codes);

            if (scanError) throw scanError;

            (allScans || []).forEach(s => {
                if (s.user_id === userId) {
                    myScannedMap[s.code] = s.quantity;
                } else {
                    othersScannedMap[s.code] = true;
                }
            });
        }

        // Count total scanned products (for progress bar)
        const { count: countedTotal } = await supabase
            .from('inventory_scans')
            .select('code', { count: 'exact', head: true })
            .eq('order_number', id)
            .eq('user_id', userId);

        const productList = (products || []).map(p => ({
            code: p.code,
            description: p.description,
            excel_order: p.excel_order,
            quantity: myScannedMap[p.code] !== undefined ? myScannedMap[p.code] : null,
            has_other_scans: !!othersScannedMap[p.code]
        }));

        res.json({
            products: productList,
            total: total || 0,
            page,
            pageSize,
            totalPages: Math.ceil((total || 0) / pageSize),
            countedTotal: countedTotal || 0
        });
    } catch (error) {
        console.error('Error fetching branch count product list:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

router.delete('/general-counts/:id', verifyToken, hasPermission('delete_counts'), async (req, res) => {
    const { id } = req.params;

    try {
        // Soft delete general count
        const { error } = await supabase
            .from('general_counts')
            .update({ deleted_at: new Date() })
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Conteo borrado correctamente' });
    } catch (error) {
        console.error('Error deleting general count:', error);
        res.status(500).json({ message: 'Error deleting general count' });
    }
});

// Helper to resolve remito details and calculate live discrepancies
async function getFullRemitoDetails(id) {
    let remito = null;
    let isFinalized = true;

    // 1. Fetch Remito Base Info - Try Processed first
    let { data: finalizedRemito, error: finalizedError } = await supabase
        .from('remitos')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

    if (finalizedRemito) {
        remito = finalizedRemito;
        // Also fetch id_inventory from pre_remitos if missing in remitos table
        if (!remito.id_inventory && remito.remito_number) {
            const { data: preRemitoData } = await supabase
                .from('pre_remitos')
                .select('id_inventory')
                .eq('order_number', remito.remito_number)
                .maybeSingle();
            if (preRemitoData) remito.id_inventory = preRemitoData.id_inventory;
        }
    } else {
        // 1b. Fallback: Check if ID is actually the remito_number (General Count ID) which is common for General Counts
        const { data: finalizedRemitoByNumber } = await supabase
            .from('remitos')
            .select('*')
            .eq('remito_number', id)
            .maybeSingle();

        if (finalizedRemitoByNumber) {
            remito = finalizedRemitoByNumber;
            if (!remito.id_inventory && remito.remito_number) {
                const { data: preRemitoData } = await supabase
                    .from('pre_remitos')
                    .select('id_inventory')
                    .eq('order_number', remito.remito_number)
                    .maybeSingle();
                if (preRemitoData) remito.id_inventory = preRemitoData.id_inventory;
            }
        } else {
            // 2. Try Pre-Remitos (Pending)
            const { data: preRemito } = await supabase
                .from('pre_remitos')
                .select('*, pedidos_ventas(numero_pv, sucursal)')
                .eq('id', id)
                .is('deleted_at', null)
                .maybeSingle();

            if (preRemito) {
                let preRemitoItems = preRemito.items || [];

                // If no items in pre_remito, fetch all products with stock as expected items
                if (preRemitoItems.length === 0) {
                    const { data: allProducts } = await supabase
                        .from('products')
                        .select('code, description, current_stock, brand, brand_code')
                        .gt('current_stock', 0);

                    preRemitoItems = (allProducts || []).map(p => ({
                        code: p.code,
                        name: p.description,
                        description: p.description,
                        quantity: p.current_stock,
                        brand: p.brand,
                        brand_code: p.brand_code
                    }));
                }

                remito = {
                    id: preRemito.id,
                    remito_number: preRemito.order_number,
                    id_inventory: preRemito.id_inventory,
                    items: preRemitoItems,
                    date: preRemito.created_at,
                    status: 'pending',
                    numero_pv: preRemito.pedidos_ventas?.[0]?.numero_pv || '-',
                    sucursal: preRemito.pedidos_ventas?.[0]?.sucursal || '-'
                };
                isFinalized = false;
            } else {
                // 3. Try General Counts (Open)
                const { data: generalCount } = await supabase
                    .from('general_counts')
                    .select('*')
                    .eq('id', id)
                    .is('deleted_at', null)
                    .maybeSingle();

                if (generalCount) {
                    let items = [];

                    // New logic for grouped general counts: 
                    // If name contains STOCK- order numbers, use ONLY those items as base
                    const parts = (generalCount.name || '').split(',').map(s => s.trim());
                    const linkedOrderNumbers = parts.filter(p => p.startsWith('STOCK-'));

                    if (linkedOrderNumbers.length > 0) {
                        const { data: linkedPreRemitos } = await supabase
                            .from('pre_remitos')
                            .select('items, id_inventory')
                            .in('order_number', linkedOrderNumbers)
                            .is('deleted_at', null);

                        if (linkedPreRemitos && linkedPreRemitos.length > 0) {
                            const mergedItemsMap = {};
                            const inventoryIds = new Set();
                            linkedPreRemitos.forEach(pr => {
                                if (pr.id_inventory) inventoryIds.add(pr.id_inventory);
                                (pr.items || []).forEach(item => {
                                    const code = String(item.code).trim();
                                    if (!mergedItemsMap[code]) {
                                        mergedItemsMap[code] = {
                                            ...item,
                                            code,
                                            id_inventory: pr.id_inventory || null
                                        };
                                    } else {
                                        mergedItemsMap[code].quantity += (item.quantity || 0);
                                        // Si el producto está en otro pre-remito, concatenamos el ID de inventario si es distinto
                                        if (pr.id_inventory && mergedItemsMap[code].id_inventory !== pr.id_inventory) {
                                            if (!mergedItemsMap[code].id_inventory) {
                                                mergedItemsMap[code].id_inventory = pr.id_inventory;
                                            } else if (!mergedItemsMap[code].id_inventory.includes(pr.id_inventory)) {
                                                mergedItemsMap[code].id_inventory += `, ${pr.id_inventory}`;
                                            }
                                        }
                                    }
                                });
                            });
                            items = Object.values(mergedItemsMap);
                            // Set id_inventory from the first found (or comma separated if many, but usually it's one)
                            if (inventoryIds.size > 0) {
                                generalCount.id_inventory = Array.from(inventoryIds).join(', ');
                            }
                        }
                    }

                    // Fallback to original logic if NO linked items found or NOT a grouped stock import
                    if (items.length === 0) {
                        if (generalCount.sucursal_id) {
                            console.log(`Fetching stock for general count ${generalCount.id} from branch ${generalCount.sucursal_id}`);
                            const branchStock = await fetchBranchStock(generalCount.sucursal_id);

                            if (branchStock && branchStock.length > 0) {
                                items = branchStock.map(s => ({
                                    code: s.product_code,
                                    name: s.products?.description || 'Desconocido',
                                    description: s.products?.description || 'Desconocido',
                                    quantity: Number(s.quantity),
                                    brand: s.products?.brand,
                                    brand_code: s.products?.brand_code
                                }));
                            } else {
                                const allProducts = await fetchAllProductsDetailed();

                                items = (allProducts || []).map(p => ({
                                    code: p.code,
                                    name: p.description,
                                    description: p.description,
                                    quantity: 0,
                                    brand: p.brand,
                                    brand_code: p.brand_code
                                }));
                            }
                        } else {
                            const allProducts = await fetchAllProductsDetailed();

                            items = (allProducts || []).map(p => ({
                                code: p.code,
                                name: p.description,
                                description: p.description,
                                quantity: p.current_stock || 0,
                                brand: p.brand,
                                brand_code: p.brand_code
                            }));
                        }
                    }

                    remito = {
                        id: generalCount.id,
                        remito_number: generalCount.id,
                        count_name: generalCount.name,
                        id_inventory: generalCount.id_inventory,
                        items: items,
                        date: generalCount.created_at,
                        status: 'pending',
                        numero_pv: '-',
                        sucursal: generalCount.sucursal_id ? 'Sucursal Seleccionada' : '-', // We could fetch name, but ID is enough for logic
                        sucursal_id: generalCount.sucursal_id
                    };
                    isFinalized = false;
                }
            }
        }
    }

    if (!remito) {
        return { error: 'Conteo no encontrado' };
    }

    // Fetch Count Name for finalized ones if not already set
    if (isFinalized && remito.remito_number && !remito.count_name) {
        const { data: countData } = await supabase
            .from('general_counts')
            .select('name')
            .eq('id', remito.remito_number)
            .maybeSingle();
        if (countData) remito.count_name = countData.name;
    }

    // 3. Fetch Scans
    // Use pagination helper to ensure we get ALL scans
    const scans = await getAllScans(remito.remito_number);
    console.log(`[DEBUG_DETAILS] Scans found in DB for order ${remito.remito_number}: ${scans ? scans.length : 0}`);

    // Create a mapping of code to id_inventory from pre_remito items
    const productInventoryMap = {};
    if (remito.items && remito.items.length > 0) {
        remito.items.forEach(item => {
            if (item.code && item.id_inventory) {
                productInventoryMap[item.code] = item.id_inventory;
            }
        });
    }

    // Special case: if it's a multi-order remito, fetch all related pre-remito items to get inventory IDs
    if (remito.remito_number && remito.remito_number.includes(',')) {
        const orderNumbers = remito.remito_number.split(',').map(n => n.trim());
        const { data: multiplePreRemitos } = await supabase
            .from('pre_remitos')
            .select('items, id_inventory')
            .in('order_number', orderNumbers)
            .is('deleted_at', null);

        if (multiplePreRemitos) {
            multiplePreRemitos.forEach(pr => {
                const invId = pr.id_inventory;
                if (invId && pr.items) {
                    pr.items.forEach(item => {
                        const code = String(item.code).trim();
                        if (code) {
                            productInventoryMap[code] = invId;
                        }
                    });
                }
            });
        }
    }

    let userCounts = [];
    let totalScannedMap = {};
    const userMap = {};
    const productMap = {};
    let enrichedScans = [];

    if (scans && scans.length > 0) {
        const userIds = [...new Set(scans.map(s => s.user_id))];
        const codes = [...new Set(scans.map(s => s.code))];

        const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
        const { data: products } = await supabase.from('products').select('code, description, brand, brand_code').in('code', codes);

        if (users) users.forEach(u => userMap[u.id] = u.username);
        // Store complete product info including brand
        if (products) products.forEach(p => productMap[p.code] = {
            description: p.description,
            brand: p.brand,
            brand_code: p.brand_code
        });

        const userCountsMap = {};
        scans.forEach(scan => {
            const username = userMap[scan.user_id] || 'Desconocido';
            const qty = scan.quantity || 0;
            const productInfo = productMap[scan.code] || { description: 'Sin descripción', brand: null, brand_code: null };

            // Track totals for active discrepancy calculation
            totalScannedMap[scan.code] = (totalScannedMap[scan.code] || 0) + qty;

            if (!userCountsMap[username]) {
                userCountsMap[username] = { username, items: [], totalItems: 0, totalUnits: 0 };
            }
            userCountsMap[username].items.push({
                code: scan.code,
                description: productInfo.description,
                brand: productInfo.brand,
                brand_code: productInfo.brand_code,
                quantity: qty
            });
            userCountsMap[username].totalItems += 1;
            userCountsMap[username].totalUnits += qty;

            enrichedScans.push({
                ...scan,
                users: { username },
                products: { description: productInfo.description }
            });
        });
        userCounts = Object.values(userCountsMap);
    } else if (isFinalized) {
        // Fallback for finalized remitos with no granular scans
        userCounts = [{
            username: remito.created_by || 'Sistema',
            items: remito.items || [],
            totalItems: remito.items ? remito.items.length : 0,
            totalUnits: remito.items ? remito.items.reduce((acc, i) => acc + (i.quantity || 0), 0) : 0
        }];
    }

    // 4. Discrepancies Calculation (Live if not finalized)
    if (!isFinalized && remito.items && remito.items.length > 0) {
        const discrepancies = { missing: [], extra: [] };

        // Expected vs Scanned
        remito.items.forEach(expected => {
            const scannedQty = totalScannedMap[expected.code] || 0;
            if (scannedQty < expected.quantity) {
                discrepancies.missing.push({
                    code: expected.code,
                    description: expected.description || expected.name,
                    expected: expected.quantity,
                    scanned: scannedQty,
                    id_inventory: expected.id_inventory || productInventoryMap[expected.code] || null // Conservar el ID de inventario
                });
            }
        });

        // Scanned vs Expected
        Object.keys(totalScannedMap).forEach(code => {
            const expected = remito.items.find(i => i.code === code);
            const scannedQty = totalScannedMap[code];

            // Only add to extra if scanned quantity is > 0 and (not in expected OR scanned > expected)
            if (scannedQty > 0) {
                if (!expected) {
                    const productInfo = productMap[code];
                    discrepancies.extra.push({
                        code,
                        description: productInfo ? productInfo.description : 'Desconocido',
                        expected: 0,
                        scanned: scannedQty
                    });
                } else if (scannedQty > expected.quantity) {
                    discrepancies.extra.push({
                        code,
                        description: expected.description || expected.name,
                        expected: expected.quantity,
                        scanned: scannedQty,
                        id_inventory: expected.id_inventory || productInventoryMap[code] || null // Conservar el ID de inventario
                    });
                }
            }
        });

        // Enrich all descriptions (Expected and Extra)
        // Optimization: Use already fetched productMap first to reduce codes to query
        const missingCodes = new Set();

        const checkItem = (item) => {
            if (!item.description || item.description === 'Desconocido' || item.description === 'Sin descripción') {
                if (productMap[item.code]) {
                    item.description = productMap[item.code].description;
                    item.name = productMap[item.code].description;
                    item.brand = productMap[item.code].brand;
                } else {
                    missingCodes.add(item.code);
                }
            }
        };

        (remito.items || []).forEach(checkItem);
        (discrepancies.missing || []).forEach(checkItem);
        (discrepancies.extra || []).forEach(checkItem);

        if (missingCodes.size > 0) {
            // Only fetch what's truly missing. This list will likely be small (<1000).
            const { data: pData } = await supabase.from('products').select('code, description, brand').in('code', [...missingCodes]);
            if (pData) {
                const pMap = {};
                pData.forEach(p => pMap[p.code] = { description: p.description, brand: p.brand });

                const updateItem = (item) => {
                    if (pMap[item.code]) {
                        item.description = pMap[item.code].description;
                        item.name = pMap[item.code].description;
                        item.brand = pMap[item.code].brand;
                    }
                };

                (remito.items || []).forEach(updateItem);
                (discrepancies.missing || []).forEach(updateItem);
                (discrepancies.extra || []).forEach(updateItem);
            }
        }
        remito.discrepancies = discrepancies;
    } else if (isFinalized && remito.discrepancies) {
        // Enrich descriptions for all items in finalized remitos
        const missingCodes = new Set();

        const checkItem = (item) => {
            if (!item.description || item.description === 'Desconocido' || item.description === 'Sin descripción') {
                if (productMap[item.code]) {
                    item.description = productMap[item.code].description;
                    item.name = productMap[item.code].description;
                    item.brand = productMap[item.code].brand;
                } else {
                    missingCodes.add(item.code);
                }
            }
        };

        const updateItem = (item) => {
            if (pMap && pMap[item.code]) {
                item.description = pMap[item.code].description;
                item.name = pMap[item.code].description;
                item.brand = pMap[item.code].brand;
            }
        };

        (remito.items || []).forEach(checkItem);
        (remito.discrepancies.missing || []).forEach(checkItem);
        (remito.discrepancies.extra || []).forEach(checkItem);

        if (missingCodes.size > 0) {
            const { data: prods } = await supabase.from('products').select('code, description, brand').in('code', [...missingCodes]);
            if (prods) {
                const pMapLocal = {};
                prods.forEach(p => pMapLocal[p.code] = { description: p.description, brand: p.brand });

                const updateItemLocal = (item) => {
                    if (pMapLocal[item.code]) {
                        item.description = pMapLocal[item.code].description;
                        item.name = pMapLocal[item.code].description;
                        item.brand = pMapLocal[item.code].brand;
                    }
                };

                (remito.items || []).forEach(updateItemLocal);
                (remito.discrepancies.missing || []).forEach(updateItemLocal);
                (remito.discrepancies.extra || []).forEach(updateItemLocal);
            }
        }
    }

    // Final marking of finalized status
    remito.is_finalized = isFinalized;

    return { remito, userCounts, isFinalized, scans: enrichedScans };
}

// Get Remito Details with User Breakdown (Supports In-Progress counts)
router.get('/remitos/:id/details', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const details = await getFullRemitoDetails(id);

        if (details.error) {
            return res.status(404).json({ message: details.error });
        }

        console.log(`[DEBUG_DETAILS] Fetched details for ID ${id}. Finalized: ${details.isFinalized}. Found remito_number: ${details.remito.remito_number}`);
        res.json({ remito: details.remito, userCounts: details.userCounts, is_finalized: details.isFinalized });
    } catch (error) {
        console.error('Error fetching remito details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Export Remito to Excel
router.get('/remitos/:id/export', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { type } = req.query; // 'full' or 'discrepancies' (default)

    try {
        const details = await getFullRemitoDetails(id);

        if (details.error) {
            return res.status(404).json({ message: details.error });
        }

        const { remito, scans, userCounts } = details;
        const countName = remito.count_name || remito.remito_number;
        const isFullExport = type === 'full';

        const workbook = xlsx.utils.book_new();

        // Map to find the last scanner for each product
        const lastScannerMap = {};
        if (scans && scans.length > 0) {
            const sortedScans = [...scans].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            sortedScans.forEach(s => {
                const code = String(s.code).trim();
                if (!lastScannerMap[code]) {
                    lastScannerMap[code] = s.users?.username || 'Desconocido';
                }
            });
        }

        let exportData = [];

        if (isFullExport) {
            // --- FULL REPORT LOGIC ---
            // 1. Get all expected items
            const expectedItems = remito.items || [];
            const allCodes = new Set(expectedItems.map(i => String(i.code).trim()));

            // 2. Add all scanned items (including extras)
            const totalScannedMap = {};
            if (userCounts) {
                userCounts.forEach(u => {
                    u.items.forEach(item => {
                        const code = String(item.code).trim();
                        totalScannedMap[code] = (totalScannedMap[code] || 0) + (item.quantity || 0);
                        allCodes.add(code);
                    });
                });
            }

            // 3. Match them up
            const codesArray = Array.from(allCodes).sort();

            // Pre-fetch product info for descriptions of extra items if needed
            const missingProductInfoCodes = codesArray.filter(c => !expectedItems.find(ei => String(ei.code).trim() === c));
            let extraProductMap = {};
            if (missingProductInfoCodes.length > 0) {
                const { data: extras } = await supabase.from('products').select('code, description').in('code', missingProductInfoCodes);
                if (extras) extras.forEach(p => extraProductMap[String(p.code).trim()] = p.description);
            }

            exportData = codesArray.map(code => {
                const expectedItem = expectedItems.find(ei => String(ei.code).trim() === code);
                const scannedQty = totalScannedMap[code] || 0;
                const expectedQty = expectedItem ? (expectedItem.quantity || 0) : 0;
                const description = expectedItem ? (expectedItem.description || expectedItem.name) : (extraProductMap[code] || 'Producto Extra / Desconocido');

                return {
                    'ID Inventario': expectedItem?.id_inventory || '-',
                    Codigo: code,
                    Descripcion: description,
                    'Stock actual': expectedQty,
                    'Cantidad Esc': scannedQty,
                    Diferencia: scannedQty - expectedQty,
                    'Último Escaneo': lastScannerMap[code] || '-'
                };
            });
        } else {
            // --- DISCREPANCIES ONLY LOGIC (DEFAULT) ---
            if (remito.discrepancies?.missing) {
                remito.discrepancies.missing.forEach(d => {
                    const code = String(d.code).trim();
                    exportData.push({
                        'ID Inventario': d.id_inventory || '-',
                        Codigo: d.code,
                        Descripcion: d.description,
                        'Stock actual': d.expected,
                        'Cantidad Esc': d.scanned,
                        Diferencia: d.scanned - d.expected,
                        'Último Escaneo': lastScannerMap[code] || '-'
                    });
                });
            }
            if (remito.discrepancies?.extra) {
                remito.discrepancies.extra.forEach(d => {
                    const code = String(d.code).trim();
                    exportData.push({
                        'ID Inventario': d.id_inventory || '-',
                        Codigo: d.code,
                        Descripcion: d.description,
                        'Stock actual': d.expected,
                        'Cantidad Esc': d.scanned,
                        Diferencia: d.scanned - d.expected,
                        'Último Escaneo': lastScannerMap[code] || '-'
                    });
                });
            }
        }

        const sheetName = isFullExport ? "Reporte Completo" : "Diferencias";
        if (exportData.length > 0) {
            const ws = xlsx.utils.json_to_sheet(exportData);
            xlsx.utils.book_append_sheet(workbook, ws, sheetName);
        } else {
            const ws = xlsx.utils.json_to_sheet([{ Info: isFullExport ? "Sin items" : "Sin discrepancias" }]);
            xlsx.utils.book_append_sheet(workbook, ws, sheetName);
        }

        const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const fileName = isFullExport ? `Reporte_Completo_${countName}.xlsx` : `Reporte_Diferencias_${countName}.xlsx`;

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error('Error generating excel:', error);
        res.status(500).json({ message: 'Error generating excel' });
    }
});

// Export ALL Remitos list to Excel
router.get('/remitos-list/export', verifyToken, async (req, res) => {
    try {
        // Fetch ALL remitos using pagination to bypass 1000 record limit
        let remitosData = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('remitos')
                .select('*')
                .is('deleted_at', null)
                .order('date', { ascending: false })
                .range(from, from + step - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                remitosData = [...remitosData, ...data];
                from += step;
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        const { data: countsData } = await supabase
            .from('general_counts')
            .select('id, name, sucursal_name');

        const countsMap = {};
        const sucursalMap = {};
        if (countsData) {
            countsData.forEach(c => {
                countsMap[c.id] = c.name;
                sucursalMap[c.id] = c.sucursal_name;
            });
        }

        const exportData = (remitosData || []).map(r => ({
            'Fecha': new Date(r.date).toLocaleDateString(),
            'Hora': new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            'Conteo / Remito': countsMap[r.remito_number] || r.remito_number,
            'Sucursal': r.sucursal && r.sucursal !== '-' ? r.sucursal : (sucursalMap[r.remito_number] || '-'),
            'Items': r.items?.length || 0,
            'Usuario': r.created_by || 'Sistema',
            'Estado': r.is_finalized ? 'Finalizado' : 'En curso'
        }));

        const workbook = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(exportData);
        xlsx.utils.book_append_sheet(workbook, ws, "Historial de Remitos");

        const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="Listado_Historial_${new Date().toISOString().slice(0,10)}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (error) {
        console.error('Error exporting remitos list:', error);
        res.status(500).json({ message: 'Error generating list excel' });
    }
});

// Get remito by ID
router.get('/remitos/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        let { data, error } = await supabase
            .from('remitos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Lazy Repair: If it's a General Count (check by trying to find it in general_counts) 
        // AND discrepancies are missing/empty, try to generate them.
        if (!data.discrepancies || Object.keys(data.discrepancies).length === 0) {
            // Check if this remito_number corresponds to a General Count
            const { data: generalCount } = await supabase
                .from('general_counts')
                .select('id')
                .eq('id', data.remito_number)
                .maybeSingle();

            if (generalCount) {
                console.log(`Reparing discrepancies for General Count Remito: ${id}`);

                // Reuse logic to generate report (Paginated)
                const scans = await getAllScans(data.remito_number);

                // const { data: scans } = await supabase
                //     .from('inventory_scans')
                //     .select('code, quantity')
                //     .eq('order_number', data.remito_number); // Use remito_number (which is the count ID)

                if (scans && scans.length > 0) {
                    const totals = {};
                    scans.forEach(scan => {
                        totals[scan.code] = (totals[scan.code] || 0) + (scan.quantity || 0);
                    });

                    const codes = Object.keys(totals);
                    let productsMap = {};

                    if (codes.length > 0) {
                        // Use the new getAllProducts helper to avoid same 1000 limit here if count is large
                        const allProductsList = await getAllProducts();
                        const products = allProductsList.filter(p => codes.includes(p.code));

                        if (products) {
                            products.forEach(p => productsMap[p.code] = p);
                        }
                    }

                    const report = codes.map(code => {
                        const stock = productsMap[code]?.current_stock || 0;
                        const quantity = totals[code] || 0;
                        return {
                            code,
                            barcode: productsMap[code]?.barcode || '',
                            description: productsMap[code]?.description || 'Desconocido',
                            quantity,
                            stock,
                            difference: quantity - stock
                        };
                    });

                    report.sort((a, b) => a.description.localeCompare(b.description));

                    const discrepancies = {
                        missing: report.filter(i => i.difference < 0).map(i => ({
                            code: i.code,
                            barcode: i.barcode,
                            description: i.description,
                            expected: i.stock,
                            scanned: i.quantity,
                            reason: 'missing'
                        })),
                        extra: report.filter(i => i.difference > 0).map(i => ({
                            code: i.code,
                            barcode: i.barcode,
                            description: i.description,
                            expected: i.stock,
                            scanned: i.quantity
                        }))
                    };

                    // Update DB
                    await supabase
                        .from('remitos')
                        .update({ discrepancies: discrepancies })
                        .eq('id', id);

                    // Update local data object to return fresh info
                    data.discrepancies = discrepancies;
                }
            }
        }

        // Also fetch count name if possible to enrich response directly
        // (Though frontend might need it from list or separate call, let's try to add it here if it's a general count)
        if (data.remito_number) {
            const { data: countData } = await supabase
                .from('general_counts')
                .select('name')
                .eq('id', data.remito_number)
                .maybeSingle();

            if (countData) {
                data.count_name = countData.name;
            }
        }

        res.json(data);
    } catch (error) {
        console.error('Error fetching remito:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create new pre-remito (simulating external system)
router.post('/pre-remitos', verifyToken, async (req, res) => {
    const { orderNumber, items } = req.body;

    if (!orderNumber || !items || items.length === 0) {
        return res.status(400).json({ message: 'Missing order number or items' });
    }

    try {
        const { data, error } = await supabase
            .from('pre_remitos')
            .insert([
                {
                    order_number: orderNumber,
                    items: items
                }
            ])
            .select();

        if (error) throw error;

        res.status(201).json(data[0]);
    } catch (error) {
        console.error('Error creating pre-remito:', error);
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ message: 'Pre-remito already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all pre-remitos (for selection list)
// Get all pre-remitos (for selection list) with PV info
router.get('/pre-remitos', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pre_remitos')
            .select(`
                id,
                order_number,
                id_inventory,
                created_at,
                pedidos_ventas (
                    numero_pv,
                    sucursal
                )
            `)
            .is('deleted_at', null)
            .neq('status', 'processed') // Filter out processed orders
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Flatten the structure for easier frontend consumption
        let formattedData = data.map(item => ({
            ...item,
            numero_pv: item.pedidos_ventas?.[0]?.numero_pv || null,
            sucursal: item.pedidos_ventas?.[0]?.sucursal || null
        }));

        // Filter by branch if not admin
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            const { sucursal_id } = req.user;
            if (sucursal_id) {
                // Get branch name
                const { data: branchData, error: branchError } = await supabase
                    .from('sucursales')
                    .select('name')
                    .eq('id', sucursal_id)
                    .single();

                if (!branchError && branchData) {
                    const userBranchName = branchData.name;
                    // Filter: Keep if matches branch OR is 'Global' OR has no branch assigned (optional, assuming 'Global' if null?)
                    // User request: "only those belonging to that branch".
                    // So strict filtering: match branch name OR explicit 'Global'.
                    formattedData = formattedData.filter(item => {
                        const itemBranch = item.sucursal;
                        if (!itemBranch) return true; // Show if no branch is specified (safest default, or false?) -> Let's keep it visible so they don't lose loose orders.
                        if (itemBranch.toLowerCase() === 'global') return true;

                        // Normalize for comparison
                        return itemBranch.toLowerCase().trim() === userBranchName.toLowerCase().trim();
                    });
                }
            } else {
                // User has no branch assigned.
                // Should they see everything? or nothing?
                // Probably nothing or only Global?
                // Let's assume if no branch assigned, they see nothing branch-specific, only Global/Generic.
                formattedData = formattedData.filter(item => !item.sucursal || item.sucursal.toLowerCase() === 'global');
            }
        }

        res.json(formattedData);
    } catch (error) {
        console.error('Error fetching pre-remitos:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get pre-remito by order number
router.get('/pre-remitos/:orderNumber', verifyToken, async (req, res) => {
    const { orderNumber } = req.params;
    try {
        const { data, error } = await supabase
            .from('pre_remitos')
            .select(`
                *,
                pedidos_ventas (
                    numero_pv,
                    sucursal
                )
            `)
            .eq('order_number', orderNumber)
            .is('deleted_at', null)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // Not found
                return res.status(404).json({ message: 'Pre-remito not found' });
            }
            throw error;
        }

        // ENRICHMENT: Fetch units and brands for items if missing
        if (data.items && data.items.length > 0) {
            const codes = data.items.map(i => i.code);
            const { data: products } = await supabase
                .from('products')
                .select('code, brand, primary_unit, secondary_unit, conversion_factor, conversion_type')
                .in('code', codes);

            if (products) {
                const productMap = {};
                products.forEach(p => productMap[p.code] = p);

                data.items = data.items.map(item => {
                    const match = productMap[item.code];
                    return {
                        ...item,
                        brand: item.brand || (match ? match.brand : 'Sin Marca'),
                        primary_unit: match ? match.primary_unit : null,
                        secondary_unit: match ? match.secondary_unit : null,
                        conversion_factor: match ? match.conversion_factor : null,
                        conversion_type: match ? match.conversion_type : null
                    };
                });
            }
        }

        // Flatten info
        const responseData = {
            ...data,
            numero_pv: data.pedidos_ventas?.[0]?.numero_pv || null,
            sucursal: data.pedidos_ventas?.[0]?.sucursal || null,
            pedidos_ventas: undefined // Remove the array
        };

        res.json(responseData);
    } catch (error) {
        console.error('Error fetching pre-remito:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Import Stock from XML (ERP)
router.post('/pre-remitos/import-xml', verifyToken, multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
    const { sucursal } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const { items, inventoryId } = await parseExcelXml(req.file.buffer);

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No valid items found in XML' });
        }

        // 0. Fetch existing products to get barcodes and avoid overwriting with null
        const uniqueCodes = [...new Set(items.map(i => i.code))];
        const { data: existingProducts } = await supabase
            .from('products')
            .select('code, barcode, primary_unit, secondary_unit, conversion_factor, conversion_type')
            .in('code', uniqueCodes);

        const dbProductMap = new Map();
        if (existingProducts) {
            existingProducts.forEach(p => {
                dbProductMap.set(p.code, p);
            });
        }

        // Enrich items with barcodes and units from DB if not present in XML
        items.forEach(item => {
            const dbProd = dbProductMap.get(item.code);
            if (dbProd) {
                if (!item.barcode && dbProd.barcode) item.barcode = dbProd.barcode;
                item.primary_unit = dbProd.primary_unit;
                item.secondary_unit = dbProd.secondary_unit;
                item.conversion_factor = dbProd.conversion_factor;
                item.conversion_type = dbProd.conversion_type;
            }
        });

        const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
        const orderNumber = `STOCK-${new Date().toISOString().split('T')[0]}-${Date.now().toString().slice(-4)}-${randomSuffix}`;

        // 1. Upsert Products (Ensure they exist in DB)
        // Extract unique products
        const productsMap = new Map();
        items.forEach(item => {
            if (!productsMap.has(item.code)) {
                productsMap.set(item.code, {
                    code: item.code,
                    description: item.description,
                    barcode: item.barcode // Using enriched barcode
                });
            }
        });

        const productsParams = Array.from(productsMap.values());

        // Upsert in batches
        const batchSize = 1000;
        for (let i = 0; i < productsParams.length; i += batchSize) {
            const batch = productsParams.slice(i, i + batchSize);
            const { error: prodError } = await supabase
                .from('products')
                .upsert(batch, { onConflict: 'code' }); // Update description/barcode if code exists

            if (prodError) console.error('Error upserting products batch:', prodError);
        }

        // 2. Create Pre-Remito (Inventory Session)
        const { data, error } = await supabase
            .from('pre_remitos')
            .insert([
                {
                    order_number: orderNumber,
                    id_inventory: inventoryId,
                    items: items, // Save parsed items [ {code, description, quantity}, ... ]
                    status: 'pending'
                }
            ])
            .select()
            .single();

        if (error) throw error;

        // 3. Create entry in pedidos_ventas for branch info
        if (sucursal) {
            const { error: pvError } = await supabase
                .from('pedidos_ventas')
                .insert([{
                    order_number: orderNumber,
                    sucursal: sucursal,
                    numero_pv: null // Placeholder as XML might not have a PV number directly
                }]);

            if (pvError) console.error('Error creating pedidos_ventas record:', pvError);
        }

        res.json({
            message: 'Stock imported successfully',
            orderNumber: data.order_number,
            itemCount: items.length
        });

    } catch (error) {
        console.error('CRITICAL ERROR importing XML:', error);
        console.error('Error stack:', error.stack);

        let clientMessage = 'Error al importar el archivo XML';
        if (error.message) {
            clientMessage += ': ' + error.message;
        }

        res.status(500).json({
            message: clientMessage,
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// General Counts API
router.get('/general-counts/active', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('general_counts')
            .select('*, sucursales(name)')
            .eq('status', 'open')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching active counts:', error);
            return res.status(500).json({ message: 'Error fetching active counts' });
        }

        let counts = data.map(c => ({
            ...c,
            sucursal_name: c.sucursales ? c.sucursales.name : null
        }));

        // Filter by branch if not admin
        if (req.user.role !== 'admin') {
            const { sucursal_id } = req.user;
            if (sucursal_id) {
                counts = counts.filter(c => !c.sucursal_id || c.sucursal_id == sucursal_id);
            } else {
                // If user has no branch, only show global ones (no sucursal_id)
                counts = counts.filter(c => !c.sucursal_id);
            }
        }

        res.json(counts);
    } catch (error) {
        console.error('Server error fetching active counts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/general-counts', verifyToken, async (req, res) => {
    const { name, sucursal_id, product_codes } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    try {
        let finalSucursalId = sucursal_id || null;
        let createdBy = req.user.id;

        // Enforce branch for non-admins
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            if (!req.user.sucursal_id) {
                return res.status(403).json({ message: 'Usuario sin sucursal asignada no puede crear conteos.' });
            }
            finalSucursalId = req.user.sucursal_id;
        }

        // Check for active count in the same branch
        let query = supabase
            .from('general_counts')
            .select('id')
            .eq('status', 'open')
            .is('deleted_at', null);

        if (finalSucursalId) {
            query = query.eq('sucursal_id', finalSucursalId);
        } else {
            query = query.is('sucursal_id', null);
        }

        const { data: activeCounts, error: activeError } = await query;

        if (activeError) throw activeError;

        if (activeCounts && activeCounts.length > 0) {
            return res.status(400).json({ message: 'Ya existe un conteo activo en esta sucursal. Finalice el conteo actual antes de iniciar uno nuevo.' });
        }

        const insertPayload = {
            name,
            status: 'open',
            sucursal_id: finalSucursalId,
            created_by: createdBy
        };
        if (Array.isArray(product_codes) && product_codes.length > 0) {
            insertPayload.product_codes = product_codes;
        }

        const { data, error } = await supabase
            .from('general_counts')
            .insert([insertPayload])
            .select()
            .single();

        if (error) {
            // Handle FK violation (User ID mismatch between public.users and auth.users/referenced table)
            if (error.code === '23503') {
                console.warn(`FK Violation on created_by (${createdBy}). Retrying with NULL.`);
                const { data: retryData, error: retryError } = await supabase
                    .from('general_counts')
                    .insert([{ ...insertPayload, created_by: null }])
                    .select()
                    .single();

                if (retryError) throw retryError;
                return res.json(retryData);
            }

            if (error.code === '42P01') {
                return res.status(500).json({ message: 'Table missing. Run setup_general_counts.sql' });
            }
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('Error creating count:', error);
        res.status(500).json({ message: 'Error creating count' });
    }
});

router.put('/general-counts/:id/close', verifyToken, hasPermission('close_counts'), async (req, res) => {
    const { id } = req.params;
    let step = 'init';

    try {
        step = 'fetch_scans';
        // 1. Generate Report Data (Fetch ALL scans paginated)
        const scans = await getAllScans(id);
        console.log(`[CLOSE_COUNT] ${id}: Fetched ${scans.length} scans`);

        step = 'aggregate_scans';
        // Aggregate
        const totals = {};
        scans.forEach(scan => {
            totals[scan.code] = (totals[scan.code] || 0) + (scan.quantity || 0);
        });

        const codes = Object.keys(totals);

        step = 'fetch_count_info';
        // 2. Fetch the current count info to get the name and other details
        const { data: currentCount, error: countFetchError } = await supabase
            .from('general_counts')
            .select('*')
            .eq('id', id)
            .is('deleted_at', null)
            .single();

        if (countFetchError || !currentCount) {
            throw new Error(`No se pudo encontrar el conteo para cerrar: ${countFetchError?.message || 'No encontrado'}`);
        }

        // 3. Resolve Reference Products (Expected Stock)
        let allProducts = [];

        step = 'resolve_references';
        // Check if grouped stock import
        const parts = (currentCount.name || '').split(',').map(s => s.trim());
        const linkedOrderNumbers = parts.filter(p => p.startsWith('STOCK-'));

        if (linkedOrderNumbers.length > 0) {
            console.log(`[CLOSE_COUNT] ${id}: Resolving products from ${linkedOrderNumbers.length} orders`);
            const { data: linkedPreRemitos, error: preRemitosError } = await supabase
                .from('pre_remitos')
                .select('items, id_inventory, order_number')
                .in('order_number', linkedOrderNumbers);

            if (preRemitosError) throw preRemitosError;

            if (linkedPreRemitos && linkedPreRemitos.length > 0) {
                const mergedItemsMap = {};
                const inventoryIds = new Set();
                
                linkedPreRemitos.forEach(pr => {
                    // Safe conversion to string for ID
                    const prInvId = pr.id_inventory ? String(pr.id_inventory).trim() : null;
                    if (prInvId) inventoryIds.add(prInvId);
                    
                    (pr.items || []).forEach(item => {
                        const code = String(item.code).trim();
                        if (!mergedItemsMap[code]) {
                            mergedItemsMap[code] = {
                                code: code,
                                description: item.description,
                                current_stock: item.quantity || 0,
                                id_inventory: prInvId
                            };
                        } else {
                            mergedItemsMap[code].current_stock += (item.quantity || 0);
                            // Multi-inventory resolution string-safe
                            if (prInvId) {
                                let currentInv = mergedItemsMap[code].id_inventory;
                                if (!currentInv) {
                                    mergedItemsMap[code].id_inventory = prInvId;
                                } else {
                                    const currentInvStr = String(currentInv);
                                    if (!currentInvStr.includes(prInvId)) {
                                        mergedItemsMap[code].id_inventory = currentInvStr + `, ${prInvId}`;
                                    }
                                }
                            }
                        }
                    });
                });

                if (inventoryIds.size > 0) {
                    currentCount.id_inventory = Array.from(inventoryIds).join(', ');
                }

                step = 'fetch_barcodes';
                // Enrich with barcodes from products table
                const codesList = Object.keys(mergedItemsMap);
                if (codesList.length > 0) {
                    const barMap = {};
                    const batchSize = 1000;
                    for (let i = 0; i < codesList.length; i += batchSize) {
                        const batch = codesList.slice(i, i + batchSize);
                        const { data: bars, error: barsError } = await supabase
                            .from('products')
                            .select('code, barcode')
                            .in('code', batch);
                        
                        if (barsError) console.error(`[CLOSE_COUNT] ${id}: Error fetching barcodes batch:`, barsError);
                        if (bars) bars.forEach(b => barMap[b.code] = b.barcode);
                    }

                    allProducts = Object.values(mergedItemsMap).map(p => ({
                        ...p,
                        barcode: barMap[p.code] || ''
                    }));
                }
            }
        }

        // Fallback: If not grouped or no items found, use FULL master list
        if (allProducts.length === 0) {
            step = 'fallback_get_all_products';
            console.log(`[CLOSE_COUNT] ${id}: Using fallback (FULL products list)`);
            allProducts = await getAllProducts();
        }

        step = 'build_report';
        // Build Report Array iterating over ALL products
        const report = allProducts.map(product => {
            const quantity = totals[product.code] || 0;
            return {
                code: product.code,
                id_inventory: product.id_inventory || null,
                barcode: product.barcode || '',
                description: product.description || 'Sin descripción',
                quantity,
                stock: product.current_stock || 0,
                difference: quantity - (product.current_stock || 0)
            };
        });

        // Add any scanned items that might not exist in products table
        const productCodes = new Set(allProducts.map(p => p.code));
        codes.forEach(scannedCode => {
            if (!productCodes.has(scannedCode)) {
                report.push({
                    code: scannedCode,
                    barcode: '',
                    description: 'Producto Desconocido (No en BD)',
                    quantity: totals[scannedCode],
                    stock: 0,
                    difference: totals[scannedCode]
                });
            }
        });

        report.sort((a, b) => {
            const descA = String(a.description || '');
            const descB = String(b.description || '');
            return descA.localeCompare(descB);
        });

        step = 'prepare_remito_data';
        // 4. Save snapshot to Remitos table (Snapshot of the result)
        const discrepancies = {
            missing: report.filter(i => i.difference < 0).map(i => ({
                code: i.code,
                id_inventory: i.id_inventory,
                barcode: i.barcode,
                description: i.description,
                expected: i.stock,
                scanned: i.quantity,
                reason: 'missing'
            })),
            extra: report.filter(i => i.difference > 0).map(i => ({
                code: i.code,
                id_inventory: i.id_inventory,
                barcode: i.barcode,
                description: i.description,
                expected: i.stock,
                scanned: i.quantity
            }))
        };

        const { data: existingRemito } = await supabase
            .from('remitos')
            .select('id')
            .eq('remito_number', id)
            .maybeSingle();

        const remitoData = {
            remito_number: id,
            id_inventory: currentCount.id_inventory || null,
            items: allProducts.map(p => ({
                code: p.code,
                description: p.description,
                quantity: p.current_stock || 0,
                id_inventory: p.id_inventory || null
            })),
            discrepancies: discrepancies,
            status: 'processed',
            date: new Date().toISOString(),
            created_by: req.user?.username || req.user?.id || 'Sistema'
        };

        step = 'upsert_remito_snapshot';
        let remitoResult;
        if (existingRemito) {
            remitoResult = await supabase.from('remitos').update(remitoData).eq('id', existingRemito.id);
        } else {
            remitoResult = await supabase.from('remitos').insert([remitoData]);
        }

        if (remitoResult.error) {
            console.error(`[CLOSE_COUNT] ${id}: Error saving remito snapshot:`, remitoResult.error);
            throw remitoResult.error;
        }

        step = 'update_count_status';
        // 5. FINALLY, Close the count only if everything above succeeded
        const { data: updatedCount, error: updateError } = await supabase
            .from('general_counts')
            .update({ status: 'closed', closed_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error(`[CLOSE_COUNT] ${id}: Error updating count status:`, updateError);
            throw updateError;
        }

        step = 'clean_up_linked_pre_remitos';
        // Update all linked pre-remitos to processed so they disappear from pending list
        const linkedOrdersRaw = (currentCount.name || '').split(',').map(s => s.trim());
        const stockOrders = linkedOrdersRaw.filter(o => o.startsWith('STOCK-'));
        
        if (stockOrders.length > 0) {
            await supabase
                .from('pre_remitos')
                .update({ status: 'processed' })
                .in('order_number', stockOrders);
        }

        console.log(`[CLOSE_COUNT] ${id}: Finalized successfully`);
        res.json({ count: updatedCount, report });

    } catch (error) {
        console.error(`[CLOSE_COUNT] CRITICAL ERROR at step [${step}] for count ${id}:`, error);
        res.status(500).json({ 
            message: 'Error al finalizar conteo', 
            details: error.message,
            step: step,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Inventory Scans Endpoints

// Get Inventory State (Progress)
router.get('/inventory/:orderNumber', verifyToken, async (req, res) => {
    const { orderNumber } = req.params;
    const userId = req.user.id;

    try {
        // 1. Get Expected Items (Pre-Remito OR General Count)
        let expectedItems = [];
        let isGeneralCount = false;

        // Try Pre-Remito first
        const { data: preRemito, error: preError } = await supabase
            .from('pre_remitos')
            .select('items')
            .eq('order_number', orderNumber)
            .is('deleted_at', null)
            .maybeSingle();

        if (preError) throw preError;

        if (preRemito) {
            expectedItems = preRemito.items || [];
        } else {
            // Fallback: Check General Counts
            const { data: generalCount, error: genError } = await supabase
                .from('general_counts')
                .select('id')
                .eq('id', orderNumber)
                .is('deleted_at', null)
                .maybeSingle();

            if (genError) throw genError;

            if (!generalCount) {
                return res.status(404).json({ message: 'Order not found' });
            }
            // General Count found - keep expectedItems empty (or logic to fetch stock could go here later)
            isGeneralCount = true;
        }

        // ENRICHMENT: Fetch brands for items that might be missing them
        if (expectedItems.length > 0) {
            const codes = expectedItems.map(i => i.code);
            // Fetch brands from products table
            const { data: products } = await supabase
                .from('products')
                .select('code, brand, primary_unit, secondary_unit, conversion_factor, conversion_type')
                .in('code', codes);

            if (products) {
                const productMap = {};
                products.forEach(p => productMap[p.code] = p);

                // Update expected items with brand and units
                expectedItems = expectedItems.map(item => {
                    const match = productMap[item.code];
                    return {
                        ...item,
                        brand: item.brand || (match ? match.brand : 'Sin Marca'),
                        primary_unit: match ? match.primary_unit : null,
                        secondary_unit: match ? match.secondary_unit : null,
                        conversion_factor: match ? match.conversion_factor : null,
                        conversion_type: match ? match.conversion_type : null
                    };
                });
            }
        }

        // 2. Get All Scans for this Order
        const { data: scans, error: scanError } = await supabase
            .from('inventory_scans')
            .select('user_id, code, quantity, timestamp')
            .eq('order_number', orderNumber);

        if (scanError) throw scanError;

        // 3. Aggregate Scans
        const scannedMap = {}; // { code: totalQuantity }
        const myScansMap = {}; // { code: myQuantity }
        const myTimestampsMap = {}; // { code: latestScanTimestamp }
        const myCodes = new Set();

        scans.forEach(scan => {
            const qty = scan.quantity || 0;

            // Global Total
            scannedMap[scan.code] = (scannedMap[scan.code] || 0) + qty;

            // My Scans
            if (scan.user_id === userId) {
                myScansMap[scan.code] = (myScansMap[scan.code] || 0) + qty;
                myCodes.add(scan.code);

                // Track latest activity for this code
                const scanTime = scan.timestamp ? new Date(scan.timestamp).getTime() : 0;
                if (!myTimestampsMap[scan.code] || scanTime > myTimestampsMap[scan.code]) {
                    myTimestampsMap[scan.code] = scanTime;
                }
            }
        });

        // 4. Enrich My Scans with Description for Frontend Restoration
        const myScansList = [];
        const missingCodes = [];

        // Map expected items for quick lookup
        const expectedMap = {};
        expectedItems.forEach(i => expectedMap[i.code] = i);

        Array.from(myCodes).forEach(code => {
            if (expectedMap[code]) {
                myScansList.push({
                    code: code,
                    name: expectedMap[code].description,
                    barcode: expectedMap[code].barcode,
                    quantity: myScansMap[code],
                    lastScan: myTimestampsMap[code] || 0
                });
            } else {
                missingCodes.push(code);
            }
        });

        // Fetch details for items not in expected list
        if (missingCodes.length > 0) {
            const { data: found } = await supabase
                .from('products')
                .select('code, description, barcode')
                .in('code', missingCodes);

            const foundMap = {};
            if (found) found.forEach(f => foundMap[f.code] = f);

            missingCodes.forEach(code => {
                const p = foundMap[code];
                myScansList.push({
                    code: code,
                    name: p ? p.description : 'Producto Desconocido',
                    barcode: p ? p.barcode : code,
                    quantity: myScansMap[code],
                    lastScan: myTimestampsMap[code] || 0
                });
            });
        }

        // Sort myScansList by last activity (Latest First)
        myScansList.sort((a, b) => b.lastScan - a.lastScan);

        res.json({
            orderNumber,
            expected: expectedItems, // Enriched with brands
            scanned: scannedMap,
            myScans: myScansMap,     // Legacy support
            myItems: myScansList     // Rich list for session restore
        });

    } catch (error) {
        console.error('Error fetching inventory state:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Submit/Sync Scans (Absolute Overwrite - Legacy)
router.post('/inventory/scan', verifyToken, async (req, res) => {
    const { orderNumber, items } = req.body; // items: [{ code, quantity }]

    if (!orderNumber || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Invalid data' });
    }

    try {
        const userId = req.user.id;
        console.log(`[DEBUG_SCAN] Incoming sync request for order ${orderNumber} from user ${userId}. Items count: ${items.length}`);
        if (items.length > 0) console.log(`[DEBUG_SCAN] Sample item:`, items[0]);

        /* Manual history logging removed as it is handled by DB triggers */

        // Prepare Upsert Data
        // Verify count isn't deleted if using General Count ID
        const { data: countCheck } = await supabase
            .from('general_counts')
            .select('id')
            .eq('id', orderNumber)
            .is('deleted_at', null)
            .maybeSingle();

        if (orderNumber.includes('-') === false && !countCheck) {
            // If it looks like a UUID (doesn't have STOCK-) and not found as active, reject
            return res.status(404).json({ message: 'Conteo no encontrado o eliminado' });
        }

        const upsertData = items.map(item => ({
            order_number: orderNumber,
            user_id: userId,
            code: item.code,
            quantity: item.quantity,
            timestamp: new Date().toISOString()
        }));

        const { error: upsertError } = await supabase
            .from('inventory_scans')
            .upsert(upsertData, { onConflict: 'order_number, user_id, code' });

        if (upsertError) throw upsertError;

        /* Manual history logging removed */


        console.log(`[DEBUG_SCAN] Synced ${items.length} items for order ${orderNumber} by user ${userId}`);

        res.json({ message: 'Scans synced successfully', count: items.length });

    } catch (error) {
        console.error('Error syncing scans:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Incremental Scan Endpoint (Read-Modify-Write)
router.post('/inventory/scan-incremental', verifyToken, async (req, res) => {
    const { orderNumber, items } = req.body; // items: [{ code, quantity }] - Quantity is DELTA

    if (!orderNumber || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Invalid data' });
    }

    try {
        const userId = req.user.id;
        const results = [];
        console.log(`[DEBUG_INCREMENTAL] Incoming request for order ${orderNumber} from user ${userId}. Items: ${JSON.stringify(items)}`);

        // Process sequentially to avoid race conditions on same row if multiple items target same code (unlikely but possible)
        for (const item of items) {
            const internalCode = String(item.code).trim();
            const delta = parseInt(item.quantity, 10);
            if (isNaN(delta) || delta === 0) continue;

            // 1. Fetch current value
            const { data: existing, error: fetchError } = await supabase
                .from('inventory_scans')
                .select('quantity')
                .match({ order_number: orderNumber, user_id: userId, code: internalCode })
                .maybeSingle();

            if (fetchError) throw fetchError;

            const newQuantity = (existing ? existing.quantity : 0) + delta;

            // 2. Upsert new value
            // Note: There is still a tiny race condition here if two requests interleave significantly,
            // but it is much safer than overwriting with frontend state 0.
            const { error: upsertError } = await supabase
                .from('inventory_scans')
                .upsert({
                    order_number: orderNumber,
                    user_id: userId,
                    code: internalCode,
                    quantity: newQuantity,
                    timestamp: new Date().toISOString()
                }, { onConflict: 'order_number, user_id, code' });

            if (upsertError) {
                console.error(`[DEBUG_INCREMENTAL] Error upserting ${internalCode}:`, upsertError);
                throw upsertError;
            }

            /* Manual history logging removed as it is handled by DB triggers */

            results.push({ code: internalCode, newQuantity });
        }

        console.log(`[DEBUG_INCREMENTAL] Updated ${results.length} items for order ${orderNumber} by user ${userId}`);

        res.json({ message: 'Scans incremented successfully', results });

    } catch (error) {
        console.error('Error incrementing scans:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get Inventory History (Audit Log)
router.get('/history/:orderNumber', verifyToken, async (req, res) => {
    const { orderNumber } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
        const { data: history, error } = await supabase
            .from('inventory_scans_history')
            .select('*')
            .eq('order_number', orderNumber)
            .order('changed_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        console.log(`[DEBUG_HISTORY] Fetching history for order: ${orderNumber}, Page: ${page}`);
        console.log(`[DEBUG_HISTORY] Records found: ${history ? history.length : 0}`);

        // Enrich with usernames
        const userIds = [...new Set(history.map(h => h.user_id).filter(Boolean))];
        const { data: users } = await supabase
            .from('users')
            .select('id, username')
            .in('id', userIds);

        const userMap = {};
        if (users) users.forEach(u => userMap[u.id] = u.username);

        // Enrich with Product Info
        const codes = [...new Set(history.map(h => h.code).filter(Boolean))];
        const products = await fetchProductsByCodes(codes);

        const productMap = {};
        if (products) products.forEach(p => productMap[p.code] = p.description);

        const enrichedHistory = history.map(entry => ({
            ...entry,
            username: userMap[entry.user_id] || 'Desconocido',
            description: productMap[entry.code] || 'Producto sin descripción'
        }));

        res.json({
            data: enrichedHistory,
            hasMore: history.length === limit,
            page,
            limit
        });

    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Export Inventory History to Excel
router.get('/history/:orderNumber/export', verifyToken, async (req, res) => {
    const { orderNumber } = req.params;

    try {
        // Fetch ALL history for this order using pagination to bypass 1000 record limit
        let history = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('inventory_scans_history')
                .select('*')
                .eq('order_number', orderNumber)
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

        // Enrich with usernames
        const userIds = [...new Set(history.map(h => h.user_id).filter(Boolean))];
        const { data: users } = await supabase
            .from('users')
            .select('id, username')
            .in('id', userIds);

        const userMap = {};
        if (users) users.forEach(u => userMap[u.id] = u.username);

        // Enrich with Product Info
        const codes = [...new Set(history.map(h => h.code).filter(Boolean))];
        const products = await fetchProductsByCodes(codes);

        const productMap = {};
        if (products) products.forEach(p => productMap[p.code] = p.description);

        // 1. Fetch Expected Items (from pre_remitos)
        const { data: preRemito } = await supabase
            .from('pre_remitos')
            .select('items')
            .eq('order_number', orderNumber)
            .is('deleted_at', null)
            .maybeSingle();
        
        const expectedMap = {};
        if (preRemito && preRemito.items) {
            preRemito.items.forEach(i => expectedMap[i.code] = i.quantity);
        }

        // 2. Fetch Current Global Totals (across all users)
        const scans = await getAllScans(orderNumber);
        const globalTotalsMap = {};
        if (scans) {
            scans.forEach(s => {
                globalTotalsMap[s.code] = (globalTotalsMap[s.code] || 0) + (s.quantity || 0);
            });
        }

        const exportData = history.map(entry => {
            const expected = expectedMap[entry.code] || 0;
            const globalTotal = globalTotalsMap[entry.code] || 0;

            return {
                'Fecha y Hora': new Date(entry.changed_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
                'Usuario': userMap[entry.user_id] || 'Desconocido',
                'Operación': entry.operation === 'INSERT' ? 'CREADO' : entry.operation === 'UPDATE' ? 'MODIFICADO' : 'ELIMINADO',
                'Código': entry.code,
                'Descripción': productMap[entry.code] || 'Sin descripción',
                'Cantidad Anterior': entry.old_data?.quantity || 0,
                'Cantidad Nueva': entry.new_data?.quantity || 0,
                'Diferencia': (entry.new_data?.quantity || 0) - (entry.old_data?.quantity || 0),
                'Total Acumulado': globalTotal,
                'Esperado': expected || '-',
                'Saldo': expected ? (globalTotal - expected) : '-'
            };
        });

        const workbook = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(exportData);
        xlsx.utils.book_append_sheet(workbook, ws, "Historial de Cambios");

        const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="Historial_Cambios_${orderNumber}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error('Error exporting history:', error);
        res.status(500).json({ message: 'Error generatig history excel' });
    }
});

// Upload PDF Remito
router.post('/remitos/upload-pdf', verifyToken, multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    const type = req.body.type || 'normal'; // 'normal' or 'overstock'
    const searchType = type === 'overstock' ? 'internal' : (type === 'normal' ? 'provider' : 'any');

    try {
        console.log(`Received PDF upload. Size: ${req.file.size} bytes`);
        let { items: extractedItems } = await parseRemitoPdf(req.file.buffer, false); // stopOnCopies = false for Ingresos

        // FALLBACK TO GEMINI if no items found (likely a scanned PDF)
        if (extractedItems.length === 0 && process.env.GEMINI_API_KEY) {
            console.log('[AI PDF PARSER] No items found with regex. Falling back to Gemini...');
            const pdfParts = [
                {
                    inlineData: {
                        data: req.file.buffer.toString("base64"),
                        mimeType: "application/pdf"
                    },
                },
            ];

            const prompt = `
                Eres un experto en extracción de datos de remitos de logística.
                Analiza el PDF adjunto y extrae TODOS los productos listados en la tabla del remito.
                
                REGLAS CRÍTICAS:
                1. Devuelve SOLO un array JSON válido de objetos.
                2. Cada objeto DEBE tener: "code" (string), "quantity" (number), "description" (string).
                3. El "code" es el código del producto (${type === 'normal' ? 'CÓDIGO DEL PROVEEDOR' : 'CÓDIGO INTERNO'}). SI NO HAY CÓDIGO EN EL PAPEL, pon "NO_CODE".
                4. La "quantity" es la cantidad pedida/enviada.
                5. La "description" es el nombre del producto (Descripción Completa).
                6. Extrae TODOS los productos. No te detengas hasta haber procesado toda la tabla.
                7. Ignora encabezados, totales, firmas o notas que no sean ítems de la tabla.
                8. Si hay marcas manuscritas (como tildes o números escritos a mano al lado de la cantidad), dales prioridad si indican una cantidad controlada.
                9. Sé extremadamente preciso con la descripción si no hay códigos.
                
                Formato esperado:
                [
                  {"code": "123456", "quantity": 10, "description": "PRODUCTO EJEMPLO"},
                  {"code": "NO_CODE", "quantity": 5, "description": "PRODUCTO SIN CODIGO"}
                ]
            `;

            // Usar gemini-1.5-flash para mayor estabilidad y capacidad de visión en PDF
            const model15 = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model15.generateContent([prompt, ...pdfParts]);
            const response = await result.response;
            const resultText = response.text();

            // Extract JSON from response
            const jsonMatch = resultText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    extractedItems = JSON.parse(jsonMatch[0]);
                    console.log(`[AI PDF PARSER] Gemini extracted ${extractedItems.length} items.`);
                } catch (parseError) {
                    console.error('[AI PDF PARSER] Error al parsear JSON de Gemini:', parseError.message);
                }
            }
        }

        // Enrich items with barcodes from DB
        const enrichedItems = [];
        for (const item of extractedItems) {
            const rawCode = String(item.code || '').trim();
            const hasCode = rawCode !== '' && rawCode !== 'NO_CODE' && rawCode !== 'N/A';
            
            let product = null;

            if (hasCode) {
                // 1. Lookup product by internal code or provider code based on type
                product = await findProductByAnyCode(rawCode, searchType);

                // PASSIVE LEARNING: If found by code, update provider_description automatically
                if (product && item.description) {
                    const newDesc = item.description.trim();
                    if (newDesc !== product.provider_description) {
                        // Background update (don't await to keep response fast)
                        supabase.from('products')
                            .update({ provider_description: newDesc })
                            .eq('code', product.code)
                            .then(({ error }) => {
                                if (!error) console.log(`[PASSIVE LEARNING] Autolinked description for ${product.code}`);
                            });
                    }
                }
            }

            // 2. FALLBACK: If no code or not found, try by description OR provider_description
            if (!product && item.description) {
                const cleanDesc = item.description.trim();
                
                // Try exact or partial match in provider_description (High priority for linked products)
                const { data: provMatches } = await supabase
                    .from('products')
                    .select('code, barcode, description, provider_description')
                    .ilike('provider_description', `%${cleanDesc}%`)
                    .limit(1);

                if (provMatches && provMatches.length > 0) {
                    product = provMatches[0];
                    console.log(`[PDF ENRICH] Match found by provider_description: "${cleanDesc}" -> ${product.code}`);
                } else {
                    // Fallback to normal description
                    const { data: matches } = await supabase
                        .from('products')
                        .select('code, barcode, description')
                        .ilike('description', `%${cleanDesc}%`)
                        .limit(1);
                    
                    if (matches && matches.length > 0) {
                        product = matches[0];
                        console.log(`[PDF ENRICH] Match found by description: "${cleanDesc}" -> ${product.code}`);
                    }
                }
            }

            enrichedItems.push({
                code: product?.code || (hasCode ? rawCode : ''),
                barcode: product?.barcode || null,
                quantity: item.quantity,
                description: product?.description || item.description,
                is_unlinked: !product
            });
        }

        res.json({ items: enrichedItems });
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ message: 'Error processing PDF' });
    }
});


module.exports = router;
