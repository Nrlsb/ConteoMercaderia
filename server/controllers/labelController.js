const supabase = require('../services/supabaseClient');

exports.getLabelHistory = async (req, res) => {
    let { limit = 20, offset = 0 } = req.query;
    limit = parseInt(limit);
    offset = parseInt(offset);

    try {
        let query = supabase
            .from('label_print_history')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Filter by branch for non-admin roles
        if (!['superadmin', 'admin'].includes(req.user.role) && req.user.sucursal_id) {
            query = query.eq('sucursal_id', req.user.sucursal_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching label history:', error);
        res.status(500).json({ message: 'Error fetching label history' });
    }
};

exports.addLabelHistory = async (req, res) => {
    const { type, data } = req.body;
    if (!type || !data) return res.status(400).json({ message: 'Type and data are required' });

    try {
        const { error } = await supabase
            .from('label_print_history')
            .insert([{
                type,
                data,
                user_id: req.user.id,
                user_name: req.user.username,
                sucursal_id: req.user.sucursal_id || null
            }]);

        if (error) throw error;
        res.status(201).json({ message: 'History recorded' });
    } catch (error) {
        console.error('Error recording label history:', error);
        res.status(500).json({ message: 'Error recording label history' });
    }
};
