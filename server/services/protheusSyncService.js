const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { fetchBrandsFromProtheus, fetchCapacitiesFromProtheus, fetchPricesFromProtheus, fetchSucursalesFromProtheus, fetchMarkupGroupsFromProtheus } = require('./protheusService');

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const PROTHEUS_API_URL = process.env.PROTHEUS_API_URL;

// Configuraciones del script
const PAGE_FETCH_DELAY = 60; // Delay en ms entre cada página de Protheus
const DB_BATCH_SIZE = 500;  // Tamaño del lote para insertar/actualizar en Supabase

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detecta dinámicamente cuál es el parámetro de query correcto para la paginación en Protheus.
 * Intenta con "page=2" y "current_page=2" y valida el objeto "meta" devuelto.
 */
async function detectPaginationParam() {
    console.log('🔍 Detectando parámetro de paginación de la API de Protheus...');
    
    // Probar con "page"
    try {
        const urlPage = `${PROTHEUS_API_URL}?page=2`;
        const resPage = await fetch(urlPage);
        if (resPage.ok) {
            const data = await resPage.json();
            if (data && data.meta && data.meta.current_page === 2) {
                console.log('✅ Parámetro de paginación detectado: "page"');
                return 'page';
            }
        }
    } catch (e) {
        console.warn('Advertencia probando parámetro "page":', e.message);
    }

    // Probar con "current_page"
    try {
        const urlCurrentPage = `${PROTHEUS_API_URL}?current_page=2`;
        const resCurrentPage = await fetch(urlCurrentPage);
        if (resCurrentPage.ok) {
            const data = await resCurrentPage.json();
            if (data && data.meta && data.meta.current_page === 2) {
                console.log('✅ Parámetro de paginación detectado: "current_page"');
                return 'current_page';
            }
        }
    } catch (e) {
        console.warn('Advertencia probando parámetro "current_page":', e.message);
    }

    // Por defecto usar "page" si no se puede determinar
    console.log('⚠️ No se pudo auto-detectar. Se utilizará el parámetro por defecto: "page"');
    return 'page';
}

/**
 * Descarga una página específica de productos de Protheus.
 */
async function fetchPage(pageNumber, pageParam) {
    const url = `${PROTHEUS_API_URL}?${pageParam}=${pageNumber}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`❌ Error descargando página ${pageNumber}:`, error.message);
        return null;
    }
}

/**
 * Ejecuta la sincronización completa del catálogo de productos y marcas de Protheus.
 */
async function startCatalogSync() {
    console.log('================================================================');
    console.log('🚀 Iniciando Sincronización Completa del Catálogo de Protheus');
    console.log('================================================================\n');

    const pageParam = await detectPaginationParam();
    
    // 0. Sincronizar sucursales primero
    try {
        await syncSucursales();
    } catch (e) {
        console.error('❌ Error al sincronizar sucursales como parte de la sincronización de catálogo:', e.message);
    }
    
    // 0. Descargar catálogo de marcas, capacidades y precios primero para enriquecer el catálogo de productos
    const brandsMap = await fetchBrandsFromProtheus();
    const capacitiesMap = await fetchCapacitiesFromProtheus();
    const prices001Map = await fetchPricesFromProtheus('001');
    const prices500Map = await fetchPricesFromProtheus('500');
    console.log('');

    // 1. Obtener la primera página para determinar el total de páginas
    console.log('1. Obteniendo información inicial de la API...');
    const initialData = await fetchPage(1, pageParam);
    if (!initialData || !initialData.meta) {
        console.error('❌ Error crítico: No se pudo conectar con la API de Protheus o el formato de respuesta es inválido.');
        return;
    }

    const totalPages = initialData.meta.total_pages;
    const totalProductsInProtheus = initialData.meta.total;
    console.log(`📊 Catálogo Protheus: ${totalProductsInProtheus} productos en total, distribuidos en ${totalPages} páginas.\n`);

    // 2. Descargar todos los productos de Protheus (Paginados)
    console.log(`2. Descargando las ${totalPages} páginas del catálogo...`);
    const protheusProducts = [];
    
    // Agregar los productos de la primera página que ya tenemos
    if (initialData.objects && Array.isArray(initialData.objects)) {
        protheusProducts.push(...initialData.objects);
    }

    // Descargar las siguientes páginas
    for (let p = 2; p <= totalPages; p++) {
        if (p % 50 === 0 || p === totalPages) {
            console.log(`   Descargadas ${p}/${totalPages} páginas... (${Math.round((p / totalPages) * 100)}%)`);
        }
        
        await delay(PAGE_FETCH_DELAY);
        const pageData = await fetchPage(p, pageParam);
        
        if (pageData && pageData.objects && Array.isArray(pageData.objects)) {
            protheusProducts.push(...pageData.objects);
        } else {
            console.warn(`⚠️ Omitiendo página ${p} debido a un error de red o de datos.`);
        }
    }

    console.log(`\n✅ Descarga completada. Se recuperaron ${protheusProducts.length} registros desde Protheus.\n`);

    // 3. Obtener todos los productos existentes en Supabase para comparar en memoria
    console.log('3. Descargando productos de la base de datos de la app para comparar...');
    let dbProducts = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('products')
            .select('id, code, description, capacity, real_weight, cost_price, brand_code, brand, barcode, barcode_secondary, tes, lista001, lista500, moneda')
            .range(from, from + step - 1);

        if (error) {
            console.error('❌ Error al obtener productos de Supabase:', error.message);
            return;
        }

        if (data && data.length > 0) {
            dbProducts = dbProducts.concat(data);
            if (data.length < step) hasMore = false;
            else from += step;
        } else {
            hasMore = false;
        }
    }

    // Crear un mapa para búsquedas rápidas O(1) por código de producto
    const dbMap = new Map();
    dbProducts.forEach(p => {
        if (p.code) {
            dbMap.set(String(p.code).trim().toLowerCase(), p);
        }
    });

    console.log(`✅ Base de datos local cargada: ${dbProducts.length} productos analizados.\n`);

    // 4. Comparar productos y clasificar en memoria
    console.log('4. Comparando catálogos en memoria y clasificando cambios...');
    
    const productsToUpsert = [];
    let cleanCount = 0;

    for (const rawProd of protheusProducts) {
        if (!rawProd || !rawProd.b1_cod || !rawProd.b1_desc) continue;

        const code = String(rawProd.b1_cod).trim();
        const desc = String(rawProd.b1_desc).trim();
        const capacity = rawProd.b1_xcapa ? String(rawProd.b1_xcapa).trim() : null;
        const cost_price = rawProd.b1_custd !== undefined && rawProd.b1_custd !== null ? parseFloat(rawProd.b1_custd) : 0;
        const brand_code = rawProd.b1_grupo ? String(rawProd.b1_grupo).trim() : null;
        const brandName = brand_code ? (brandsMap[brand_code] || null) : null;
        const realWeightVal = capacity ? (capacitiesMap[capacity] || null) : null;

        const key = code.toLowerCase();
        const existing = dbMap.get(key);

        // Mapeo de campos de precios y TES
        const tes = rawProd.b1_ts ? String(rawProd.b1_ts).trim() : null;
        const price001Obj = prices001Map[key] || null;
        const price500Obj = prices500Map[key] || null;
        const lista001 = price001Obj ? price001Obj.price : 0;
        const lista500 = price500Obj ? price500Obj.price : 0;
        const moneda = (price001Obj && price001Obj.currency) || (price500Obj && price500Obj.currency) || null;

        if (!existing) {
            // Producto Nuevo: se agrega completo
            productsToUpsert.push({
                code,
                description: desc,
                capacity,
                real_weight: realWeightVal,
                cost_price,
                brand_code,
                brand: brandName,
                barcode: null,
                barcode_secondary: null,
                tes,
                lista001,
                lista500,
                moneda
            });
        } else {
            // Producto Existente: verificar si hay algún cambio en las columnas del WS
            const hasChanges = 
                existing.description !== desc ||
                existing.capacity !== capacity ||
                existing.real_weight !== realWeightVal ||
                existing.cost_price !== cost_price ||
                existing.brand_code !== brand_code ||
                existing.brand !== brandName ||
                existing.tes !== tes ||
                existing.lista001 !== lista001 ||
                existing.lista500 !== lista500 ||
                existing.moneda !== moneda;

            if (hasChanges) {
                // Producto Modificado: Actualizar campos manteniendo barcode y barcode_secondary (el id se preserva por la base de datos)
                productsToUpsert.push({
                    code,
                    description: desc,
                    capacity,
                    real_weight: realWeightVal,
                    cost_price,
                    brand_code,
                    brand: brandName,
                    barcode: existing.barcode,
                    barcode_secondary: existing.barcode_secondary,
                    tes,
                    lista001,
                    lista500,
                    moneda
                });
            } else {
                // Sin cambios
                cleanCount++;
            }
        }
    }

    const totalModified = productsToUpsert.length;
    console.log(`📈 Resultados del análisis:`);
    console.log(`- Productos listos para insertar o actualizar: ${totalModified}`);
    console.log(`- Productos idénticos (omitidos para ahorrar recursos): ${cleanCount}\n`);

    if (totalModified === 0) {
        console.log('🎉 ¡La base de datos local ya está al día con Protheus! No es necesario aplicar cambios.');
        return;
    }

    // 5. Aplicar cambios en lotes de 500 (Bulk Upsert)
    console.log(`5. Guardando cambios en Supabase en lotes de ${DB_BATCH_SIZE}...`);
    
    let successCount = 0;

    for (let i = 0; i < totalModified; i += DB_BATCH_SIZE) {
        const batch = productsToUpsert.slice(i, i + DB_BATCH_SIZE);
        
        const { error } = await supabase
            .from('products')
            .upsert(batch, { onConflict: 'code' });

        if (error) {
            console.error(`❌ Error guardando lote del índice ${i} al ${i + batch.length}:`, error.message);
        } else {
            successCount += batch.length;
            console.log(`   Lote guardado con éxito: ${successCount}/${totalModified} productos procesados.`);
        }
    }

    console.log('\n================================================================');
    console.log('🎉 ¡Sincronización Masiva Completada con Éxito!');
    console.log('================================================================');
    console.log(`📊 Resumen final:`);
    console.log(`- Total de productos procesados: ${protheusProducts.length}`);
    console.log(`- Base de datos local actualizada (creados/modificados): ${successCount}`);
    console.log(`- Productos omitidos (sin cambios): ${cleanCount}`);
    console.log('================================================================\n');
}

/**
 * Sincroniza las sucursales desde Protheus a la base de datos de Supabase.
 */
async function syncSucursales() {
    // 0. Sincronizar grupos de recargo primero para la clave foránea
    try {
        await syncMarkupGroups();
    } catch (e) {
        console.error('❌ Error al sincronizar grupos de recargo antes de sucursales:', e.message);
    }

    console.log('================================================================');
    console.log('🚀 Sincronizando Sucursales desde Protheus...');
    console.log('================================================================\n');

    try {
        const protheusSucursales = await fetchSucursalesFromProtheus();
        if (protheusSucursales.length === 0) {
            console.log('⚠️ No se obtuvieron sucursales de Protheus. Sincronización cancelada.');
            return { success: false, message: 'No se obtuvieron sucursales de Protheus' };
        }

        // Obtener sucursales locales
        const { data: dbSucursales, error: dbError } = await supabase
            .from('sucursales')
            .select('*');

        if (dbError) {
            console.error('❌ Error al obtener sucursales locales:', dbError.message);
            return { success: false, error: dbError.message };
        }

        const dbMapByCode = new Map();
        const dbMapByName = new Map();
        dbSucursales.forEach(s => {
            if (s.code) dbMapByCode.set(String(s.code).trim().toLowerCase(), s);
            if (s.name) dbMapByName.set(String(s.name).trim().toLowerCase(), s);
        });

        const toUpsert = [];
        let createdCount = 0;
        let updatedCount = 0;

        for (const pSuc of protheusSucursales) {
            const codeKey = pSuc.code.toLowerCase();
            const nameKey = pSuc.name.toLowerCase();

            // Buscar si ya existe por code o por name
            const existingByCode = dbMapByCode.get(codeKey);
            const existingByName = dbMapByName.get(nameKey);
            const existing = existingByCode || existingByName;

            if (existing) {
                // Verificar si hay cambios
                const hasChanges = 
                    existing.name !== pSuc.name || 
                    existing.location !== pSuc.location ||
                    existing.code !== pSuc.code ||
                    existing.markup_group_id !== pSuc.markup_group_id;

                if (hasChanges) {
                    toUpsert.push({
                        id: existing.id, // Preservar UUID para no romper claves foráneas
                        code: pSuc.code,
                        name: pSuc.name,
                        location: pSuc.location,
                        markup_group_id: pSuc.markup_group_id
                    });
                    updatedCount++;
                }
            } else {
                // Sucursal nueva
                toUpsert.push({
                    code: pSuc.code,
                    name: pSuc.name,
                    location: pSuc.location,
                    markup_group_id: pSuc.markup_group_id
                });
                createdCount++;
            }
        }

        if (toUpsert.length === 0) {
            console.log('🎉 Las sucursales están actualizadas. No se requiere sincronización.');
            return { success: true, message: 'Las sucursales están actualizadas', created: 0, updated: 0 };
        }

        console.log(`Aplicando cambios en Supabase para ${toUpsert.length} sucursales...`);
        const { error: upsertError } = await supabase
            .from('sucursales')
            .upsert(toUpsert);

        if (upsertError) {
            console.error('❌ Error al insertar/actualizar sucursales en Supabase:', upsertError.message);
            return { success: false, error: upsertError.message };
        } else {
            console.log('✅ Sucursales sincronizadas con éxito.');
            return { success: true, message: 'Sincronización completada con éxito', created: createdCount, updated: updatedCount };
        }

    } catch (err) {
        console.error('❌ Error en syncSucursales:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Sincroniza los grupos de recargo (porcentaje de aumento) desde Protheus a Supabase.
 */
async function syncMarkupGroups() {
    console.log('================================================================');
    console.log('🚀 Sincronizando Grupos de Recargo (Markup Groups) desde Protheus...');
    console.log('================================================================\n');

    try {
        const protheusGroups = await fetchMarkupGroupsFromProtheus();
        if (protheusGroups.length === 0) {
            console.log('⚠️ No se obtuvieron grupos de recargo de Protheus. Sincronización cancelada.');
            return { success: false, message: 'No se obtuvieron grupos de recargo' };
        }

        console.log(`Aplicando cambios en Supabase para ${protheusGroups.length} grupos de recargo...`);
        const { error: upsertError } = await supabase
            .from('markup_groups')
            .upsert(protheusGroups, { onConflict: 'id' });

        if (upsertError) {
            console.error('❌ Error al sincronizar grupos de recargo en Supabase:', upsertError.message);
            return { success: false, error: upsertError.message };
        } else {
            console.log('✅ Grupos de recargo sincronizados con éxito.');
            return { success: true, message: 'Sincronización de recargos exitosa' };
        }
    } catch (err) {
        console.error('❌ Error en syncMarkupGroups:', err.message);
        return { success: false, error: err.message };
    }
}

module.exports = {
    startCatalogSync,
    syncSucursales,
    syncMarkupGroups
};
