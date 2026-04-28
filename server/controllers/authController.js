const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabaseClient');

exports.getUserData = async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, role, sucursal_id, permissions, active_count_id, sucursales(name)')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;
        res.json({ ...user, sucursal_name: user.sucursales?.name || null, sucursales: undefined });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateActiveCount = async (req, res) => {
    const { countId } = req.body;
    try {
        const { error } = await supabase
            .from('users')
            .update({ active_count_id: countId })
            .eq('id', req.user.id);

        if (error) throw error;
        res.json({ success: true, active_count_id: countId });
    } catch (error) {
        console.error('Error updating active count:', error);
        res.status(500).json({ message: 'Error al actualizar el conteo activo' });
    }
};

exports.register = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        // Check if user exists
        const { data: existingUser, error: searchError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate Session ID
        const sessionId = uuidv4();

        // Create user
        const { data, error } = await supabase
            .from('users')
            .insert([
                {
                    username,
                    password: hashedPassword,
                    current_session_id: sessionId,
                    is_session_active: true,
                    role: 'user', // Default role
                    sucursal_id: req.body.sucursal_id || null
                }
            ])
            .select();

        if (error) throw error;

        // Generate Token
        const token = jwt.sign(
            { id: data[0].id, username: data[0].username, role: data[0].role, session_id: sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );

        res.status(201).json({ token, user: { id: data[0].id, username: data[0].username, role: data[0].role, sucursal_id: data[0].sucursal_id, sucursal_name: null } });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.login = async (req, res) => {
    const { username, password, force } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        // Check if user exists
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check for existing active session if not forcing
        if (!force && user.is_session_active && user.current_session_id) {
            // Check if session is stale (more than 5 minutes since last seen)
            const lastSeen = user.last_seen ? new Date(user.last_seen) : null;
            const now = new Date();
            const isStale = lastSeen && (now - lastSeen > 5 * 60 * 1000); // 5 minutes

            if (!isStale) {
                return res.status(409).json({
                    sessionActive: true,
                    message: 'Ya tienes una sesión activa en otro dispositivo. ¿Deseas cerrarla e iniciar aquí?'
                });
            }
            console.log(`Session for user ${username} is stale (${lastSeen}). Overwriting.`);
        }

        // Generate New Session ID
        const sessionId = uuidv4();

        // Update user with new session ID and reset last_seen
        const { error: updateError } = await supabase
            .from('users')
            .update({
                current_session_id: sessionId,
                is_session_active: true,
                last_seen: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) throw updateError;

        // Generate Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, session_id: sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );

        // Get sucursal name if exists
        const { data: branchData } = user.sucursal_id ? await supabase.from('sucursales').select('name').eq('id', user.sucursal_id).single() : { data: null };

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                sucursal_id: user.sucursal_id, 
                sucursal_name: branchData ? branchData.name : null,
                permissions: user.permissions || [] 
            } 
        });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.logout = async (req, res) => {
    try {
        // Clear session ID in DB
        const { error } = await supabase
            .from('users')
            .update({ is_session_active: false })
            .eq('id', req.user.id);

        if (error) throw error;

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.heartbeat = async (req, res) => {
    try {
        await supabase
            .from('users')
            .update({ last_seen: new Date().toISOString(), is_session_active: true })
            .eq('id', req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
