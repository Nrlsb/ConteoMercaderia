const supabase = require('../services/supabaseClient');
const dolarService = require('../services/dolarService');

/**
 * Enrich an array of color registration rows with a calculated `precio_ars`
 * on the nested `products` object.  Uses the user's price list (001 or 500),
 * converts USD → ARS when needed, and applies VAT based on the TES code.
 */
async function enrichWithPrice(rows, userPriceList) {
    if (!rows || rows.length === 0) return rows;

    // Only process rows that have a product with pricing data
    const needsEnrich = rows.some(r => r.products && (r.products.lista001 || r.products.lista500));
    if (!needsEnrich) return rows;

    const cotizaciones = await dolarService.getCotizaciones();
    const priceField = userPriceList === '500' ? 'lista500' : 'lista001';

    rows.forEach(r => {
        if (!r.products) return;
        let rawPrice = r.products[priceField] ? Number(r.products[priceField]) : null;
        if (!rawPrice || rawPrice <= 0) {
            r.products.precio_ars = null;
            return;
        }

        // Convert currency if needed
        rawPrice = dolarService.convertirPrecio(rawPrice, r.products.moneda, cotizaciones);

        // Apply VAT based on TES code
        const tes = r.products.tes ? String(r.products.tes).trim() : '';
        let vatMultiplier = 1.0;
        if (tes === '503') vatMultiplier = 1.21;
        else if (tes === '501') vatMultiplier = 1.105;

        r.products.precio_ars = parseFloat((rawPrice * vatMultiplier).toFixed(2));
    });

    return rows;
}

// Get all color registrations
exports.getAll = async (req, res) => {
    try {
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
            `);

        // Filter: only show if the user created it, is assigned to it, or is a superadmin
        if (req.user.role !== 'superadmin') {
            query = query.or(`created_by.eq.${req.user.id},user_id.eq.${req.user.id}`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // Enrich products with calculated ARS price
        const userPriceList = req.user.price_list || '001';
        const enriched = await enrichWithPrice(data || [], userPriceList);

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
        obra
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
        const enriched = await enrichWithPrice([data], userPriceList);

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
