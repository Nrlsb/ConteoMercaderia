const supabase = require('../services/supabaseClient');

// Obtener todas las notificaciones del usuario autenticado
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id; // Del middleware verifyToken

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50); // Límite de las últimas 50 notificaciones

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error al obtener notificaciones' });
    }
};

// Marcar una notificación específica como leída
exports.markAsRead = async (req, res) => {
    const { id } = req.params;
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', id)
            .eq('user_id', userId) // Asegurar que le pertenece al usuario
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error al actualizar la notificación' });
    }
};

// Marcar todas las notificaciones del usuario como leídas
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', userId)
            .eq('read', false)
            .select();

        if (error) throw error;

        res.json({ message: 'Todas las notificaciones marcadas como leídas', count: data.length });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ message: 'Error al actualizar las notificaciones' });
    }
};
