const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { fetchProductFromProtheus } = require('./services/protheusService');

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// Límite de concurrencia para las llamadas al WS (para no saturar el servidor de Protheus)
const CONCURRENCY_LIMIT = 5;
// Delay adicional en milisegundos entre lotes de peticiones
const BATCH_DELAY = 100;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncAllProducts() {
    console.log('--- Iniciando Sincronización Masiva de Productos con Protheus ---');
    console.log('1. Obteniendo códigos de productos existentes en la base de datos local...');
    
    // Obtener todos los productos
    const { data: dbProducts, error: dbError } = await supabase
        .from('products')
        .select('id, code, description')
        .not('code', 'is', null)
        .order('code', { ascending: true });

    if (dbError) {
        console.error('❌ Error al obtener productos de Supabase:', dbError.message);
        return;
    }

    const totalProducts = dbProducts.length;
    console.log(`✅ Se encontraron ${totalProducts} productos en la base de datos para sincronizar.\n`);
    
    let processedCount = 0;
    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    // Procesar los productos en lotes con concurrencia controlada
    for (let i = 0; i < totalProducts; i += CONCURRENCY_LIMIT) {
        const batch = dbProducts.slice(i, i + CONCURRENCY_LIMIT);
        
        // Ejecutar consultas del lote de forma concurrente
        await Promise.all(batch.map(async (dbProduct) => {
            const code = dbProduct.code;
            
            try {
                // Consultar en el WS de Protheus
                const protheusProduct = await fetchProductFromProtheus(code);
                processedCount++;

                if (protheusProduct) {
                    // Actualizar el producto en Supabase con los nuevos datos
                    const { error: updateError } = await supabase
                        .from('products')
                        .update({
                            description: protheusProduct.description,
                            capacity: protheusProduct.capacity,
                            cost_price: protheusProduct.cost_price,
                            brand_code: protheusProduct.brand_code,
                            tes: protheusProduct.tes,
                            lista001: protheusProduct.lista001,
                            lista500: protheusProduct.lista500,
                            moneda: protheusProduct.moneda
                        })
                        .eq('id', dbProduct.id);

                    if (updateError) {
                        console.error(`❌ [${processedCount}/${totalProducts}] Error actualizando "${code}" (${dbProduct.description}):`, updateError.message);
                        errorCount++;
                    } else {
                        console.log(`✅ [${processedCount}/${totalProducts}] Sincronizado: ${code} - Precio: $${protheusProduct.cost_price} - Capacidad: ${protheusProduct.capacity || 'N/A'}`);
                        updatedCount++;
                    }
                } else {
                    console.log(`⚠️ [${processedCount}/${totalProducts}] No se encontró en Protheus: ${code} (${dbProduct.description})`);
                    notFoundCount++;
                }
            } catch (err) {
                console.error(`❌ [${processedCount}/${totalProducts}] Error inesperado procesando "${code}":`, err.message);
                errorCount++;
            }
        }));

        // Pequeña pausa entre lotes para aliviar la carga
        if (i + CONCURRENCY_LIMIT < totalProducts) {
            await delay(BATCH_DELAY);
        }
    }

    console.log('\n--- Sincronización Finalizada ---');
    console.log(`📊 Estadísticas:`);
    console.log(`- Total productos evaluados: ${totalProducts}`);
    console.log(`- Sincronizados con éxito: ${updatedCount}`);
    console.log(`- No encontrados en Protheus: ${notFoundCount}`);
    console.log(`- Errores de procesamiento: ${errorCount}`);
    console.log('---------------------------------');
}

syncAllProducts();
