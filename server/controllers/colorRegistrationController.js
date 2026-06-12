const supabase = require('../services/supabaseClient');

// Get all color registrations
exports.getAll = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('color_registrations')
            .select(`
                *,
                products (
                    id,
                    code,
                    description,
                    brand
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
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
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
        base
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
                    brand
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
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating color registration:', error);
        res.status(500).json({ message: 'Error al registrar el color' });
    }
};

// Delete a color registration
exports.delete = async (req, res) => {
    const { id } = req.params;

    try {
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
