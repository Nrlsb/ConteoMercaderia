const supabase = require('../services/supabaseClient');
const tintometricoSupabase = require('../services/tintometricoSupabaseClient');

// Función auxiliar para normalizar texto para búsquedas
const normalizarTexto = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

/**
 * Obtiene los permisos de marcas de tintometría del usuario actual
 */
const getBrandPermissions = async (req) => {
    let allowAlba = true;
    let allowPlavicon = true;
    let allowTersuave = true;
    let allowFormula = true;

    // Obtener configuración global
    let globalAlba = true;
    let globalPlavicon = true;
    let globalTersuave = true;

    try {
        const { data: globalRow, error: globalErr } = await supabase
            .from('user_tintometrico_permissions')
            .select('allow_alba, allow_plavicon, allow_tersuave')
            .eq('username', 'GLOBAL_SETTINGS')
            .maybeSingle();

        if (!globalErr && globalRow) {
            globalAlba = globalRow.allow_alba !== false;
            globalPlavicon = globalRow.allow_plavicon !== false;
            globalTersuave = globalRow.allow_tersuave !== false;
        }
    } catch (globalErr) {
        console.error('Error al consultar permisos de marcas de tintómetro globales:', globalErr);
    }

    // Si el usuario es administrador o superadmin, puede ver todo
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin' || req.user.role === 'branch_admin')) {
        return { 
            allowAlba: true, 
            allowPlavicon: true, 
            allowTersuave: true,
            allow_alba: true,
            allow_plavicon: true,
            allow_tersuave: true,
            allowFormula: true,
            allow_formula: true
        };
    }

    const username = req.user ? req.user.username : null;

    if (username) {
        try {
            const { data: userRow, error: dbErr } = await supabase
                .from('user_tintometrico_permissions')
                .select('enabled, allow_alba, allow_plavicon, allow_tersuave, allow_formula')
                .eq('username', username)
                .maybeSingle();

            if (!dbErr && userRow) {
                allowAlba = userRow.allow_alba !== false;
                allowPlavicon = userRow.allow_plavicon !== false;
                allowTersuave = userRow.allow_tersuave !== false;
                allowFormula = userRow.allow_formula !== false;
            }
        } catch (dbErr) {
            console.error(`Error al consultar permisos de marcas de tintómetro para ${username}:`, dbErr);
        }
    }

    const finalAlba = allowAlba && globalAlba;
    const finalPlavicon = allowPlavicon && globalPlavicon;
    const finalTersuave = allowTersuave && globalTersuave;

    return { 
        allowAlba: finalAlba, 
        allowPlavicon: finalPlavicon, 
        allowTersuave: finalTersuave,
        allow_alba: finalAlba,
        allow_plavicon: finalPlavicon,
        allow_tersuave: finalTersuave,
        allowFormula,
        allow_formula: allowFormula
    };
};

/**
 * Obtiene todas las colecciones únicas de colores
 */
exports.getColecciones = async (req, res) => {
    try {
        const { allowAlba, allowPlavicon, allowTersuave } = await getBrandPermissions(req);
        
        const { data: responseData, error } = await tintometricoSupabase
            .from('tintometria_colecciones_unicas')
            .select('coleccion');

        if (error) throw error;

        let colecciones = (responseData || []).map(c => c.coleccion).filter(Boolean);

        // Filtrar colecciones según los permisos del usuario
        colecciones = colecciones.filter(col => {
            const colNorm = col.toLowerCase();
            const isPlav = colNorm.includes('plavi') || colNorm === '2024';
            const isTersuave = ['azulejos', 'clasicos', 'ferromicaceo', 'maderas', 'piscinas', 'terplast', 'vanguardia'].some(word => colNorm.includes(word));
            
            if (isPlav) return allowPlavicon;
            if (isTersuave) return allowTersuave;
            return allowAlba; // Alba por defecto
        });

        return res.json(colecciones);
    } catch (error) {
        console.warn(`Error al obtener colecciones de tintómetro (usando fallback): ${error.message}`);
        const { allowAlba, allowPlavicon, allowTersuave } = await getBrandPermissions(req);
        
        // Fallback básico si la vista no está creada o hay algún error
        const fallback = [
            'CP4 RIO DE LA PLATA',
            'Colores Competencia Rio de la Plata',
            'Colección Alba 2026',
            'Clásicos Tersuave',
            'Fórmulas Tersuave',
            'Cartas Plavicon'
        ];
        const filteredFallback = fallback.filter(col => {
            const colNorm = col.toLowerCase();
            const isPlav = colNorm.includes('plavi') || colNorm === '2024';
            const isTersuave = ['azulejos', 'clasicos', 'ferromicaceo', 'maderas', 'piscinas', 'terplast', 'vanguardia'].some(word => colNorm.includes(word));
            
            if (isPlav) return allowPlavicon;
            if (isTersuave) return allowTersuave;
            return allowAlba; // Alba por defecto
        });
        return res.json(filteredFallback);
    }
};

/**
 * Obtiene colores con filtros, paginación y ordenamiento
 */
exports.getColores = async (req, res) => {
    try {
        const { allowAlba, allowPlavicon, allowTersuave } = await getBrandPermissions(req);
        const { search, brand, collection, sortBy = 'id', page = '0', limit = '60' } = req.query;
        
        let query = tintometricoSupabase
            .from('tintometria_colores')
            .select('*', { count: 'exact' });

        // Filtro de búsqueda textual
        if (search) {
            const queryNorm = normalizarTexto(search);
            query = query.or(`nombre_buscar.ilike.%${queryNorm}%,codigo.ilike.%${search}%,technical_code.ilike.%${search}%,alternativas.ilike.%${search}%`);
        }
 
        // Filtro de colección
        if (collection && collection !== 'all') {
            query = query.eq('coleccion', collection);
        }
 
        // Construir los filtros de marcas permitidas
        const allowedBrandFilters = [];
        if (allowAlba) allowedBrandFilters.push('id.lt.4000000');
        if (allowPlavicon) allowedBrandFilters.push('and(id.gte.4000000,id.lt.5000000)');
        if (allowTersuave) allowedBrandFilters.push('id.gte.5000000');

        if (allowedBrandFilters.length === 0) {
            // Ninguna marca permitida
            query = query.eq('id', -1);
        } else if (allowedBrandFilters.length < 3) {
            // Si no se permiten todas las marcas, aplicamos el filtro restrictivo de marcas permitidas
            // Si el usuario especificó una marca en la query, validamos que esté permitida
            if (brand && brand !== 'all') {
                if (brand === 'alba' && allowAlba) {
                    query = query.lt('id', 4000000);
                } else if (brand === 'plavicon' && allowPlavicon) {
                    query = query.gte('id', 4000000).lt('id', 5000000);
                } else if (brand === 'tersuave' && allowTersuave) {
                    query = query.gte('id', 5000000);
                } else {
                    // Marca solicitada no permitida
                    query = query.eq('id', -1);
                }
            } else {
                // Si solicita "todas" o no especifica, limitamos a las permitidas usando or(...)
                query = query.or(allowedBrandFilters.join(','));
            }
        } else {
            // Todas las marcas permitidas. Aplicamos el filtro de la query si existe
            if (brand === 'alba') {
                query = query.lt('id', 4000000);
            } else if (brand === 'plavicon') {
                query = query.gte('id', 4000000).lt('id', 5000000);
            } else if (brand === 'tersuave') {
                query = query.gte('id', 5000000);
            }
        }
 
        // Ordenamiento
        if (sortBy === 'name') {
            query = query.order('nombre', { ascending: true });
        } else if (sortBy === 'code') {
            query = query.order('codigo', { ascending: true });
        } else {
            query = query.order('id', { ascending: true });
        }
 
        // Paginación
        const pageNum = parseInt(page) || 0;
        const limitNum = parseInt(limit) || 60;
        const from = pageNum * limitNum;
        const to = from + limitNum - 1;
 
        query = query.range(from, to);
        
        const { data: colores, count: totalCount, error } = await query;
        if (error) throw error;
 
        return res.json({
            colores: colores || [],
            totalCount: totalCount || 0,
            page: pageNum,
            limit: limitNum
        });
    } catch (error) {
        console.error('Error al obtener colores de tintómetro:', error);
        return res.status(500).json({ 
            message: 'Error al consultar el catálogo de colores.', 
            error: error.message
        });
    }
};

/**
 * Obtiene la receta de dosificación y capacidades para un color específico
 */
exports.getColorDosificacion = async (req, res) => {
    try {
        const { colorId } = req.params;
        
        if (!colorId) {
            return res.status(400).json({ message: 'El ID de color es obligatorio.' });
        }

        // 1. Obtener el color para obtener su color_id real (en Alba no coinciden con la clave primaria id)
        const { data: colorData, error: colorErr } = await tintometricoSupabase
            .from('tintometria_colores')
            .select('color_id')
            .eq('id', colorId)
            .maybeSingle();

        if (colorErr) throw colorErr;

        let realColorId = colorId;
        if (colorData) {
            realColorId = colorData.color_id;
        }

        // 2. Obtener fórmulas, cargando datos relacionados
        const { data: formulaData, error: formulaErr } = await tintometricoSupabase
            .from('tintometria_formulas')
            .select(`
                base,
                producto_id,
                cantidad_volumen,
                pigmento_id,
                tintometria_productos (
                    nombre,
                    short_name,
                    descripcion,
                    sistema_tintometrico
                ),
                tintometria_pigmentos (
                    codigo,
                    nombre,
                    hex,
                    precio_lata,
                    codigo_comercial
                )
            `)
            .eq('color_id', realColorId);

        if (formulaErr) throw formulaErr;

        // 3. Obtener las capacidades de envase y sus precios base
        const { data: capacitiesDataRaw, error: capsErr } = await tintometricoSupabase
            .from('tintometria_capacidades')
            .select('*');

        if (capsErr) throw capsErr;

        let capacitiesData = capacitiesDataRaw || [];

        // Enriquecer capacitiesData con datos de Protheus (capacidad real)
        try {
            const codes = capacitiesData
                .map(c => c.codigo_comercial)
                .filter(code => code != null && code.trim() !== '');

            if (codes.length > 0) {
                // Consultar en la base de datos principal de Supabase
                const { data: productsResult, error: prodErr } = await supabase
                    .from('products')
                    .select('code, description, capacity')
                    .in('code', codes);
                
                if (!prodErr && productsResult) {
                    const productsMap = new Map(productsResult.map(p => [p.code, p]));
                    
                    capacitiesData.forEach(c => {
                        if (c.codigo_comercial && productsMap.has(c.codigo_comercial)) {
                            const prod = productsMap.get(c.codigo_comercial);
                            
                            // Extraer capacidad real formateada (ej: "3,600 LITROS" -> 3.6)
                            let realCap = null;
                            if (prod.capacity) {
                                const cleaned = prod.capacity.trim().replace(',', '.');
                                const match = cleaned.match(/^(\d+(\.\d+)?)/);
                                if (match) {
                                    realCap = parseFloat(match[1]);
                                }
                            }
                            
                            // Fallback de descripción
                            if (!realCap && prod.description) {
                                const cleanedDesc = prod.description.replace(',', '.');
                                const matchDesc = cleanedDesc.match(/X\s*(\d+(\.\d+)?)/i);
                                if (matchDesc) {
                                    realCap = parseFloat(matchDesc[1]);
                                }
                            }

                            c.capacidad_real = realCap;
                            c.capacidad_real_desc = prod.capacity ? prod.capacity.trim() : null;
                            c.producto_nombre_real = prod.description ? prod.description.trim() : null;
                        }
                    });
                }
            }
        } catch (dbErr) {
            console.error(`Error al enriquecer capacidades desde Protheus: ${dbErr.message}`);
        }

        // Agrupar fórmulas por producto para armar las recetas
        const recipesMap = new Map();
        
        (formulaData || []).forEach((row) => {
            const pId = row.producto_id;
            const prod = row.tintometria_productos;
            const pig = row.tintometria_pigmentos;

            if (!recipesMap.has(pId)) {
                recipesMap.set(pId, {
                    productId: pId,
                    productName: prod?.nombre || `Producto ${pId}`,
                    productShort: prod?.short_name || `Prod ${pId}`,
                    productDesc: prod?.descripcion || '',
                    base: row.base,
                    pigments: [],
                    sistemaTintometrico: prod?.sistema_tintometrico || 'Alba'
                });
            }

            recipesMap.get(pId).pigments.push({
                id: row.pigmento_id,
                code: pig?.codigo || '?',
                name: pig?.nombre || 'Pigmento',
                hex: pig?.hex || '#808080',
                cantidad: Number(row.cantidad_volumen),
                precio_lata: pig?.precio_lata ? Number(pig.precio_lata) : null,
                codigo_comercial: pig?.codigo_comercial || null
            });
        });

        const recipesList = Array.from(recipesMap.values());

        return res.json({
            recipes: recipesList,
            capacities: capacitiesData
        });
    } catch (error) {
        console.error('Error al obtener dosificación de color:', error);
        return res.status(500).json({ 
            message: 'Error al consultar la dosificación del color.', 
            error: error.message
        });
    }
};

/**
 * Calcula equivalencias cercanas para un color dado sus valores L*a*b*
 */
exports.getColorEquivalentes = async (req, res) => {
    try {
        const { allowAlba, allowPlavicon, allowTersuave } = await getBrandPermissions(req);
        const { id, lab_l, lab_a, lab_b, hex } = req.body;
        
        if (!hex) {
            return res.status(400).json({ message: 'El valor HEX es requerido.' });
        }

        let l = lab_l !== undefined ? Number(lab_l) : null;
        let a = lab_a !== undefined ? Number(lab_a) : null;
        let b_val = lab_b !== undefined ? Number(lab_b) : null;

        // Si faltan coordenadas LAB, las estimamos a partir de HEX en el servidor
        if (l === null || a === null || b_val === null) {
            const hexToRgb = (h) => {
                const cleanHex = h.replace('#', '');
                const r = parseInt(cleanHex.substring(0, 2), 16);
                const g = parseInt(cleanHex.substring(2, 4), 16);
                const b = parseInt(cleanHex.substring(4, 6), 16);
                return { r, g, b };
            };
            const rgb = hexToRgb(hex);
            let r = rgb.r / 255;
            let g = rgb.g / 255;
            let b = rgb.b / 255;

            r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
            g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
            b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

            r *= 100;
            g *= 100;
            b *= 100;

            const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
            const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
            const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

            const xn = 95.047;
            const yn = 100.000;
            const zn = 108.883;

            let fx = x / xn;
            let fy = y / yn;
            let fz = z / zn;

            fx = fx > 0.008856 ? Math.pow(fx, 1/3) : (7.787 * fx) + (16/116);
            fy = fy > 0.008856 ? Math.pow(fy, 1/3) : (7.787 * fy) + (16/116);
            fz = fz > 0.008856 ? Math.pow(fz, 1/3) : (7.787 * fz) + (16/116);

            l = (116 * fy) - 16;
            a = 500 * (fx - fy);
            b_val = 200 * (fy - fz);
        }

        // Buscar colores en un margen LAB de +-12 en la base de datos
        const { data, error } = await tintometricoSupabase
            .from('tintometria_colores')
            .select('*')
            .gte('lab_l', l - 12)
            .lte('lab_l', l + 12)
            .gte('lab_a', a - 12)
            .lte('lab_a', a + 12)
            .gte('lab_b', b_val - 12)
            .lte('lab_b', b_val + 12)
            .limit(200);

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.json([]);
        }

        const getBrandStr = (colorId) => {
            if (colorId >= 5000000) return 'tersuave';
            if (colorId >= 4000000) return 'plavicon';
            return 'alba';
        };

        const currentBrand = getBrandStr(id);
        const currentLab = { lab_l: l, lab_a: a, lab_b: b_val };

        // Calcular distancia y ordenar en memoria
        const candidates = data
            .filter((c) => c.id !== id) // Excluir color actual
            .map((c) => {
                let candL = c.lab_l;
                let candA = c.lab_a;
                let candB = c.lab_b;

                if (candL === null || candA === null || candB === null) {
                    candL = l; candA = a; candB = b_val;
                }

                const dl = currentLab.lab_l - candL;
                const da = currentLab.lab_a - candA;
                const db = currentLab.lab_b - candB;
                const distance = Math.sqrt(dl * dl + da * da + db * db);

                // Clasificar similitud para la UI
                let similarity = 'Similar';
                if (distance <= 1.5) similarity = 'Idéntico';
                else if (distance <= 3.0) similarity = 'Excelente';

                return { ...c, distance, similarity };
            });

        // Ordenar candidatos por menor distancia
        candidates.sort((x, y) => x.distance - y.distance);

        const bestMatches = [];
        const brandsToFind = ['alba', 'plavicon', 'tersuave'].filter(b => b !== currentBrand);

        brandsToFind.forEach(brand => {
            if (brand === 'alba' && !allowAlba) return;
            if (brand === 'plavicon' && !allowPlavicon) return;
            if (brand === 'tersuave' && !allowTersuave) return;

            const match = candidates.find(c => getBrandStr(c.id) === brand);
            if (match) {
                bestMatches.push(match);
            }
        });

        return res.json(bestMatches);
    } catch (error) {
        console.error('Error al buscar colores equivalentes:', error);
        return res.status(500).json({ 
            message: 'Error al buscar colores equivalentes.', 
            error: error.message
        });
    }
};

/**
 * Obtiene los permisos de marcas de tintometría del usuario actual (vendedor o cliente)
 */
exports.getMyPermissions = async (req, res) => {
    try {
        const permissions = await getBrandPermissions(req);
        return res.json(permissions);
    } catch (error) {
        console.error('Error al obtener permisos de tintometría del usuario:', error);
        return res.status(500).json({ message: 'Error al consultar permisos de tintometría.' });
    }
};
