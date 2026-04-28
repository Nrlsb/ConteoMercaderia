const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabaseClient');

exports.getAllUsers = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, role, is_session_active, last_seen, created_at, sucursal_id, permissions, sucursales(name)')
            .order('username');

        if (error) throw error;

        // Flatten sucursal name
        const users = data.map(u => ({
            ...u,
            sucursal_name: u.sucursales ? u.sucursales.name : 'N/A'
        }));

        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users' });
    }
};

exports.createUser = async (req, res) => {
    const { username, password, role, sucursal_id, permissions } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ message: 'Faltan datos requeridos (usuario, contraseña, rol)' });
    }

    try {
        // Check if user exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({ message: 'El nombre de usuario ya existe' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate Session ID
        const sessionId = uuidv4();

        const newUser = {
            username,
            password: hashedPassword,
            role,
            sucursal_id: sucursal_id || null,
            permissions: permissions || [],
            current_session_id: sessionId,
            is_session_active: false
        };

        const { data, error } = await supabase
            .from('users')
            .insert([newUser])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ message: 'Usuario creado exitosamente', user: data });

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ message: 'Error al crear usuario' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { role, sucursal_id, password, permissions } = req.body;
    const requesterRole = req.user.role;

    try {
        // Prevent admins from modifying superadmins or creating/promoting to superadmin
        if (requesterRole !== 'superadmin') {
            // Check if target user is superadmin
            const { data: targetUser } = await supabase.from('users').select('role').eq('id', id).single();
            if (targetUser && targetUser.role === 'superadmin') {
                return res.status(403).json({ message: 'No tienes permiso para modificar a un Superadmin' });
            }
            // Check if trying to promote to superadmin
            if (role === 'superadmin') {
                return res.status(403).json({ message: 'No tienes permiso para asignar el rol de Superadmin' });
            }
        }

        const updates = {};
        if (role) updates.role = role;
        if (sucursal_id !== undefined) updates.sucursal_id = sucursal_id; // Allow null to clear
        if (permissions !== undefined) updates.permissions = permissions; // Allow empty array
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updates.password = await bcrypt.hash(password, salt);
        }

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Log security action
        const logData = {
            actor_id: req.user.id,
            target_user_id: id,
            action: 'USER_UPDATE',
            details: {
                changed_fields: Object.keys(updates),
                new_role: updates.role || undefined,
                new_sucursal: updates.sucursal_id || undefined,
                permissions_changed: updates.permissions !== undefined
            },
            ip_address: req.ip,
            user_agent: req.get('user-agent')
        };
        supabase.from('security_logs').insert(logData).then(({ error }) => {
            if (error) console.error('[AUDIT ERROR] No se pudo guardar log de actualización de usuario:', error.message);
        });

        res.json({ message: 'User updated', user: { id: data.id, username: data.username, role: data.role, sucursal_id: data.sucursal_id } });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Error updating user' });
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'User deleted' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Error withdrawing user' });
    }
};
