const axios = require('axios');
const cheerio = require('cheerio');
const supabase = require('./supabaseClient');

const URL_BNA = 'https://www.bna.com.ar/Personas';

// Limpia saltos de línea y espacios en blanco
const limpiarTexto = (texto) => {
    if (!texto) return null;
    return texto.replace(/\n/g, '').trim();
};

// Parsea formato Billete: "1.425,00" -> 1425.00
const parsearFormatoBillete = (valor) => {
    if (!valor) return null;
    return parseFloat(valor.replace(/\./g, '').replace(',', '.'));
};

// Parsea formato Divisa: "1,403.0000" -> 1403.0000
const parsearFormatoDivisa = (valor) => {
    if (!valor) return null;
    return parseFloat(valor.replace(/,/g, ''));
};

// Caché en memoria para evitar saturar la base de datos en peticiones concurrentes
let cacheCotizaciones = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de caché

/**
 * Realiza la petición al BNA y extrae las cotizaciones de venta
 */
async function obtenerCotizacionesDesdeBNA() {
    try {
        console.log('[DOLAR SCRAPING] Iniciando scraping del sitio BNA...');
        const { data: html } = await axios.get(URL_BNA, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        const $ = cheerio.load(html);

        // --- Lógica para Billetes ---
        const tablaBilletes = $('#billetes');
        const filaDolarBillete = tablaBilletes.find('tbody tr').first();
        const billeteVenta = limpiarTexto(filaDolarBillete.find('td').eq(2).text());

        // --- Lógica para Divisas ---
        const tablaDivisas = $('#divisas');
        const filaDolarDivisa = tablaDivisas.find('tbody tr').first();
        const divisaVenta = limpiarTexto(filaDolarDivisa.find('td').eq(2).text());

        const dolarBilleteVal = parsearFormatoBillete(billeteVenta);
        const dolarDivisaVal = parsearFormatoDivisa(divisaVenta);

        if (!dolarBilleteVal || !dolarDivisaVal) {
            throw new Error(`Valores parseados inválidos (Billete: ${dolarBilleteVal}, Divisa: ${dolarDivisaVal})`);
        }

        console.log(`[DOLAR SCRAPING] Scraping exitoso. Billete Venta: ${dolarBilleteVal}, Divisa Venta: ${dolarDivisaVal}`);

        return {
            dolar_billete: dolarBilleteVal,
            dolar_divisa: dolarDivisaVal,
            origen: 'Banco de la Nación Argentina',
            fecha: new Date().toISOString()
        };
    } catch (error) {
        console.error('[DOLAR SCRAPING ERROR] Error al realizar el scraping del BNA:', error.message);
        throw new Error('No se pudo obtener la cotización oficial desde BNA');
    }
}

/**
 * Actualiza las cotizaciones en la base de datos de Supabase
 */
async function actualizarCotizacionesBD() {
    try {
        const cotizaciones = await obtenerCotizacionesDesdeBNA();
        
        // Guardar dolar_billete
        const { error: errorBillete } = await supabase
            .from('cotizaciones')
            .upsert({
                id: 'dolar_billete',
                valor: cotizaciones.dolar_billete,
                origen: cotizaciones.origen,
                updated_at: cotizaciones.fecha
            });

        if (errorBillete) throw errorBillete;

        // Guardar dolar_divisa
        const { error: errorDivisa } = await supabase
            .from('cotizaciones')
            .upsert({
                id: 'dolar_divisa',
                valor: cotizaciones.dolar_divisa,
                origen: cotizaciones.origen,
                updated_at: cotizaciones.fecha
            });

        if (errorDivisa) throw errorDivisa;

        console.log('[DOLAR SERVICE] Base de datos actualizada con las nuevas cotizaciones.');

        // Invalidar/Actualizar la caché
        cacheCotizaciones = {
            dolar_billete: cotizaciones.dolar_billete,
            dolar_divisa: cotizaciones.dolar_divisa,
            updated_at: cotizaciones.fecha
        };
        cacheTimestamp = Date.now();

        return cacheCotizaciones;
    } catch (error) {
        console.error('[DOLAR SERVICE ERROR] Error al actualizar cotizaciones en BD:', error.message);
        throw error;
    }
}

/**
 * Obtiene las cotizaciones desde la base de datos (con caché intermedia)
 */
async function getCotizaciones() {
    const ahora = Date.now();
    
    // Si tenemos caché válida, la retornamos
    if (cacheCotizaciones && (ahora - cacheTimestamp < CACHE_TTL_MS)) {
        return cacheCotizaciones;
    }

    try {
        console.log('[DOLAR SERVICE] Consultando cotizaciones desde la base de datos...');
        const { data, error } = await supabase
            .from('cotizaciones')
            .select('id, valor, updated_at');

        if (error) throw error;

        if (!data || data.length === 0) {
            console.log('[DOLAR SERVICE] No se encontraron cotizaciones en la BD. Inicializando valores...');
            return { dolar_billete: 1.0, dolar_divisa: 1.0, updated_at: new Date().toISOString() };
        }

        const cotizacionesObj = {};
        let ultimaFecha = null;

        data.forEach(row => {
            cotizacionesObj[row.id] = parseFloat(row.valor);
            if (!ultimaFecha || new Date(row.updated_at) > new Date(ultimaFecha)) {
                ultimaFecha = row.updated_at;
            }
        });

        // Estructura de retorno
        cacheCotizaciones = {
            dolar_billete: cotizacionesObj['dolar_billete'] || 1.0,
            dolar_divisa: cotizacionesObj['dolar_divisa'] || 1.0,
            updated_at: ultimaFecha || new Date().toISOString()
        };
        cacheTimestamp = ahora;

        return cacheCotizaciones;
    } catch (error) {
        console.error('[DOLAR SERVICE ERROR] Error al consultar cotizaciones:', error.message);
        // Si falla la BD, y tenemos caché expirada, la usamos de fallback
        if (cacheCotizaciones) {
            console.warn('[DOLAR SERVICE] Usando caché expirada como fallback de emergencia.');
            return cacheCotizaciones;
        }
        return { dolar_billete: 1.0, dolar_divisa: 1.0, updated_at: new Date().toISOString() };
    }
}

/**
 * Helper para convertir un precio basado en el tipo de moneda
 * @param {number} precio Precio original a convertir
 * @param {string} moneda Identificador de la moneda ('2' = Billete, '3' = Divisa, '1' = Pesos u otros)
 * @param {Object} cotizaciones Objeto con dolar_billete y dolar_divisa
 * @returns {number} Precio convertido a pesos
 */
function convertirPrecio(precio, moneda, cotizaciones) {
    if (!precio) return 0;
    const precioNum = Number(precio);
    if (isNaN(precioNum)) return 0;

    const monedaStr = moneda ? String(moneda).trim() : '1';
    const billeteRate = cotizaciones?.dolar_billete || 1.0;
    const divisaRate = cotizaciones?.dolar_divisa || 1.0;

    if (monedaStr === '2') {
        return precioNum * billeteRate;
    } else if (monedaStr === '3') {
        return precioNum * divisaRate;
    }
    
    return precioNum;
}

module.exports = {
    obtenerCotizacionesDesdeBNA,
    actualizarCotizacionesBD,
    getCotizaciones,
    convertirPrecio
};
