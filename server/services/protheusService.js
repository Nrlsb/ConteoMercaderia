const dotenv = require('dotenv');
dotenv.config();

const PROTHEUS_API_URL = process.env.PROTHEUS_API_URL;
const PROTHEUS_BRANDS_API_URL = process.env.PROTHEUS_BRANDS_API_URL;
const PROTHEUS_CAPACITIES_API_URL = process.env.PROTHEUS_CAPACITIES_API_URL;
const PROTHEUS_ZID_API_URL = process.env.PROTHEUS_ZID_API_URL;
const PROTHEUS_SD2_API_URL = process.env.PROTHEUS_SD2_API_URL;
const PROTHEUS_SB2_API_URL = process.env.PROTHEUS_SB2_API_URL;
const PROTHEUS_DA1_API_URL = process.env.PROTHEUS_DA1_API_URL;
const PROTHEUS_ZP2_API_URL = process.env.PROTHEUS_ZP2_API_URL;
const PROTHEUS_ZP0_API_URL = process.env.PROTHEUS_ZP0_API_URL;

// Cachés en memoria
let brandsCache = null;
let isFetchingBrands = false;

let capacitiesCache = null;
let isFetchingCapacities = false;

/**
 * Consulta y descarga todas las marcas del Web Service de Protheus.
 * @returns {Promise<Object>} Objeto con mapa { brand_code: brand_name }
 */
async function fetchBrandsFromProtheus() {
    console.log('[PROTHEUS BRANDS] Descargando catálogo de marcas desde Protheus...');
    const brandsMap = {};

    try {
        let currentPage = 1;
        let totalPages = 1;

        do {
            const url = `${PROTHEUS_BRANDS_API_URL}?page=${currentPage}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`[PROTHEUS BRANDS] Error en página ${currentPage}: ${response.status} ${response.statusText}`);
                break;
            }

            const data = await response.json();
            if (!data || !data.objects || !Array.isArray(data.objects)) {
                break;
            }

            data.objects.forEach(brandObj => {
                if (brandObj && brandObj.sbm_grupo && brandObj.sbm_desc) {
                    const code = String(brandObj.sbm_grupo).trim();
                    const name = String(brandObj.sbm_desc).trim();
                    brandsMap[code] = name;
                }
            });

            totalPages = data.meta ? data.meta.total_pages : 1;
            currentPage++;

            if (currentPage <= totalPages) {
                await new Promise(r => setTimeout(r, 50));
            }

        } while (currentPage <= totalPages);

        console.log(`[PROTHEUS BRANDS] Se cargaron ${Object.keys(brandsMap).length} marcas exitosamente.`);
        return brandsMap;

    } catch (error) {
        console.error('[PROTHEUS BRANDS ERROR] Error al descargar marcas:', error.message);
        return brandsMap;
    }
}

/**
 * Consulta y descarga todas las capacidades del Web Service de Protheus (get_z02).
 * @returns {Promise<Object>} Objeto con mapa { capacity_code: capacity_desc }
 */
async function fetchCapacitiesFromProtheus() {
    console.log('[PROTHEUS CAPACITIES] Descargando catálogo de capacidades desde Protheus...');
    const capacitiesMap = {};

    try {
        let currentPage = 1;
        let totalPages = 1;

        do {
            const url = `${PROTHEUS_CAPACITIES_API_URL}?page=${currentPage}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`[PROTHEUS CAPACITIES] Error en página ${currentPage}: ${response.status} ${response.statusText}`);
                break;
            }

            const data = await response.json();
            if (!data || !data.objects || !Array.isArray(data.objects)) {
                break;
            }

            data.objects.forEach(capObj => {
                if (capObj && capObj.z02_cod && capObj.z02_descri) {
                    const code = String(capObj.z02_cod).trim();
                    const desc = String(capObj.z02_descri).trim();
                    capacitiesMap[code] = desc;
                }
            });

            totalPages = data.meta ? data.meta.total_pages : 1;
            currentPage++;

            if (currentPage <= totalPages) {
                await new Promise(r => setTimeout(r, 50));
            }

        } while (currentPage <= totalPages);

        console.log(`[PROTHEUS CAPACITIES] Se cargaron ${Object.keys(capacitiesMap).length} capacidades exitosamente.`);
        return capacitiesMap;

    } catch (error) {
        console.error('[PROTHEUS CAPACITIES ERROR] Error al descargar capacidades:', error.message);
        return capacitiesMap;
    }
}

/**
 * Asegura que la caché de marcas esté inicializada en memoria.
 */
async function ensureBrandsCache() {
    if (brandsCache !== null) return;
    if (isFetchingBrands) {
        while (brandsCache === null) {
            await new Promise(r => setTimeout(r, 100));
        }
        return;
    }

    isFetchingBrands = true;
    try {
        brandsCache = await fetchBrandsFromProtheus();
    } catch (e) {
        console.error('[PROTHEUS BRANDS ERROR] Error en inicialización de caché:', e.message);
        brandsCache = {};
    } finally {
        isFetchingBrands = false;
    }
}

/**
 * Asegura que la caché de capacidades esté inicializada en memoria.
 */
async function ensureCapacitiesCache() {
    if (capacitiesCache !== null) return;
    if (isFetchingCapacities) {
        while (capacitiesCache === null) {
            await new Promise(r => setTimeout(r, 100));
        }
        return;
    }

    isFetchingCapacities = true;
    try {
        capacitiesCache = await fetchCapacitiesFromProtheus();
    } catch (e) {
        console.error('[PROTHEUS CAPACITIES ERROR] Error en inicialización de caché:', e.message);
        capacitiesCache = {};
    } finally {
        isFetchingCapacities = false;
    }
}

/**
 * Consulta un producto en el Web Service de Protheus por su código interno.
 * @param {string} code Código de producto (ej: '000113')
 * @returns {Promise<Object|null>} Producto mapeado o null si no se encuentra o hay error
 */
/**
 * Consulta el precio de un producto para una lista de precios específica en Protheus (get_da1).
 * @param {string} code Código de producto (ej: '000111')
 * @param {string} codtab Código de la lista de precios (ej: '001' o '500')
 * @returns {Promise<Object|null>} Objeto con precio y moneda o null
 */
async function fetchSingleProductPrice(code, codtab) {
    if (!code || !codtab) return null;
    const cleanCode = String(code).trim();
    const url = `${PROTHEUS_DA1_API_URL}?codtab=${codtab}&cod=${encodeURIComponent(cleanCode)}`;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        if (data && data.objects && Array.isArray(data.objects)) {
            const priceObj = data.objects.find(p => p && p.da1_codpro && String(p.da1_codpro).trim().toLowerCase() === cleanCode.toLowerCase());
            if (priceObj) {
                return {
                    price: priceObj.da1_prcven !== undefined && priceObj.da1_prcven !== null ? parseFloat(priceObj.da1_prcven) : 0,
                    currency: priceObj.da1_moeda ? String(priceObj.da1_moeda).trim() : null
                };
            }
        }
        return null;
    } catch (error) {
        console.error(`[PROTHEUS DA1 ERROR] Error consultando lista ${codtab} para producto ${cleanCode}:`, error.message);
        return null;
    }
}

/**
 * Consulta un producto en el Web Service de Protheus por su código interno.
 * @param {string} code Código de producto (ej: '000113')
 * @returns {Promise<Object|null>} Producto mapeado o null si no se encuentra o hay error
 */
async function fetchProductFromProtheus(code, prices001Map = null, prices500Map = null) {
    if (!code) return null;
    const cleanCode = String(code).trim();
    
    if (cleanCode.length > 10) {
        console.log(`[PROTHEUS WS] Código "${cleanCode}" parece ser de barras u otro tipo. Se omite consulta al WS.`);
        return null;
    }

    const url = `${PROTHEUS_API_URL}?cod=${encodeURIComponent(cleanCode)}`;
    console.log(`[PROTHEUS WS] Consultando producto por código "${cleanCode}" en URL: ${url}`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`[PROTHEUS WS] Respuesta no exitosa para código "${cleanCode}": ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        if (!data) {
            console.log(`[PROTHEUS WS] No se recibieron datos para el código "${cleanCode}"`);
            return null;
        }

        let productList = [];
        if (data.objects && Array.isArray(data.objects)) {
            productList = data.objects;
        } else if (Array.isArray(data)) {
            productList = data;
        } else if (data && typeof data === 'object') {
            productList = [data];
        }

        const productData = productList.find(p => p && p.b1_cod && String(p.b1_cod).trim().toLowerCase() === cleanCode.toLowerCase());

        if (!productData || !productData.b1_cod || !productData.b1_desc) {
            console.log(`[PROTHEUS WS] No se encontró producto con código exacto "${cleanCode}" en la respuesta:`, data);
            return null;
        }

        // Asegurar las cachés de marcas y capacidades
        await Promise.all([ensureBrandsCache(), ensureCapacitiesCache()]);

        const brandCode = productData.b1_grupo ? String(productData.b1_grupo).trim() : null;
        const brandName = brandCode ? (brandsCache[brandCode] || null) : null;

        const capacityCode = productData.b1_xcapa ? String(productData.b1_xcapa).trim() : null;
        const realWeight = capacityCode ? (capacitiesCache[capacityCode] || null) : null;

        // Consultar precios en las listas 001 y 500 (usar mapa pre-cargado si existe)
        const price001Data = prices001Map 
            ? prices001Map[cleanCode.toLowerCase()] 
            : await fetchSingleProductPrice(cleanCode, '001');

        const price500Data = prices500Map 
            ? prices500Map[cleanCode.toLowerCase()] 
            : await fetchSingleProductPrice(cleanCode, '500');

        // Mapear los campos de la API a la estructura de la base de datos local
        const mappedProduct = {
            code: String(productData.b1_cod).trim(),
            description: String(productData.b1_desc).trim(),
            capacity: capacityCode,
            real_weight: realWeight, // Mapear la descripción de la capacidad (ej: "20,000 LITROS")
            cost_price: productData.b1_custd !== undefined && productData.b1_custd !== null ? parseFloat(productData.b1_custd) : 0,
            brand_code: brandCode,
            brand: brandName,
            tes: productData.b1_ts ? String(productData.b1_ts).trim() : null,
            lista001: price001Data ? price001Data.price : 0,
            lista500: price500Data ? price500Data.price : 0,
            moneda: (price001Data && price001Data.currency) || (price500Data && price500Data.currency) || null
        };

        console.log(`[PROTHEUS WS] Producto encontrado, mapeado y enriquecido con marca "${mappedProduct.brand || 'N/A'}", peso/volumen "${mappedProduct.real_weight || 'N/A'}" y precios (001: ${mappedProduct.lista001}, 500: ${mappedProduct.lista500}):`, mappedProduct);
        return mappedProduct;

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[PROTHEUS WS ERROR] Tiempo de espera agotado (Timeout) consultando código "${cleanCode}"`);
        } else {
            console.error(`[PROTHEUS WS ERROR] Error al consultar código "${cleanCode}":`, error.message);
        }
        return null;
    }
}

/**
 * Consulta los ítems de un conteo en la tabla ZID de Protheus por su ID.
 * @param {string} zidId ID del conteo (ej: '000001')
 * @returns {Promise<Array>} Lista de ítems del conteo o array vacío si no se encuentra
 */
async function fetchZidCountFromProtheus(zidId, filial) {
    if (!zidId) return [];
    const cleanId = String(zidId).trim();
    
    // Consultamos usando query parameters (?id=...), que es la forma más compatible
    let url = `${PROTHEUS_ZID_API_URL}?id=${encodeURIComponent(cleanId)}&pageSize=999999`;
    if (filial) {
        url += `&filial=${encodeURIComponent(String(filial).trim())}`;
    }
    console.log(`[PROTHEUS ZID WS] Consultando conteo ZID por ID "${cleanId}" (Filial: "${filial || 'todas'}") en URL: ${url}`);
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos timeout
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.warn(`[PROTHEUS ZID WS] Respuesta no exitosa para ID "${cleanId}": ${response.status} ${response.statusText}`);
            return [];
        }
        
        const text = await response.text();
        if (!text || text.trim() === '') {
            console.log(`[PROTHEUS ZID WS] Cuerpo de respuesta vacío para el ID "${cleanId}"`);
            return [];
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error(`[PROTHEUS ZID WS ERROR] La respuesta de Protheus no es un JSON válido para ID "${cleanId}":`, text.substring(0, 150));
            return [];
        }
        if (!data) {
            console.log(`[PROTHEUS ZID WS] No se recibieron datos para el ID "${cleanId}"`);
            return [];
        }
        
        let items = [];
        if (Array.isArray(data)) {
            items = data;
        } else if (data.objects && Array.isArray(data.objects)) {
            items = data.objects;
        } else if (typeof data === 'object') {
            items = [data];
        }
        
        // Retornar solo ítems válidos del conteo (que coincidan con el zid_id buscado y opcionalmente con filial)
        const filteredItems = items.filter(item => {
            if (!item || !item.zid_id) return false;
            const matchesId = String(item.zid_id).trim().toLowerCase() === cleanId.toLowerCase();
            if (!matchesId) return false;
            
            if (filial && item.zid_filial) {
                return String(item.zid_filial).trim().toLowerCase() === String(filial).trim().toLowerCase();
            }
            return true;
        });
        
        console.log(`[PROTHEUS ZID WS] Conteo ZID "${cleanId}" cargado con éxito. Se obtuvieron ${filteredItems.length} ítems.`);
        return filteredItems;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[PROTHEUS ZID WS ERROR] Tiempo de espera agotado (Timeout) consultando ZID "${cleanId}"`);
        } else {
            console.error(`[PROTHEUS ZID WS ERROR] Error al consultar ZID "${cleanId}":`, error.message);
        }
        return [];
    }
}

/**
 * Consulta los detalles de un remito en el Web Service de Protheus (get_sd2) por su número de documento.
 * @param {string} docNumber Número de documento/remito (ej: '003700000002')
 * @returns {Promise<Array>} Lista de ítems del remito obtenidos
 */
async function fetchRemitoFromProtheus(docNumber) {
    if (!docNumber) return [];
    const cleanDoc = String(docNumber).trim();
    
    const url = `${PROTHEUS_SD2_API_URL}?doc=${encodeURIComponent(cleanDoc)}`;
    console.log(`[PROTHEUS SD2 WS] Consultando remito por doc "${cleanDoc}" en URL: ${url}`);
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos timeout
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.warn(`[PROTHEUS SD2 WS] Respuesta no exitosa para doc "${cleanDoc}": ${response.status} ${response.statusText}`);
            return [];
        }
        
        const text = await response.text();
        if (!text || text.trim() === '') {
            console.log(`[PROTHEUS SD2 WS] Cuerpo de respuesta vacío para el doc "${cleanDoc}"`);
            return [];
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error(`[PROTHEUS SD2 WS ERROR] La respuesta de Protheus no es un JSON válido para doc "${cleanDoc}":`, text.substring(0, 150));
            return [];
        }
        if (!data) {
            console.log(`[PROTHEUS SD2 WS] No se recibieron datos para el doc "${cleanDoc}"`);
            return [];
        }
        
        let items = [];
        if (Array.isArray(data)) {
            items = data;
        } else if (data.objects && Array.isArray(data.objects)) {
            items = data.objects;
        } else if (typeof data === 'object') {
            items = [data];
        }
        
        // Retornar ítems válidos
        // En Protheus get_sd2, los ítems vienen con "documento". Filtramos para mayor seguridad
        const filteredItems = items.filter(item => item && item.documento && String(item.documento).trim() === cleanDoc);
        
        const finalItems = filteredItems.length > 0 ? filteredItems : items;
        
        console.log(`[PROTHEUS SD2 WS] Remito "${cleanDoc}" cargado con éxito. Se obtuvieron ${finalItems.length} ítems.`);
        return finalItems;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[PROTHEUS SD2 WS ERROR] Tiempo de espera agotado (Timeout) consultando doc "${cleanDoc}"`);
        } else {
            console.error(`[PROTHEUS SD2 WS ERROR] Error al consultar doc "${cleanDoc}":`, error.message);
        }
        return [];
    }
}

/**
 * Consulta el stock de un producto en el Web Service de Protheus (get_sb2).
 * @param {string} code Código de producto (ej: '000113')
 * @returns {Promise<Array>} Lista de objetos de stock de Protheus o array vacío si no se encuentra
 */
async function fetchStockFromProtheus(code) {
    if (!code) return [];
    const cleanCode = String(code).trim();

    const url = `${PROTHEUS_SB2_API_URL}?cod=${encodeURIComponent(cleanCode)}`;
    console.log(`[PROTHEUS SB2 WS] Consultando stock por código "${cleanCode}" en URL: ${url}`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`[PROTHEUS SB2 WS] Respuesta no exitosa para código "${cleanCode}": ${response.status} ${response.statusText}`);
            return [];
        }

        const text = await response.text();
        if (!text || text.trim() === '') {
            console.log(`[PROTHEUS SB2 WS] Cuerpo de respuesta vacío para el código "${cleanCode}"`);
            return [];
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error(`[PROTHEUS SB2 WS ERROR] La respuesta de Protheus no es un JSON válido para código "${cleanCode}":`, text.substring(0, 150));
            return [];
        }

        if (!data) {
            console.log(`[PROTHEUS SB2 WS] No se recibieron datos para el código "${cleanCode}"`);
            return [];
        }

        let stockList = [];
        if (data.objects && Array.isArray(data.objects)) {
            stockList = data.objects;
        } else if (Array.isArray(data)) {
            stockList = data;
        } else if (typeof data === 'object') {
            stockList = [data];
        }

        // Mapear y calcular stock disponible para cada entrada
        const mappedStock = stockList.map(item => {
            const qatu = Number(item.b2_qatu) || 0;
            const reserva = Number(item.b2_reserva) || 0;
            const disponible = qatu - reserva;
            return {
                filial: item.b2_filial ? String(item.b2_filial).trim() : '',
                local: item.b2_local ? String(item.b2_local).trim() : '',
                cod: item.b2_cod ? String(item.b2_cod).trim() : '',
                qatu: qatu,
                reserva: reserva,
                disponible: disponible,
                xdprod: item.b2_xdprod ? String(item.b2_xdprod).trim() : ''
            };
        });

        console.log(`[PROTHEUS SB2 WS] Stock cargado con éxito para "${cleanCode}". Se obtuvieron ${mappedStock.length} registros.`);
        return mappedStock;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[PROTHEUS SB2 WS ERROR] Tiempo de espera agotado (Timeout) consultando stock para "${cleanCode}"`);
        } else {
            console.error(`[PROTHEUS SB2 WS ERROR] Error al consultar stock para "${cleanCode}":`, error.message);
        }
        return [];
    }
}

/**
 * Consulta y descarga todos los precios de una lista del Web Service de Protheus (get_da1) paginando.
 * @param {string} codtab Código de lista (ej: '001' o '500')
 * @returns {Promise<Object>} Objeto con mapa { product_code: { price: number, currency: string } }
 */
async function fetchPricesFromProtheus(codtab) {
    console.log(`[PROTHEUS DA1] Descargando catálogo de precios de lista "${codtab}" desde Protheus...`);
    const pricesMap = {};

    try {
        let currentPage = 1;
        let totalPages = 1;
        const pageSize = 5000; // Carga en lotes grandes para eficiencia

        do {
            const url = `${PROTHEUS_DA1_API_URL}?codtab=${codtab}&page=${currentPage}&pageSize=${pageSize}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`[PROTHEUS DA1] Error en lista "${codtab}", página ${currentPage}: ${response.status} ${response.statusText}`);
                break;
            }

            const data = await response.json();
            if (!data || !data.objects || !Array.isArray(data.objects)) {
                break;
            }

            data.objects.forEach(priceObj => {
                if (priceObj && priceObj.da1_codpro) {
                    const code = String(priceObj.da1_codpro).trim().toLowerCase();
                    const price = priceObj.da1_prcven !== undefined && priceObj.da1_prcven !== null ? parseFloat(priceObj.da1_prcven) : 0;
                    const currency = priceObj.da1_moeda ? String(priceObj.da1_moeda).trim() : null;
                    pricesMap[code] = { price, currency };
                }
            });

            totalPages = data.meta ? data.meta.total_pages : 1;
            currentPage++;

            if (currentPage <= totalPages) {
                await new Promise(r => setTimeout(r, 50));
            }

        } while (currentPage <= totalPages);

        console.log(`[PROTHEUS DA1] Se cargaron ${Object.keys(pricesMap).length} precios de la lista "${codtab}".`);
        return pricesMap;

    } catch (error) {
        console.error(`[PROTHEUS DA1 ERROR] Error al descargar precios de lista "${codtab}":`, error.message);
        return pricesMap;
    }
}

/**
 * Consulta y descarga todas las sucursales del Web Service de Protheus (get_zp2).
 * @returns {Promise<Array>} Lista de objetos sucursal con campos { code, name, location }
 */
async function fetchSucursalesFromProtheus() {
    console.log('[PROTHEUS SUCURSALES] Descargando catálogo de sucursales desde Protheus...');
    const sucursalesList = [];
    const urlBase = PROTHEUS_ZP2_API_URL || 'http://119.8.78.68:9078/rest/SISAPPMER/get_zp2';

    try {
        let currentPage = 1;
        let totalPages = 1;

        do {
            const url = `${urlBase}?page=${currentPage}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`[PROTHEUS SUCURSALES] Error en página ${currentPage}: ${response.status} ${response.statusText}`);
                break;
            }

            const data = await response.json();
            if (!data || !data.objects || !Array.isArray(data.objects)) {
                break;
            }

            data.objects.forEach(sucObj => {
                if (sucObj && sucObj.zp2_codsuc) {
                    sucursalesList.push({
                        code: String(sucObj.zp2_codsuc).trim(),
                        name: sucObj.zp2_nomsuc ? String(sucObj.zp2_nomsuc).trim() : `Sucursal ${sucObj.zp2_codsuc}`,
                        location: sucObj.zp2_locali ? String(sucObj.zp2_locali).trim() : null,
                        markup_group_id: sucObj.zp2_id ? String(sucObj.zp2_id).trim() : null
                    });
                }
            });

            totalPages = data.meta ? data.meta.total_pages : 1;
            currentPage++;

            if (currentPage <= totalPages) {
                await new Promise(r => setTimeout(r, 50));
            }

        } while (currentPage <= totalPages);

        console.log(`[PROTHEUS SUCURSALES] Se cargaron ${sucursalesList.length} sucursales exitosamente.`);
        return sucursalesList;

    } catch (error) {
        console.error('[PROTHEUS SUCURSALES ERROR] Error al descargar sucursales:', error.message);
        return sucursalesList;
    }
}

/**
 * Consulta y descarga todos los grupos de porcentaje de aumento del Web Service de Protheus (get_zp0).
 * @returns {Promise<Array>} Lista de objetos de recargo con campos { id, value, active }
 */
async function fetchMarkupGroupsFromProtheus() {
    console.log('[PROTHEUS MARKUP GROUPS] Descargando grupos de recargo desde Protheus...');
    const groupsList = [];
    const urlBase = PROTHEUS_ZP0_API_URL || 'http://119.8.78.68:9078/rest/SISAPPMER/get_zp0';

    try {
        let currentPage = 1;
        let totalPages = 1;

        do {
            const url = `${urlBase}?page=${currentPage}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`[PROTHEUS MARKUP GROUPS] Error en página ${currentPage}: ${response.status} ${response.statusText}`);
                break;
            }

            const data = await response.json();
            if (!data || !data.objects || !Array.isArray(data.objects)) {
                break;
            }

            data.objects.forEach(groupObj => {
                if (groupObj && groupObj.zp0_id) {
                    groupsList.push({
                        id: String(groupObj.zp0_id).trim(),
                        value: groupObj.zp0_valor !== undefined && groupObj.zp0_valor !== null ? parseFloat(groupObj.zp0_valor) : 0,
                        active: groupObj.zp0_activo ? String(groupObj.zp0_activo).trim().toUpperCase() === 'S' : true
                    });
                }
            });

            totalPages = data.meta ? data.meta.total_pages : 1;
            currentPage++;

            if (currentPage <= totalPages) {
                await new Promise(r => setTimeout(r, 50));
            }

        } while (currentPage <= totalPages);

        console.log(`[PROTHEUS MARKUP GROUPS] Se cargaron ${groupsList.length} grupos de recargo exitosamente.`);
        return groupsList;

    } catch (error) {
        console.error('[PROTHEUS MARKUP GROUPS ERROR] Error al descargar grupos de recargo:', error.message);
        return groupsList;
    }
}

module.exports = {
    fetchProductFromProtheus,
    fetchBrandsFromProtheus,
    fetchCapacitiesFromProtheus,
    fetchPricesFromProtheus,
    fetchZidCountFromProtheus,
    fetchRemitoFromProtheus,
    fetchStockFromProtheus,
    fetchSucursalesFromProtheus,
    fetchMarkupGroupsFromProtheus
};
