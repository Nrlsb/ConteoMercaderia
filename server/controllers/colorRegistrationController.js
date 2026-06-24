const supabase = require('../services/supabaseClient');
const tintometricoSupabase = require('../services/tintometricoSupabaseClient');
const dolarService = require('../services/dolarService');
const { getSucursalMarkup } = require('../utils/dbHelpers');

/**
 * Enrich an array of color registration rows with a calculated `precio_ars`
 * on the nested `products` object.  Uses the user's price list (001 or 500),
 * converts USD → ARS when needed, and applies VAT based on the TES code.
 * Also calculates pigment costs and total estimated prices.
 */
async function enrichWithPrice(rows, userPriceList, sucursalMarkup = 0) {
    if (!rows || rows.length === 0) return rows;

    const needsEnrich = rows.some(r => r.products && (r.products.lista001 || r.products.lista500));
    const hasFormulas = rows.some(r => 
        (r.formula?.pigmentos && r.formula.pigmentos.length > 0) || 
        (r.formula?.pigmentos_extras && r.formula.pigmentos_extras.length > 0)
    );
    if (!needsEnrich && !hasFormulas) return rows;

    const cotizaciones = await dolarService.getCotizaciones();
    const priceField = userPriceList === '500' ? 'lista500' : 'lista001';
    const markupMultiplier = 1 + (Number(sucursalMarkup) / 100);

    // 1. Gather all unique pigment codes across all formulas in the rows
    const uniquePigmentCodes = new Set();
    rows.forEach(r => {
        if (r.formula?.pigmentos) {
            r.formula.pigmentos.forEach(p => {
                if (p.codigo) uniquePigmentCodes.add(p.codigo.trim().toUpperCase());
            });
        }
        if (r.formula?.pigmentos_extras) {
            r.formula.pigmentos_extras.forEach(p => {
                if (p.codigo) uniquePigmentCodes.add(p.codigo.trim().toUpperCase());
            });
        }
    });

    // 2. Preload pigment prices
    let pigmentsMap = new Map();
    if (tintometricoSupabase && uniquePigmentCodes.size > 0) {
        try {
            const { data: allPigments, error: pigErr } = await tintometricoSupabase
                .from('tintometria_pigmentos')
                .select('codigo, nombre, precio_lata, codigo_comercial');

            if (!pigErr && allPigments) {
                const pigCommCodes = allPigments
                    .map(p => p.codigo_comercial)
                    .filter(c => c != null && c.trim() !== '');

                let productsPigMap = new Map();
                if (pigCommCodes.length > 0) {
                    const { data: prodsResult, error: prodErr } = await supabase
                        .from('products')
                        .select('code, description, lista001, lista500, tes, moneda')
                        .in('code', pigCommCodes);

                    if (!prodErr && prodsResult) {
                        productsPigMap = new Map(prodsResult.map(p => [p.code, p]));
                    }
                }

                allPigments.forEach(pig => {
                    let basePrecioLata = pig.precio_lata ? Number(pig.precio_lata) : 0;
                    if (pig.codigo_comercial && productsPigMap.has(pig.codigo_comercial)) {
                        const prod = productsPigMap.get(pig.codigo_comercial);
                        let localPrice = prod[priceField] ? Number(prod[priceField]) : null;
                        if (localPrice !== null && localPrice > 0) {
                            localPrice = dolarService.convertirPrecio(localPrice, prod.moneda, cotizaciones);
                            let vatMultiplier = 1.0;
                            const tes = prod.tes ? String(prod.tes).trim() : '';
                            if (tes === '503') vatMultiplier = 1.21;
                            else if (tes === '501') vatMultiplier = 1.105;
                            basePrecioLata = localPrice * vatMultiplier;
                        }
                    }
                    const precioLata = basePrecioLata * markupMultiplier;
                    const key = pig.codigo.trim().toUpperCase();
                    pigmentsMap.set(key, precioLata);
                });
            }
        } catch (err) {
            console.error('Error precargando precios de pigmentos en colorRegistrationController:', err);
        }
    }

    // 2.5. Si hay registros sin producto físico pero con fórmula, intentar obtener precio base de la dosificación
    const rowsWithFormulaAndNoProduct = rows.filter(r => !r.products && r.formula?.productName);
    
    if (tintometricoSupabase && rowsWithFormulaAndNoProduct.length > 0) {
        try {
            const uniqueProductNames = Array.from(new Set(rowsWithFormulaAndNoProduct.map(r => r.formula.productName.trim())));
            
            // Consultar IDs de productos de tintometría
            const { data: tintProds, error: prodErr } = await tintometricoSupabase
                .from('tintometria_productos')
                .select('id, nombre')
                .in('nombre', uniqueProductNames);

            if (!prodErr && tintProds && tintProds.length > 0) {
                const prodIds = tintProds.map(p => p.id);
                const prodNamesMap = new Map(tintProds.map(p => [p.nombre.trim(), p.id]));
                
                // Consultar las capacidades de esos productos de tintometría
                const { data: tintCaps, error: capsErr } = await tintometricoSupabase
                    .from('tintometria_capacidades')
                    .select('*')
                    .in('producto_id', prodIds);

                if (!capsErr && tintCaps && tintCaps.length > 0) {
                    const capacityCodes = tintCaps
                        .map(c => c.codigo_comercial)
                        .filter(code => code != null && code.trim() !== '');

                    let localProdsMap = new Map();
                    if (capacityCodes.length > 0) {
                        const { data: productsResult, error: localProdErr } = await supabase
                            .from('products')
                            .select('code, description, capacity, lista001, lista500, tes, moneda')
                            .in('code', capacityCodes);
                        
                        if (!localProdErr && productsResult) {
                            localProdsMap = new Map(productsResult.map(p => [p.code, p]));
                        }
                    }

                    // Enriquecer y aplicar precios locales e IVA a las capacidades encontradas
                    const capsEnriched = tintCaps.map(c => {
                        let basePrice = c.precio_base ? Number(c.precio_base) : 0;

                        if (c.codigo_comercial && localProdsMap.has(c.codigo_comercial)) {
                            const prod = localProdsMap.get(c.codigo_comercial);
                            let localPrice = prod[priceField] ? Number(prod[priceField]) : null;
                            if (localPrice !== null && localPrice > 0) {
                                localPrice = dolarService.convertirPrecio(localPrice, prod.moneda, cotizaciones);
                                let vatMultiplier = 1.0;
                                const tes = prod.tes ? String(prod.tes).trim() : '';
                                if (tes === '503') vatMultiplier = 1.21;
                                else if (tes === '501') vatMultiplier = 1.105;
                                basePrice = localPrice * vatMultiplier;
                            }
                        }

                        c.precio_base_final = basePrice * markupMultiplier;
                        return c;
                    });

                    // Asignar el precio base pre-calculado a cada fila
                    rowsWithFormulaAndNoProduct.forEach(r => {
                        const productNameNorm = r.formula.productName.trim();
                        const tintProdId = prodNamesMap.get(productNameNorm);
                        
                        if (tintProdId) {
                            const sizeLitros = r.capacity_real ? Number(r.capacity_real) : 1;
                            const baseName = r.base || r.formula.base || 'General';
                            
                            let matchedCap = capsEnriched.find(c => 
                                c.producto_id === tintProdId && 
                                c.base === baseName && 
                                (c.capacidad_litros === sizeLitros || (c.capacidad_real && Math.abs(c.capacidad_real - sizeLitros) < 0.05))
                            );

                            if (!matchedCap) {
                                // Fallback a base General
                                matchedCap = capsEnriched.find(c => 
                                    c.producto_id === tintProdId && 
                                    c.base === 'General' && 
                                    (c.capacidad_litros === sizeLitros || (c.capacidad_real && Math.abs(c.capacidad_real - sizeLitros) < 0.05))
                                );
                            }

                            if (matchedCap) {
                                r.precio_base_ars = parseFloat(matchedCap.precio_base_final.toFixed(2));
                            }
                        }
                    });
                }
            }
        } catch (err) {
            console.error('Error calculando precio base alternativo en colorRegistrationController:', err);
        }
    }

    rows.forEach(r => {
        // Enriquecer precio base
        if (r.products) {
            let rawPrice = r.products[priceField] ? Number(r.products[priceField]) : null;
            if (!rawPrice || rawPrice <= 0) {
                r.products.precio_ars = null;
            } else {
                rawPrice = dolarService.convertirPrecio(rawPrice, r.products.moneda, cotizaciones);
                const tes = r.products.tes ? String(r.products.tes).trim() : '';
                let vatMultiplier = 1.0;
                if (tes === '503') vatMultiplier = 1.21;
                else if (tes === '501') vatMultiplier = 1.105;
                r.products.precio_ars = parseFloat((rawPrice * vatMultiplier * markupMultiplier).toFixed(2));
            }
        }

        // Calcular precio de pigmentos
        let precio_pigmentos = 0;
        let hasFormulaPrice = false;

        if (r.formula) {
            const system = r.formula.sistema?.toLowerCase() || '';
            const isTersuave = system.includes('tersuave');
            const isPlavicon = system.includes('plavicon');
            const divisor = isTersuave ? 1250 : (isPlavicon ? 1300 : 2200);

            if (r.formula.pigmentos) {
                r.formula.pigmentos.forEach(p => {
                    const key = p.codigo?.trim().toUpperCase();
                    if (key && pigmentsMap.has(key)) {
                        hasFormulaPrice = true;
                        const precioLata = pigmentsMap.get(key);
                        const qty = Number(p.cantidad) || 0;
                        const qtyUnits = parseFloat((qty / divisor).toFixed(4));
                        const cost = parseFloat((qtyUnits * precioLata).toFixed(2));
                        precio_pigmentos += cost;
                    }
                });
            }

            if (r.formula.pigmentos_extras) {
                r.formula.pigmentos_extras.forEach(p => {
                    const key = p.codigo?.trim().toUpperCase();
                    if (key && pigmentsMap.has(key)) {
                        hasFormulaPrice = true;
                        const precioLata = pigmentsMap.get(key);
                        const qty = Number(p.cantidad) || 0;
                        const qtyUnits = parseFloat((qty / divisor).toFixed(4));
                        const cost = parseFloat((qtyUnits * precioLata).toFixed(2));
                        precio_pigmentos += cost;
                    }
                });
            }
        }

        r.precio_base_ars = r.products?.precio_ars || r.precio_base_ars || null;
        r.precio_pigmentos_ars = hasFormulaPrice ? parseFloat(precio_pigmentos.toFixed(2)) : 0;
        r.precio_total_ars = r.precio_base_ars !== null 
            ? parseFloat((r.precio_base_ars + r.precio_pigmentos_ars).toFixed(2)) 
            : null;
    });

    return rows;
}

// Get all color registrations
exports.getAll = async (req, res) => {
    try {
        let isHistory = false;
        if (req.query.is_history !== undefined) {
            isHistory = req.query.is_history === 'true';
        }

        let query = supabase
            .from('color_registrations')
            .select(`
                *,
                products (
                    id,
                    code,
                    description,
                    brand,
                    lista001,
                    lista500,
                    tes,
                    moneda
                ),
                target_user:users!user_id (
                    id,
                    username,
                    role
                ),
                creator_user:users!created_by (
                    id,
                    username
                )
            `)
            .eq('is_history', isHistory);

        // Filter: only show if the user created it, is assigned to it, or is a superadmin
        if (req.user.role !== 'superadmin') {
            query = query.or(`created_by.eq.${req.user.id},user_id.eq.${req.user.id}`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // Enrich products with calculated ARS price
        const userPriceList = req.user.price_list || '001';
        const sucursalMarkup = await getSucursalMarkup(req.user.sucursal_id);
        const enriched = await enrichWithPrice(data || [], userPriceList, sucursalMarkup);

        res.json(enriched);
    } catch (error) {
        console.error('Error fetching color registrations:', error);
        res.status(500).json({ message: 'Error al obtener los registros de colores' });
    }
};

// Create a new color registration
exports.create = async (req, res) => {
    const { 
        color_type, 
        color_name, 
        client_name, 
        product_id, 
        user_id, 
        color_code, 
        hex, 
        observations,
        capacity_real,
        formula,
        base,
        obra,
        is_history
    } = req.body;

    if (!color_type || !color_name || !client_name) {
        return res.status(400).json({ 
            message: 'Faltan campos obligatorios (tipo de color, nombre de color y cliente)' 
        });
    }

    try {
        // Generate identification_id as Name of the Color + Client
        const identification_id = `${color_name.trim()} - ${client_name.trim()}`;
        
        const newRegistration = {
            color_type,
            color_name: color_name.trim(),
            client_name: client_name.trim(),
            product_id: product_id || null,
            user_id: user_id || null,
            identification_id,
            color_code: color_code || null,
            hex: hex || null,
            observations: observations || null,
            capacity_real: capacity_real || null,
            formula: formula || null,
            base: base || null,
            obra: obra || null,
            is_history: is_history ?? false,
            created_by: req.user.id
        };

        const { data, error } = await supabase
            .from('color_registrations')
            .insert([newRegistration])
            .select(`
                *,
                products (
                    id,
                    code,
                    description,
                    brand,
                    lista001,
                    lista500,
                    tes,
                    moneda
                ),
                target_user:users!user_id (
                    id,
                    username,
                    role
                ),
                creator_user:users!created_by (
                    id,
                    username
                )
            `)
            .single();

        if (error) throw error;

        // Enrich with calculated ARS price before returning
        const userPriceList = req.user.price_list || '001';
        const sucursalMarkup = await getSucursalMarkup(req.user.sucursal_id);
        const enriched = await enrichWithPrice([data], userPriceList, sucursalMarkup);

        res.status(201).json(enriched[0]);
    } catch (error) {
        console.error('Error creating color registration:', error);
        res.status(500).json({ message: 'Error al registrar el color' });
    }
};

// Delete a color registration
exports.delete = async (req, res) => {
    const { id } = req.params;

    try {
        // Fetch the registration first to check ownership
        const { data: registration, error: fetchError } = await supabase
            .from('color_registrations')
            .select('created_by')
            .eq('id', id)
            .single();

        if (fetchError || !registration) {
            return res.status(404).json({ message: 'Registro de color no encontrado' });
        }

        // Only the creator or superadmin can delete
        if (registration.created_by !== req.user.id && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'No tienes permiso para eliminar este registro' });
        }

        const { error } = await supabase
            .from('color_registrations')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Registro de color eliminado exitosamente' });
    } catch (error) {
        console.error('Error deleting color registration:', error);
        res.status(500).json({ message: 'Error al eliminar el registro de color' });
    }
};
