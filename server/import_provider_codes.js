const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getAllProducts() {
    let allProducts = [];
    let page = 0;
    const pageSize = 1000;

    console.log('Fetching products from database...');
    while (true) {
        const { data, error } = await supabase
            .from('products')
            .select('id, code, provider_code')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error('Error fetching products:', error);
            throw error;
        }

        if (!data || data.length === 0) break;
        allProducts = allProducts.concat(data);
        page++;
    }

    console.log(`Fetched ${allProducts.length} products.`);

    const productMap = new Map();
    for (const p of allProducts) {
        productMap.set(p.code, p);
    }
    return productMap;
}

async function importProviderCodes() {
    console.log('--- Iniciando Importación Optimizada de Códigos de Proveedor ---');
    try {
        const productMap = await getAllProducts();

        const workbook = xlsx.readFile('CodProdProveedores2.xlsx');
        const sheetName = '2-Vinc. Producto vs. Proveedo';
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        const updatesNeeded = [];
        let notFoundCount = 0;

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 8) continue;

            const internalCode = String(row[0] || '').trim();
            const providerCode = String(row[row.length - 1] || '').trim();

            if (!internalCode || internalCode === 'Producto' || !providerCode) {
                continue;
            }

            const dbProduct = productMap.get(internalCode);
            if (dbProduct) {
                if (dbProduct.provider_code !== providerCode) {
                    updatesNeeded.push({
                        id: dbProduct.id,
                        provider_code: providerCode
                    });
                }
            } else {
                notFoundCount++;
            }
        }

        console.log(`Encontrados ${updatesNeeded.length} productos que necesitan actualización de provider_code.`);
        console.log(`Productos en Excel no encontrados en DB: ${notFoundCount}`);

        // Process updates in chunks of 50
        const chunkSize = 50;
        let updatedCount = 0;

        for (let i = 0; i < updatesNeeded.length; i += chunkSize) {
            const chunk = updatesNeeded.slice(i, i + chunkSize);

            // Ejecutar las actualizaciones en paralelo para este chunk
            await Promise.all(chunk.map(async (updateData) => {
                const { error } = await supabase
                    .from('products')
                    .update({ provider_code: updateData.provider_code })
                    .eq('id', updateData.id);
                if (error) {
                    console.error(`Error en update para id ${updateData.id}:`, error.message);
                }
            }));

            updatedCount += chunk.length;
            console.log(`Progreso: ${updatedCount} / ${updatesNeeded.length} actualizados...`);
        }

        console.log('--- Proceso Finalizado con Éxito ---');

    } catch (err) {
        console.error('Error fatal en el script:', err);
    }
}

importProviderCodes();
