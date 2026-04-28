const supabase = require('../services/supabaseClient');

exports.getAllSucursales = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sucursales')
            .select('*')
            .order('name');

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching sucursales:', error);
        res.status(500).json({ message: 'Error fetching sucursales' });
    }
};

exports.createSucursal = async (req, res) => {
    const { name, location, code } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    try {
        const { data, error } = await supabase
            .from('sucursales')
            .insert([{ name, location, code }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating sucursal:', error);
        res.status(500).json({ message: 'Error creating sucursal' });
    }
};

exports.updateSucursal = async (req, res) => {
    const { id } = req.params;
    const { name, location, code } = req.body;

    try {
        const { data, error } = await supabase
            .from('sucursales')
            .update({ name, location, code })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error updating sucursal:', error);
        res.status(500).json({ message: 'Error updating sucursal' });
    }
};

exports.deleteSucursal = async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('sucursales')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Sucursal deleted' });
    } catch (error) {
        console.error('Error deleting sucursal:', error);
        res.status(500).json({ message: 'Error deleting sucursal' });
    }
};
