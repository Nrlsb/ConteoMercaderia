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

    while (true) {
        const { data } = await supabase.from('products').select('id, code, provider_code').range(page * pageSize, (page + 1) * pageSize - 1);
        if (!data || data.length === 0) break;
        allProducts = allProducts.concat(data);
        page++;
    }

    const productMap = new Map();
    for (const p of allProducts) {
        productMap.set(p.code, p);
    }
    return productMap;
}

async function listMissingItems() {
    try {
        const productMap = await getAllProducts();
        const workbook = xlsx.readFile('CodProdProveedores2.xlsx');
        const sheet = workbook.Sheets['2-Vinc. Producto vs. Proveedo'];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        const missing = [];

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 8) continue;

            const internalCode = String(row[0] || '').trim();
            const description = String(row[1] || '').trim();
            const providerCode = String(row[row.length - 1] || '').trim();

            if (!internalCode || internalCode === 'Producto' || !providerCode) {
                continue;
            }

            const dbProduct = productMap.get(internalCode);
            if (!dbProduct) {
                missing.push({
                    codigoInterno: internalCode,
                    descripcion: description,
                    codigoProveedor: providerCode
                });
            }
        }

        console.log("--- PRODUCTOS FALTANTES EN BASE DE DATOS ---");
        missing.forEach(item => {
            console.log(`- Código Interno: ${item.codigoInterno} | Cód. Prov: ${item.codigoProveedor} | Desc: ${item.descripcion}`);
        });
        console.log(`\nTotal faltantes encontradas: ${missing.length}`);

    } catch (err) {
        console.error(err);
    }
}

listMissingItems();
