const jwt = require('jsonwebtoken');
const supabase = require('../services/supabaseClient');

const verifyToken = async (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Verify session is still valid in DB
        const { data: user, error } = await supabase
            .from('users')
            .select('current_session_id, role, is_session_active, sucursal_id, permissions')
            .eq('id', decoded.id)
            .single();

        if (error || !user) {
            return res.status(401).json({ message: 'User not found' });
        }

        if (user.current_session_id !== decoded.session_id || !user.is_session_active) {
            return res.status(401).json({ message: 'Sesión iniciada en otro dispositivo o sesión expirada' });
        }

        req.user = { ...decoded, role: user.role, sucursal_id: user.sucursal_id, permissions: user.permissions || [] };
        next();
    } catch (e) {
        console.error('Token verification error:', e.message);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

const verifyAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin' || req.user.role === 'branch_admin')) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Admins only' });
    }
};

const verifySuperAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Superadmins only' });
    }
};

const hasPermission = (permission) => {
    return (req, res, next) => {
        if (req.user && (
            req.user.role === 'superadmin' ||
            req.user.role === 'admin' ||
            req.user.role === 'branch_admin' ||
            (req.user.permissions && req.user.permissions.includes(permission))
        )) {
            next();
        } else {
            res.status(403).json({ message: `Access denied: Missing permission '${permission}'` });
        }
    };
};

const verifyBranchAccess = (table) => {
    return async (req, res, next) => {
        const { id } = req.params;
        const { role, sucursal_id } = req.user;

        if (role === 'superadmin' || role === 'admin') {
            return next();
        }

        try {
            const { data, error } = await supabase
                .from(table)
                .select('sucursal_id')
                .eq('id', id)
                .single();

            if (error) {
                const errorMsg = error.message || '';
                if (errorMsg.includes('column') || error.code === '42703') {
                    console.warn(`[BRANCH ACCESS] Tabla '${table}' no tiene columna sucursal_id. Permitiendo acceso.`);
                    return next();
                }
                console.error(`[BRANCH ACCESS] Error consultando tabla '${table}':`, error.message);
                return res.status(404).json({ message: 'Recurso no encontrado' });
            }

            if (!data) {
                return res.status(404).json({ message: 'Recurso no encontrado' });
            }

            if (data.sucursal_id && data.sucursal_id !== sucursal_id) {
                const logData = {
                    actor_id: req.user.id,
                    action: 'UNAUTHORIZED_BRANCH_ACCESS',
                    details: {
                        table,
                        resource_id: id,
                        resource_branch_id: data.sucursal_id,
                        user_branch_id: sucursal_id,
                        url: req.originalUrl
                    },
                    ip_address: req.ip,
                    user_agent: req.get('user-agent')
                };

                console.warn(`[SECURITY VIOLATION] Usuario ${req.user.username} intentó acceder a recurso de otra sucursal.`, logData);

                supabase.from('security_logs').insert(logData).then(({ error }) => {
                    if (error) console.error('[AUDIT ERROR] No se pudo guardar log de seguridad:', error.message);
                });

                return res.status(403).json({ message: 'Acceso denegado: El recurso pertenece a otra sucursal' });
            }
            next();
        } catch (error) {
            console.error('Error verifying branch access:', error);
            res.status(500).json({ message: 'Error interno de seguridad' });
        }
    };
};

module.exports = {
    verifyToken,
    verifyAdmin,
    verifySuperAdmin,
    hasPermission,
    verifyBranchAccess
};
