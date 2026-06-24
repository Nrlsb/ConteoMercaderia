const supabase = require('../services/supabaseClient');
const pdf = require('pdf-parse');
const firebase = require('../services/firebase');

// Función helper para formatear fechas a DD/MM/YYYY
function formatLocalDate(dateStr) {
    if (!dateStr) return '-';
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (regex.test(dateStr)) {
        const parts = dateStr.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function validateNroPedidoVenta(nro) {
    if (nro === undefined || nro === null) return { isValid: false, cleanVal: '' };
    const cleanVal = String(nro).trim();
    if (cleanVal === '') return { isValid: false, cleanVal: '' };
    const isSixDigits = /^\d{6}$/.test(cleanVal);
    const isPA = cleanVal.toUpperCase() === 'PA';
    if (!isSixDigits && !isPA) {
        return { isValid: false, cleanVal };
    }
    return { isValid: true, cleanVal: cleanVal.toUpperCase() };
}

function validateNroPedidoCompra(nro) {
    if (nro === undefined || nro === null) return { isValid: false, cleanVal: '' };
    const cleanVal = String(nro).trim();
    if (cleanVal === '') return { isValid: false, cleanVal: '' };
    const isSixDigits = /^\d{6}$/.test(cleanVal);
    if (!isSixDigits) {
        return { isValid: false, cleanVal };
    }
    return { isValid: true, cleanVal };
}

function hasImagenes(pedido) {
    if (!pedido.imagenes) return false;
    if (Array.isArray(pedido.imagenes)) {
        return pedido.imagenes.length > 0;
    }
    try {
        const parsed = typeof pedido.imagenes === 'string' ? JSON.parse(pedido.imagenes) : pedido.imagenes;
        if (Array.isArray(parsed)) {
            return parsed.length > 0;
        }
    } catch (e) {}
    return !!pedido.imagenes;
}

async function canUserViewImages(reqUser) {
    if (!reqUser) return false;
    if (reqUser.role === 'superadmin') return true;
    if (!reqUser.sucursal_id) return false;
    try {
        const { data: sucursal } = await supabase
            .from('sucursales')
            .select('name')
            .eq('id', reqUser.sucursal_id)
            .single();
        if (sucursal && sucursal.name) {
            const nameLower = sucursal.name.toLowerCase();
            return nameLower === 'compras' || nameLower === 'gerencia';
        }
    } catch (err) {
        console.error('Error fetching sucursal in canUserViewImages:', err);
    }
    return false;
}

// Función helper para crear notificaciones asociadas al pedido de manera case-insensitive
async function createOrderNotifications(pedido, actorUsername, actionType) {
    try {
        const actorNormalized = actorUsername ? actorUsername.trim().toLowerCase() : '';
        const usernamesToNotify = new Set();

        const addIfValid = (username) => {
            if (username && typeof username === 'string') {
                const trimmed = username.trim();
                if (trimmed && trimmed.toLowerCase() !== actorNormalized) {
                    usernamesToNotify.add(trimmed);
                }
            }
        };

        // Obtener la sucursal del actor para aplicar restricciones de depósito
        let actorSucursalName = '';
        if (actorUsername) {
            try {
                const { data: actorUser } = await supabase
                    .from('users')
                    .select('id, sucursal_id')
                    .ilike('username', actorUsername.trim())
                    .single();
                if (actorUser && actorUser.sucursal_id) {
                    const { data: sucursal } = await supabase
                        .from('sucursales')
                        .select('name')
                        .eq('id', actorUser.sucursal_id)
                        .single();
                    if (sucursal && sucursal.name) {
                        actorSucursalName = sucursal.name.toLowerCase();
                    }
                }
            } catch (err) {
                console.error('Error fetching actor sucursal in createOrderNotifications:', err);
            }
        }

        // Obtener configuración de notificaciones
        let notifyUserOnSi = '';
        let notifyUserOnNo = '';
        let notifyUserOnConfirmDate = '';
        try {
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'seguimiento_pedidos_notifications')
                .single();

            if (settingsData && settingsData.value) {
                notifyUserOnSi = settingsData.value.notifyUserOnSi || '';
                notifyUserOnNo = settingsData.value.notifyUserOnNo || '';
                notifyUserOnConfirmDate = settingsData.value.notifyUserOnConfirmDate || '';
            }
        } catch (settingsErr) {
            console.error('Error fetching settings in notifications:', settingsErr);
        }

        if (actorSucursalName === 'deposito') {
            // Si el actor es de la sucursal depósito, la notificación sólo le llega al destinatario ('para_quien')
            addIfValid(pedido.para_quien);
            // Si el usuario de depósito confirma la fecha de entrega o la fecha pendiente, notificar al configurado
            if (actionType === 'confirm_date' || actionType === 'confirm_date_pendiente') {
                addIfValid(notifyUserOnConfirmDate);
            }
        } else {
            // Comportamiento normal para otros usuarios
            addIfValid(pedido.quien_solicita);
            addIfValid(pedido.para_quien);
            addIfValid(pedido.contacto_mercurio);

            const isOrderPaid = pedido.estado?.toLowerCase() === 'abonado' || hasImagenes(pedido);
            if (pedido.abonado === true && !isOrderPaid) {
                addIfValid(notifyUserOnSi);
            } else if (pedido.abonado === false) {
                addIfValid(notifyUserOnNo);
            }

            // Si por alguna razón otro rol (como superadmin) confirma la fecha, también notificar
            if (actionType === 'confirm_date' || actionType === 'confirm_date_pendiente') {
                addIfValid(notifyUserOnConfirmDate);
            }
        }

        // Exclusión adicional si el estado es 'Abonado' o si el pedido no requiere ser abonado y el usuario destinatario es de la sucursal gerencia:
        if (pedido.estado?.toLowerCase() === 'abonado' || pedido.abonado !== true) {
            try {
                const { data: sucursalGerencia } = await supabase
                    .from('sucursales')
                    .select('id')
                    .ilike('name', 'gerencia')
                    .single();
                if (sucursalGerencia) {
                    const { data: gerenciaUsers } = await supabase
                        .from('users')
                        .select('username')
                        .eq('sucursal_id', sucursalGerencia.id);
                    if (gerenciaUsers && gerenciaUsers.length > 0) {
                        gerenciaUsers.forEach(gu => {
                            if (gu.username) {
                                usernamesToNotify.delete(gu.username.trim());
                            }
                        });
                    }
                }
            } catch (gerenciaErr) {
                console.error('Error filtering gerencia users from notifications:', gerenciaErr);
            }
        }

        if (usernamesToNotify.size === 0) return;

        // Buscar los user_ids de estos usernames de forma insensible a mayúsculas/minúsculas usando ilike en un filtro OR
        const orFilter = Array.from(usernamesToNotify)
            .map(username => `username.ilike.${username}`)
            .join(',');

        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, username')
            .or(orFilter);

        if (usersError) {
            console.error('Error fetching users for order notifications:', usersError);
            return;
        }

        if (!users || users.length === 0) return;

        const notifications = users.map(user => {
            let title = '';
            let message = '';
            const productoDesc = pedido.descripcion_capacidad || 'Producto sin especificar';
            const proveedor = pedido.proveedor_marca || 'Proveedor';
            const fechaStr = pedido.contacto_proveedor_fecha ? formatLocalDate(pedido.contacto_proveedor_fecha) : '';
            let notifType = 'pedido_modificado';

            const abonadoStr = '';

            if (actionType === 'create') {
                notifType = 'pedido_creado';
                if (pedido.contacto_proveedor_fecha) {
                    title = 'Pedido con fecha de ingreso';
                    message = `El usuario ${actorUsername} registró un nuevo pedido de ${proveedor} (${productoDesc})${abonadoStr} con fecha de ingreso programada para el ${fechaStr}.`;
                } else {
                    title = 'Nuevo pedido registrado';
                    message = `El usuario ${actorUsername} registró un nuevo pedido para ${pedido.para_quien || 'Deposito'}: ${productoDesc} (${proveedor})${abonadoStr}.`;
                }
            } else if (actionType === 'set_date') {
                notifType = 'pedido_fecha_ingreso';
                title = 'Pedido con fecha de ingreso';
                message = `El pedido de ${proveedor} (${productoDesc}) ya tiene fecha de ingreso programada para el ${fechaStr} (cargado por ${actorUsername})${abonadoStr}.`;
            } else if (actionType === 'confirm_date') {
                notifType = 'pedido_fecha_confirmada';
                title = 'Fecha de pedido confirmada';
                const pedidoVentaStr = pedido.nro_pedido_venta ? ` (Pedido de Venta: ${pedido.nro_pedido_venta})` : '';
                const tipoEntrega = pedido.contacto_proveedor_entrega === 'Parcial' ? 'parcial' : 'total';
                message = `El usuario ${actorUsername} confirmó la fecha de ingreso (${fechaStr}) para la entrega ${tipoEntrega} del producto ${productoDesc} de ${proveedor}${pedidoVentaStr}.`;
            } else if (actionType === 'set_date_pendiente') {
                notifType = 'pedido_fecha_pendiente';
                title = 'Fecha de entrega pendiente asignada';
                const fechaPendienteStr = pedido.contacto_proveedor_fecha_pendiente ? formatLocalDate(pedido.contacto_proveedor_fecha_pendiente) : '';
                message = `El pedido de ${proveedor} (${productoDesc}) tiene una fecha de entrega pendiente programada para el ${fechaPendienteStr} (cargado por ${actorUsername}).`;
            } else if (actionType === 'confirm_date_pendiente') {
                notifType = 'pedido_fecha_pendiente_confirmada';
                title = 'Fecha pendiente de entrega confirmada';
                const fechaPendienteStr = pedido.contacto_proveedor_fecha_pendiente ? formatLocalDate(pedido.contacto_proveedor_fecha_pendiente) : '';
                const pedidoVentaStr = pedido.nro_pedido_venta ? ` (Pedido de Venta: ${pedido.nro_pedido_venta})` : '';
                message = `El usuario ${actorUsername} confirmó la fecha de entrega pendiente (${fechaPendienteStr}) para el resto (entrega parcial pendiente) del producto ${productoDesc} de ${proveedor}${pedidoVentaStr}.`;
            } else if (actionType === 'change_abonado') {
                notifType = 'pedido_abonado_cambiado';
                title = 'Estado de pago actualizado';
                message = `El pedido de ${proveedor} (${productoDesc}) fue marcado como ${pedido.abonado ? 'ABONADO' : 'NO ABONADO'} por ${actorUsername}.`;
            } else {
                title = 'Pedido actualizado';
                message = `El pedido de ${proveedor} (${productoDesc}) fue actualizado por ${actorUsername}. Estado: ${pedido.estado || 'Pendiente'}${abonadoStr}.`;
            }

            return {
                user_id: user.id,
                title,
                message,
                type: notifType,
                pedido_id: pedido.id,
                read: false
            };
        });

        // 1. Guardar notificaciones en base de datos para que aparezcan en la campanita
        const { error: insertError } = await supabase
            .from('notifications')
            .insert(notifications);

        if (insertError) {
            console.error('Error inserting order notifications:', insertError);
        }

        // 2. Enviar notificaciones push mediante Firebase Cloud Messaging
        const userIds = users.map(u => u.id);
        const { data: tokenRecords, error: tokenError } = await supabase
            .from('user_fcm_tokens')
            .select('token')
            .in('user_id', userIds);

        if (tokenError) {
            console.error('Error fetching FCM tokens for push notification:', tokenError);
            return;
        }

        if (tokenRecords && tokenRecords.length > 0) {
            const tokens = tokenRecords.map(t => t.token);
            
            // Usar título y mensaje genérico de la acción
            const sampleNotif = notifications[0];
            
            console.log(`[PUSH] Enviando notificación push a ${tokens.length} dispositivos para los usuarios: ${Array.from(usernamesToNotify).join(', ')}`);
            const pushResult = await firebase.sendPushNotification(
                tokens,
                sampleNotif.title,
                sampleNotif.message,
                {
                    pedido_id: pedido.id ? String(pedido.id) : '',
                    type: String(sampleNotif.type)
                }
            );

            // Limpiar de la BD los tokens obsoletos o inválidos reportados por Firebase
            if (pushResult.success && pushResult.invalidTokens && pushResult.invalidTokens.length > 0) {
                console.log(`[PUSH] Limpiando ${pushResult.invalidTokens.length} tokens obsoletos de la base de datos`);
                await supabase
                    .from('user_fcm_tokens')
                    .delete()
                    .in('token', pushResult.invalidTokens);
            }
        }
    } catch (err) {
        console.error('Error in createOrderNotifications:', err);
    }
}


exports.getAllPedidos = async (req, res) => {
    try {
        let query = supabase
            .from('seguimiento_pedidos')
            .select('*');

        // Obtener la configuración de notificaciones al inicio
        let notifyUserOnSi = '';
        let notifyUserOnNo = '';
        let notifyUserOnConfirmDate = '';
        try {
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'seguimiento_pedidos_notifications')
                .single();

            if (settingsData && settingsData.value) {
                notifyUserOnSi = settingsData.value.notifyUserOnSi || '';
                notifyUserOnNo = settingsData.value.notifyUserOnNo || '';
                notifyUserOnConfirmDate = settingsData.value.notifyUserOnConfirmDate || '';
            }
        } catch (settingsErr) {
            console.error('Error fetching settings in getAllPedidos:', settingsErr);
        }

        const username = req.user.username;
        const isUserConfiguredAsConfirmDate = notifyUserOnConfirmDate && username && notifyUserOnConfirmDate.trim().toLowerCase() === username.trim().toLowerCase();

        const hasManagePermission = 
            (req.user.role === 'superadmin' ||
            (req.user.permissions && req.user.permissions.includes('manage_seguimiento_pedidos'))) && !isUserConfiguredAsConfirmDate;

        if (!hasManagePermission) {
            if (isUserConfiguredAsConfirmDate) {
                // Si el usuario actual es el configurado para confirmaciones de fecha, restringir a que solo vea los pedidos cuya fecha esté confirmada (de todo el sistema)
                query = query.eq('fecha_confirmada', true);
            } else {
                let filter = `quien_solicita.ilike.${username},para_quien.ilike.${username},contacto_mercurio.ilike.${username}`;
                
                if (req.user.sucursal_id) {
                    const { data: sucursal } = await supabase
                        .from('sucursales')
                        .select('name')
                        .eq('id', req.user.sucursal_id)
                        .single();
                    if (sucursal && sucursal.name) {
                        const sName = sucursal.name;
                        filter += `,quien_solicita.ilike.${sName},para_quien.ilike.${sName}`;
                    }
                }

                query = query.or(filter);
            }
        }

        let { data, error } = await query
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Configuración de notificaciones ya leída al inicio

        // Obtener la sucursal del usuario que realiza la consulta
        let userSucursalName = '';
        if (req.user.sucursal_id) {
            try {
                const { data: sucursal } = await supabase
                    .from('sucursales')
                    .select('name')
                    .eq('id', req.user.sucursal_id)
                    .single();
                if (sucursal && sucursal.name) {
                    userSucursalName = sucursal.name.toLowerCase();
                }
            } catch (sucErr) {
                console.error('Error fetching sucursal in getAllPedidos:', sucErr);
            }
        }

        const isUserConfiguredAsNo = notifyUserOnNo && req.user?.username && notifyUserOnNo.trim().toLowerCase() === req.user.username.trim().toLowerCase();
        const isDeposito = userSucursalName === 'deposito';

        if (data && (isUserConfiguredAsNo || isDeposito) && req.user.role !== 'superadmin') {
            data = data.filter(p => {
                if (p.abonado === true) {
                    // Si el usuario actual es el destinatario (para_quien), no se oculta el pedido
                    if (p.para_quien && req.user?.username && p.para_quien.trim().toLowerCase() === req.user.username.trim().toLowerCase()) {
                        return true;
                    }
                    return hasImagenes(p);
                }
                return true;
            });
        }

        // Si el usuario pertenece a la sucursal gerencia, sólo deben llegarle los pedidos que requieran ser abonados (SÍ)
        if (data && userSucursalName === 'gerencia' && req.user.role !== 'superadmin') {
            data = data.filter(p => p.abonado === true);
        }

        const canView = await canUserViewImages(req.user);
        if (!canView && data) {
            data = data.map(p => ({
                ...p,
                imagenes: []
            }));
        }

        res.json(data);
    } catch (error) {
        console.error('Error fetching pedidos:', error);
        res.status(500).json({ message: 'Error al obtener pedidos' });
    }
};

exports.createPedido = async (req, res) => {
    try {
        let userSucursalName = '';
        if (req.user.sucursal_id) {
            const { data: sucursal } = await supabase
                .from('sucursales')
                .select('name')
                .eq('id', req.user.sucursal_id)
                .single();
            if (sucursal && sucursal.name) {
                userSucursalName = sucursal.name.toLowerCase();
            }
        }
        const isCompras = userSucursalName === 'compras' || req.user.role === 'superadmin';
        const isStrictDeposito = userSucursalName === 'deposito';

        if (!isCompras) {
            return res.status(403).json({ message: 'Sólo los usuarios de la sucursal Compras pueden registrar nuevos pedidos' });
        }

        if (!isStrictDeposito) {
            req.body.transp_mercurio = false;
            req.body.otro_transporte = false;
        }

        const validationVenta = validateNroPedidoVenta(req.body.nro_pedido_venta);
        if (!validationVenta.isValid) {
            return res.status(400).json({ message: 'El N° de pedido de venta debe tener exactamente 6 números, o si contiene letras, debe ser únicamente "PA"' });
        }
        req.body.nro_pedido_venta = validationVenta.cleanVal;

        const validationCompra = validateNroPedidoCompra(req.body.nro_pedido);
        if (!validationCompra.isValid) {
            return res.status(400).json({ message: 'El N° de pedido de compra debe tener exactamente 6 números' });
        }
        req.body.nro_pedido = validationCompra.cleanVal;
        req.body.quien_solicita = req.user?.username || '';

        if (req.body.contacto_proveedor_fecha) {
            req.body.contacto_proveedor_fecha_original = req.body.contacto_proveedor_fecha;
            req.body.fecha_coordinacion = new Date().toISOString();
        }

        if (req.body.abonado === true || req.body.estado?.toLowerCase() === 'abonado') {
            req.body.fecha_abonado = new Date().toISOString();
        }
        if (req.body.contacto_proveedor_fecha_pendiente) {
            req.body.fecha_coordinacion_pendiente = new Date().toISOString();
        }
        if (req.body.fecha_confirmada === true) {
            req.body.fecha_confirmacion_deposito = new Date().toISOString();
        }
        if (req.body.fecha_pendiente_confirmada === true) {
            req.body.fecha_pendiente_confirmacion_deposito = new Date().toISOString();
        }
        const receivedStates = ['recepción parcial', 'recepción total', 'recibido'];
        if (req.body.estado && receivedStates.includes(req.body.estado.toLowerCase())) {
            req.body.fecha_ingreso_deposito = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('seguimiento_pedidos')
            .insert([req.body])
            .select()
            .single();

        if (error) throw error;

        // Crear notificaciones en segundo plano
        createOrderNotifications(data, req.user?.username || 'Sistema', 'create');

        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating pedido:', error);
        res.status(500).json({ message: 'Error al crear el pedido' });
    }
};

exports.updatePedido = async (req, res) => {
    const { id } = req.params;
    try {
        let userSucursalName = '';
        if (req.user.sucursal_id) {
            const { data: sucursal } = await supabase
                .from('sucursales')
                .select('name')
                .eq('id', req.user.sucursal_id)
                .single();
            if (sucursal && sucursal.name) {
                userSucursalName = sucursal.name.toLowerCase();
            }
        }
        const isCompras = userSucursalName === 'compras' || req.user.role === 'superadmin';
        const isDeposito = userSucursalName === 'deposito' || req.user.role === 'superadmin';

        if (req.body.nro_pedido_venta !== undefined) {
            const validation = validateNroPedidoVenta(req.body.nro_pedido_venta);
            if (!validation.isValid) {
                return res.status(400).json({ message: 'El N° de pedido de venta debe tener exactamente 6 números, o si contiene letras, debe ser únicamente "PA"' });
            }
            req.body.nro_pedido_venta = validation.cleanVal;
        }

        if (req.body.nro_pedido !== undefined) {
            const validation = validateNroPedidoCompra(req.body.nro_pedido);
            if (!validation.isValid) {
                return res.status(400).json({ message: 'El N° de pedido de compra debe tener exactamente 6 números' });
            }
            req.body.nro_pedido = validation.cleanVal;
        }

        // Consultar el pedido actual
        const { data: currentPedido } = await supabase
            .from('seguimiento_pedidos')
            .select('*')
            .eq('id', id)
            .single();

        if (currentPedido) {
            delete req.body.quien_solicita;

            // Validar que la confirmación de fecha sólo se permita hasta 3 días hábiles antes
            if (req.body.fecha_confirmada === true) {
                const fechaEntrega = req.body.contacto_proveedor_fecha || currentPedido.contacto_proveedor_fecha;
                if (fechaEntrega) {
                    const workingDays = getWorkingDaysRemaining(fechaEntrega);
                    if (workingDays > 3) {
                        return res.status(400).json({ 
                            message: `No se puede confirmar la fecha todavía. Sólo se permite confirmar hasta 3 días hábiles antes (faltan ${workingDays} días hábiles).` 
                        });
                    }
                } else {
                    return res.status(400).json({ message: 'Debe ingresar una fecha de entrega antes de poder confirmarla.' });
                }
            }

            // Validar que la confirmación de fecha pendiente sólo se permita hasta 3 días hábiles antes
            if (req.body.fecha_pendiente_confirmada === true) {
                const fechaPendiente = req.body.contacto_proveedor_fecha_pendiente || currentPedido.contacto_proveedor_fecha_pendiente;
                if (fechaPendiente) {
                    const workingDays = getWorkingDaysRemaining(fechaPendiente);
                    if (workingDays > 3) {
                        return res.status(400).json({ 
                            message: `No se puede confirmar la fecha pendiente todavía. Sólo se permite confirmar hasta 3 días hábiles antes (faltan ${workingDays} días hábiles).` 
                        });
                    }
                } else {
                    return res.status(400).json({ message: 'Debe ingresar una fecha de entrega pendiente antes de poder confirmarla.' });
                }
            }

            // Si el usuario es de Gerencia y el pedido tiene comprobante cargado, pasa automáticamente a estado 'Abonado'
            if (userSucursalName === 'gerencia') {
                const hasImgs = hasImagenes(currentPedido) || hasImagenes(req.body);
                if (hasImgs) {
                    req.body.estado = 'Abonado';
                }
            }

            // Si se está actualizando la fecha del proveedor, manejamos la fecha original
            if (req.body.contacto_proveedor_fecha) {
                if (!currentPedido.contacto_proveedor_fecha_original) {
                    // Si no tiene fecha original, la definimos con esta misma
                    req.body.contacto_proveedor_fecha_original = req.body.contacto_proveedor_fecha;
                } else {
                    // Si ya tenía original, forzamos a mantener la que ya estaba guardada
                    req.body.contacto_proveedor_fecha_original = currentPedido.contacto_proveedor_fecha_original;
                }
            }
        }

        if (!isCompras && currentPedido) {
            const comprasFields = [
                'quien_solicita', 'para_quien', 'nro_pedido_venta',
                'proveedor_marca', 'nro_pedido', 'abonado',
                'codigo_mercurio', 'descripcion_capacidad', 'cant_pedido',
                'prev_entrada', 'nro_pedido_compra', 'fecha'
            ];
            
            const attemptedChanges = [];
            for (const field of comprasFields) {
                if (req.body[field] !== undefined) {
                    const valNew = req.body[field] === null || req.body[field] === undefined ? '' : String(req.body[field]).trim();
                    const valOld = currentPedido[field] === null || currentPedido[field] === undefined ? '' : String(currentPedido[field]).trim();
                    if (valNew !== valOld) {
                        attemptedChanges.push(field);
                    }
                }
            }

            if (attemptedChanges.length > 0) {
                return res.status(403).json({ message: 'No tienes permisos para modificar campos de Destinatario, Proveedor o Producto (sólo sucursal Compras)' });
            }
        }

        if (!isDeposito && currentPedido) {
            const depositoFields = [
                'contacto_mercurio', 'contacto_mercurio_fecha',
                'contacto_proveedor', 'contacto_proveedor_fecha', 'fecha_confirmada',
                'estado', 'cant_recepcion_parcial', 'recepcion_parcial',
                'contacto_proveedor_fecha_original', 'contacto_proveedor_observaciones', 'contacto_proveedor_entrega',
                'contacto_proveedor_fecha_pendiente', 'contacto_proveedor_cant_parcial', 'fecha_pendiente_confirmada',
                'entrega_resto_pendiente', 'contacto_proveedor_cant_pendiente'
            ];

            const attemptedChanges = [];
            for (const field of depositoFields) {
                if (req.body[field] !== undefined) {
                    const valNew = req.body[field] === null || req.body[field] === undefined ? '' : String(req.body[field]).trim();
                    const valOld = currentPedido[field] === null || currentPedido[field] === undefined ? '' : String(currentPedido[field]).trim();
                    if (valNew !== valOld) {
                        // Permitir a Gerencia cambiar el estado a 'Abonado'
                        const isGerenciaTransitionToAbonado = 
                            userSucursalName === 'gerencia' && 
                            field === 'estado' && 
                            valNew.toLowerCase() === 'abonado';

                        if (!isGerenciaTransitionToAbonado) {
                            attemptedChanges.push(field);
                        }
                    }
                }
            }

            if (attemptedChanges.length > 0) {
                return res.status(403).json({ message: 'No tienes permisos para modificar campos de Contacto o Estado (sólo sucursal Depósito)' });
            }
        }

        // Validación de campos de confirmación del destinatario (solo para_quien o superadmin)
        if (currentPedido) {
            const destinatarioFields = [
                'confirmado_destinatario', 'fecha_confirmacion_destinatario',
                'cant_recibida_destinatario', 'comentario_destinatario'
            ];
            const attemptedDestinatarioChanges = [];
            for (const field of destinatarioFields) {
                if (req.body[field] !== undefined) {
                    const valNew = req.body[field] === null || req.body[field] === undefined ? '' : String(req.body[field]).trim();
                    const valOld = currentPedido[field] === null || currentPedido[field] === undefined ? '' : String(currentPedido[field]).trim();
                    if (valNew !== valOld) {
                        attemptedDestinatarioChanges.push(field);
                    }
                }
            }

            if (attemptedDestinatarioChanges.length > 0) {
                const isDestinatario = (req.user.username && currentPedido.para_quien && req.user.username.trim().toLowerCase() === currentPedido.para_quien.trim().toLowerCase()) || req.user.role === 'superadmin';
                if (!isDestinatario) {
                    return res.status(403).json({ message: 'No tienes permisos para confirmar la recepción de este pedido (requiere ser el destinatario del campo "Para quién")' });
                }
            }
        }

        // Validación estricta para campos de transporte (sólo sucursal Depósito)
        const isStrictDeposito = userSucursalName === 'deposito';
        if (!isStrictDeposito && currentPedido) {
            const transportFields = ['transp_mercurio', 'otro_transporte'];
            const attemptedChanges = [];
            for (const field of transportFields) {
                if (req.body[field] !== undefined) {
                    const valNew = req.body[field] === null || req.body[field] === undefined ? '' : String(req.body[field]).trim();
                    const valOld = currentPedido[field] === null || currentPedido[field] === undefined ? '' : String(currentPedido[field]).trim();
                    if (valNew !== valOld) {
                        attemptedChanges.push(field);
                    }
                }
            }

            if (attemptedChanges.length > 0) {
                return res.status(403).json({ message: 'No tienes permisos para modificar campos de Transporte (requiere estrictamente pertenecer a la sucursal Depósito)' });
            }
        }

        if (isDeposito && currentPedido) {
            const depModFields = [
                'contacto_proveedor', 'contacto_proveedor_fecha', 'fecha_confirmada',
                'estado', 'cant_recepcion_parcial', 'recepcion_parcial',
                'contacto_proveedor_observaciones', 'contacto_proveedor_entrega',
                'contacto_proveedor_fecha_pendiente', 'contacto_proveedor_cant_parcial', 'fecha_pendiente_confirmada',
                'entrega_resto_pendiente', 'contacto_proveedor_cant_pendiente'
            ];

            let modifiedField = false;
            for (const field of depModFields) {
                if (req.body[field] !== undefined) {
                    const valNew = req.body[field] === null || req.body[field] === undefined ? '' : String(req.body[field]).trim();
                    const valOld = currentPedido[field] === null || currentPedido[field] === undefined ? '' : String(currentPedido[field]).trim();
                    if (valNew !== valOld) {
                        modifiedField = true;
                        break;
                    }
                }
            }

            if (modifiedField) {
                req.body.contacto_mercurio = req.user?.username || '';
                req.body.contacto_mercurio_fecha = new Date().toISOString();
            }
        }

        let actionType = 'update';

        if (currentPedido) {
            // 1. Coordinacion
            if (req.body.contacto_proveedor_fecha !== undefined && req.body.contacto_proveedor_fecha !== currentPedido.contacto_proveedor_fecha) {
                if (req.body.contacto_proveedor_fecha) {
                    req.body.fecha_coordinacion = new Date().toISOString();
                } else {
                    req.body.fecha_coordinacion = null;
                }
            }

            // 2. Coordinacion pendiente
            if (req.body.contacto_proveedor_fecha_pendiente !== undefined && req.body.contacto_proveedor_fecha_pendiente !== currentPedido.contacto_proveedor_fecha_pendiente) {
                if (req.body.contacto_proveedor_fecha_pendiente) {
                    req.body.fecha_coordinacion_pendiente = new Date().toISOString();
                } else {
                    req.body.fecha_coordinacion_pendiente = null;
                }
            }

            // 3. Confirmacion deposito (1ª entrega)
            if (req.body.fecha_confirmada !== undefined && req.body.fecha_confirmada !== currentPedido.fecha_confirmada) {
                if (req.body.fecha_confirmada) {
                    req.body.fecha_confirmacion_deposito = new Date().toISOString();
                } else {
                    req.body.fecha_confirmacion_deposito = null;
                }
            }

            // 4. Confirmacion deposito pendiente (2ª entrega)
            if (req.body.fecha_pendiente_confirmada !== undefined && req.body.fecha_pendiente_confirmada !== currentPedido.fecha_pendiente_confirmada) {
                if (req.body.fecha_pendiente_confirmada) {
                    req.body.fecha_pendiente_confirmacion_deposito = new Date().toISOString();
                } else {
                    req.body.fecha_pendiente_confirmacion_deposito = null;
                }
            }

            // 5. Abonado
            const isAbonadoNow = (req.body.abonado === true && currentPedido.abonado !== true) ||
                                 (req.body.estado && req.body.estado.toLowerCase() === 'abonado' && currentPedido.estado?.toLowerCase() !== 'abonado');
            if (isAbonadoNow) {
                req.body.fecha_abonado = new Date().toISOString();
            } else {
                const isNotAbonadoNow = (req.body.abonado === false && currentPedido.abonado === true) ||
                                        (req.body.estado && req.body.estado.toLowerCase() !== 'abonado' && currentPedido.estado?.toLowerCase() === 'abonado');
                if (isNotAbonadoNow) {
                    const finalAbonado = req.body.abonado !== undefined ? req.body.abonado : currentPedido.abonado;
                    const finalEstado = req.body.estado !== undefined ? req.body.estado : currentPedido.estado;
                    if (finalAbonado !== true && finalEstado?.toLowerCase() !== 'abonado') {
                        req.body.fecha_abonado = null;
                    }
                }
            }

            // 6. Ingreso deposito
            const receivedStates = ['recepción parcial', 'recepción total', 'recibido'];
            const isReceivedNow = req.body.estado &&
                                  receivedStates.includes(req.body.estado.toLowerCase()) &&
                                  !receivedStates.includes(currentPedido.estado?.toLowerCase());
            if (isReceivedNow) {
                req.body.fecha_ingreso_deposito = new Date().toISOString();
            } else if (req.body.estado &&
                       !receivedStates.includes(req.body.estado.toLowerCase()) &&
                       receivedStates.includes(currentPedido.estado?.toLowerCase())) {
                req.body.fecha_ingreso_deposito = null;
            }

            const dateChanged = req.body.contacto_proveedor_fecha !== undefined && req.body.contacto_proveedor_fecha !== currentPedido.contacto_proveedor_fecha;
            const datePendienteChanged = req.body.contacto_proveedor_fecha_pendiente !== undefined && req.body.contacto_proveedor_fecha_pendiente !== currentPedido.contacto_proveedor_fecha_pendiente;
            const contactChanged = req.body.contacto_mercurio !== undefined && req.body.contacto_mercurio !== currentPedido.contacto_mercurio;
            const abonadoChanged = req.body.abonado !== undefined && req.body.abonado !== currentPedido.abonado;
            
            if (dateChanged || contactChanged) {
                req.body.notif_confirmacion_enviada = false;
            }

            if (datePendienteChanged) {
                req.body.fecha_pendiente_confirmada = false;
            }

            if (dateChanged) {
                // Si la fecha cambia, reseteamos la confirmación previa
                req.body.fecha_confirmada = false;
                // Si la nueva fecha no es vacía, notificamos que se cargó/cambió la fecha
                if (req.body.contacto_proveedor_fecha) {
                    actionType = 'set_date';
                }
            } else if (datePendienteChanged) {
                if (req.body.contacto_proveedor_fecha_pendiente) {
                    actionType = 'set_date_pendiente';
                }
            } else {
                // Si la fecha no cambió, verificamos si se confirmó justo ahora
                const confirmedChanged = req.body.fecha_confirmada === true && !currentPedido.fecha_confirmada;
                const confirmedPendienteChanged = req.body.fecha_pendiente_confirmada === true && !currentPedido.fecha_pendiente_confirmada;
                if (confirmedChanged) {
                    actionType = 'confirm_date';
                } else if (confirmedPendienteChanged) {
                    actionType = 'confirm_date_pendiente';
                } else if (abonadoChanged) {
                    actionType = 'change_abonado';
                }
            }
        }

        // Si el usuario no tiene permisos para ver imágenes, evitamos que pise las imágenes existentes en la DB
        const canViewImagesAllowed = await canUserViewImages(req.user);
        if (!canViewImagesAllowed) {
            delete req.body.imagenes;
        }

        const { data, error } = await supabase
            .from('seguimiento_pedidos')
            .update(req.body)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Si el estado del pedido pasó a 'Abonado', marcar como leídas las notificaciones para usuarios de Gerencia
        if (data && data.estado?.toLowerCase() === 'abonado') {
            try {
                const { data: sucursalGerencia } = await supabase
                    .from('sucursales')
                    .select('id')
                    .ilike('name', 'gerencia')
                    .single();
                if (sucursalGerencia) {
                    const { data: gerenciaUsers } = await supabase
                        .from('users')
                        .select('id')
                        .eq('sucursal_id', sucursalGerencia.id);
                    if (gerenciaUsers && gerenciaUsers.length > 0) {
                        const gerenciaUserIds = gerenciaUsers.map(u => u.id);
                        await supabase
                            .from('notifications')
                            .update({ read: true })
                            .eq('pedido_id', data.id)
                            .in('user_id', gerenciaUserIds);
                    }
                }
            } catch (err) {
                console.error('Error marking gerencia notifications as read:', err);
            }
        }

        // Crear notificaciones en segundo plano con el tipo correspondiente
        createOrderNotifications(data, req.user?.username || 'Sistema', actionType);

        const canView = await canUserViewImages(req.user);
        if (!canView && data) {
            data.imagenes = [];
        }

        res.json(data);
    } catch (error) {
        console.error('Error updating pedido:', error);
        res.status(500).json({ message: 'Error al actualizar el pedido' });
    }
};


exports.deletePedido = async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('seguimiento_pedidos')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Pedido eliminado con éxito' });
    } catch (error) {
        console.error('Error deleting pedido:', error);
        res.status(500).json({ message: 'Error al eliminar el pedido' });
    }
};

// Importar desde PDF
exports.importPedidosPdf = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No se ha subido ningún archivo PDF' });
    }

    try {
        const dataBuffer = req.file.buffer;
        
        // Custom page rendering to preserve horizontal spaces (similar to receipts/remitos parser)
        function render_page(pageData) {
            let render_options = {
                normalizeWhitespace: false,
                disableCombineTextItems: false
            };

            return pageData.getTextContent(render_options)
                .then(function (textContent) {
                    let lines = {};
                    for (let item of textContent.items) {
                        let y = Math.round(item.transform[5]);
                        let x = Math.round(item.transform[4]);
                        if (!lines[y]) lines[y] = [];
                        lines[y].push({ x, str: item.str, width: item.width || 0 });
                    }

                    let sortedY = Object.keys(lines).sort((a, b) => b - a);
                    let text = '';

                    let groups = [];
                    if (sortedY.length > 0) {
                        let currentGroup = [sortedY[0]];
                        for (let i = 1; i < sortedY.length; i++) {
                            if (Math.abs(sortedY[i] - sortedY[i - 1]) < 5) {
                                currentGroup.push(sortedY[i]);
                            } else {
                                groups.push(currentGroup);
                                currentGroup = [sortedY[i]];
                            }
                        }
                        groups.push(currentGroup);
                    }

                    for (let group of groups) {
                        let groupItems = [];
                        for (let y of group) {
                            groupItems = groupItems.concat(lines[y]);
                        }
                        groupItems.sort((a, b) => a.x - b.x);

                        let lineText = '';
                        let lastX = 0;
                        for (let item of groupItems) {
                            let distance = item.x - lastX;
                            let gap = distance > 1.5 ? Math.max(1, Math.floor(distance / 4.0)) : 0;
                            lineText += ' '.repeat(gap) + item.str;
                            lastX = item.x + (item.width || (item.str.length * 4.0));
                        }
                        text += lineText + '\n';
                    }
                    return text;
                });
        }

        const data = await pdf(dataBuffer, { pagerender: render_page });
        const lines = data.text.split('\n');
        
        const parsedItems = [];
        
        // Expresión para buscar líneas que empiecen con fecha (ej. 24/06/2025 o 1/07/2025 o 02/07/2025)
        const dateRegex = /^\s*(\d{1,2}\/\d{1,2}\/\d{4})/i;

        // Sucursales y destinatarios comunes
        const entities = ['Sucursal \\d+', 'Stock Mercurio', 'Compras', 'Diego Villata', 'Villata Diego', 'Fogar Ezequiel', 'Ramirez Jonatan', 'Dilucca Matias', 'Matias Dilucca'];
        const entityPattern = `(${entities.join('|')})`;

        // Proveedores comunes
        const providers = ['Saint Gobain', 'Enimar', 'Diproel', 'Tersuave', 'Elsener', 'Akzo Nobel', 'Burger', 'Pint. Rex', 'Pinturerias Rex', 'Zeocar', 'Alba', 'Sin Fin'];
        const providerPattern = `(${providers.join('|')})`;

        // Contactos comunes
        const contacts = ['Marisol', 'Cristofer', 'Damián', 'Damian', 'Alejandro', 'Jonatan', 'Martin', 'Sergio', 'Fabiana Luciano', 'Maxi Abruzzecce', 'M. Abruzzece', 'María Sol', 'Georgina', 'Denis'];
        const contactPattern = `(${contacts.join('|')})`;

        for (let line of lines) {
            const trimmed = line.trim();
            const dateMatch = trimmed.match(dateRegex);
            if (!dateMatch) continue;

            const dateStr = dateMatch[1];
            let remainingText = trimmed.replace(dateStr, '').trim();

            // Intentar extraer "Quién solicita" y "Para quién"
            let quien_solicita = '';
            let para_quien = '';

            // Intentar hacer match de dos entidades juntas
            const entityRegex = new RegExp(`^\\s*${entityPattern}\\s*${entityPattern}`, 'i');
            const entityMatch = remainingText.match(entityRegex);
            if (entityMatch) {
                quien_solicita = entityMatch[1];
                para_quien = entityMatch[2];
                remainingText = remainingText.replace(entityMatch[0], '').trim();
            } else {
                // Si solo hay una
                const singleEntityRegex = new RegExp(`^\\s*${entityPattern}`, 'i');
                const singleMatch = remainingText.match(singleEntityRegex);
                if (singleMatch) {
                    quien_solicita = singleMatch[1];
                    para_quien = singleMatch[1]; // fallback
                    remainingText = remainingText.replace(singleMatch[0], '').trim();
                }
            }

            // Proveedor
            let proveedor_marca = '';
            const providerRegex = new RegExp(`^\\s*${providerPattern}`, 'i');
            const providerMatch = remainingText.match(providerRegex);
            if (providerMatch) {
                proveedor_marca = providerMatch[1];
                remainingText = remainingText.replace(providerMatch[0], '').trim();
            }

            // Tildes booleanas: ej. xx o x al inicio del texto restante
            let urgencia = false;
            let rotacion = false;
            let transp_mercurio = false;
            let otro_transporte = false;

            const flagsMatch = remainingText.match(/^\s*(x{1,4}|-{1,4})/i);
            if (flagsMatch) {
                const flags = flagsMatch[1].toLowerCase();
                if (flags.includes('x')) {
                    // Si hay tildes, simplificamos:
                    urgencia = flags.length >= 1;
                    rotacion = flags.length >= 2;
                    transp_mercurio = flags.length >= 3;
                    otro_transporte = flags.length >= 4;
                }
                remainingText = remainingText.replace(flagsMatch[0], '').trim();
            }

            // Código Mercurio (suele ser 6 dígitos, ej: 001100 o 005212)
            let codigo_mercurio = '';
            const codeMatch = remainingText.match(/^(\d{5,6})/);
            if (codeMatch) {
                codigo_mercurio = codeMatch[1];
                remainingText = remainingText.replace(codigo_mercurio, '').trim();
            }

            // Cantidad y Unidad (ej: 1,000 UNIDAD o 20,000 LITROS)
            let cant_pedido = null;
            let descripcion_capacidad = '';
            const qtyUnitRegex = /^(\d+(?:,\d{3})*(?:\.\d+)?)\s*(UNIDAD|LITROS|KILOS|UNI|LT|KG|LTS|KGS)/i;
            const qtyMatch = remainingText.match(qtyUnitRegex);
            if (qtyMatch) {
                const rawQty = qtyMatch[1];
                cant_pedido = parseFloat(rawQty.replace(/\./g, '').replace(',', '.'));
                descripcion_capacidad = qtyMatch[2];
                remainingText = remainingText.replace(qtyMatch[0], '').trim();
            }

            // N° Pedido Compra (suele ser un número después de la unidad, o a veces con guión)
            let nro_pedido_compra = '';
            const purchaseOrderRegex = /^\s*(?:-)?\s*(\d+)\s*/;
            const poMatch = remainingText.match(purchaseOrderRegex);
            if (poMatch) {
                nro_pedido_compra = poMatch[1];
                remainingText = remainingText.replace(poMatch[0], '').trim();
            }

            // Contacto Mercurio (buscar nombres conocidos en el texto restante)
            let contacto_mercurio = '';
            const contactRegex = new RegExp(`\\b${contactPattern}\\b`, 'i');
            const contactMatch = remainingText.match(contactRegex);
            if (contactMatch) {
                contacto_mercurio = contactMatch[1];
                remainingText = remainingText.replace(contactMatch[0], '').trim();
            }

            // Estado (usualmente contiene "Recibido", "REcibido", "RECIBIDO", "entrada", etc.)
            let estado = 'Pendiente';
            const statusMatch = remainingText.match(/(recibido|recicbido|resibido|entregado|entrada|pendiente)[^\n]*/i);
            if (statusMatch) {
                estado = statusMatch[0].trim();
                remainingText = remainingText.replace(statusMatch[0], '').trim();
            }

            // El texto sobrante suele ser fechas de seguimiento, comentarios o previsión de entrada
            let prev_entrada = remainingText.replace(/[-\s,]+$/, '').trim();

            // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD
            let formattedDate = null;
            if (dateStr) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }

            parsedItems.push({
                fecha: formattedDate || new Date().toISOString().split('T')[0],
                quien_solicita: quien_solicita || 'Compras',
                para_quien: para_quien || 'Deposito',
                nro_pedido_venta: '',
                proveedor_marca: proveedor_marca || 'Otro',
                nro_pedido: '',
                urgencia,
                rotacion,
                transp_mercurio,
                otro_transporte,
                codigo_mercurio,
                descripcion_capacidad: descripcion_capacidad || 'Producto',
                cant_pedido: cant_pedido || 0,
                prev_entrada: prev_entrada,
                nro_pedido_compra: nro_pedido_compra,
                recepcion_parcial: '',
                contacto_mercurio: contacto_mercurio || 'Operador',
                contacto_proveedor: '',
                estado: estado,
                abonado: true
            });
        }

        // Guardar los registros parseados en la base de datos
        if (parsedItems.length > 0) {
            const { data: insertedData, error: insertError } = await supabase
                .from('seguimiento_pedidos')
                .insert(parsedItems)
                .select();

            if (insertError) throw insertError;
            
            return res.json({
                message: `Se importaron ${parsedItems.length} pedidos correctamente desde el PDF.`,
                count: parsedItems.length,
                data: insertedData
            });
        } else {
            return res.status(400).json({ message: 'No se encontraron registros válidos para importar en el PDF.' });
        }

    } catch (error) {
        console.error('Error al importar PDF de pedidos:', error);
        res.status(500).json({ message: 'Error interno al procesar el PDF' });
    }
};

const xlsx = require('xlsx');

exports.exportPedidosExcel = async (req, res) => {
    try {
        let query = supabase
            .from('seguimiento_pedidos')
            .select('*');

        // Obtener la configuración de notificaciones para saber quién es el usuario configurado
        let notifyUserOnConfirmDate = '';
        try {
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'seguimiento_pedidos_notifications')
                .single();

            if (settingsData && settingsData.value) {
                notifyUserOnConfirmDate = settingsData.value.notifyUserOnConfirmDate || '';
            }
        } catch (settingsErr) {
            console.error('Error fetching settings in exportPedidosExcel:', settingsErr);
        }

        const username = req.user.username;
        const isUserConfiguredAsConfirmDate = notifyUserOnConfirmDate && username && notifyUserOnConfirmDate.trim().toLowerCase() === username.trim().toLowerCase();

        const hasManagePermission = 
            (req.user.role === 'superadmin' ||
            (req.user.permissions && req.user.permissions.includes('manage_seguimiento_pedidos'))) && !isUserConfiguredAsConfirmDate;

        if (!hasManagePermission) {
            if (isUserConfiguredAsConfirmDate) {
                // Si el usuario actual es el configurado para confirmaciones de fecha, restringir a que solo vea los pedidos cuya fecha esté confirmada (de todo el sistema)
                query = query.eq('fecha_confirmada', true);
            } else {
                let filter = `quien_solicita.ilike.${username},para_quien.ilike.${username},contacto_mercurio.ilike.${username}`;
                
                if (req.user.sucursal_id) {
                    const { data: sucursal } = await supabase
                        .from('sucursales')
                        .select('name')
                        .eq('id', req.user.sucursal_id)
                        .single();
                    if (sucursal && sucursal.name) {
                        const sName = sucursal.name;
                        filter += `,quien_solicita.ilike.${sName},para_quien.ilike.${sName}`;
                    }
                }

                query = query.or(filter);
            }
        }

        const { data, error } = await query
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Obtener la sucursal del usuario que realiza la consulta
        let userSucursalName = '';
        if (req.user.sucursal_id) {
            try {
                const { data: sucursal } = await supabase
                    .from('sucursales')
                    .select('name')
                    .eq('id', req.user.sucursal_id)
                    .single();
                if (sucursal && sucursal.name) {
                    userSucursalName = sucursal.name.toLowerCase();
                }
            } catch (sucErr) {
                console.error('Error fetching sucursal in exportPedidosExcel:', sucErr);
            }
        }

        // Si el usuario pertenece a la sucursal gerencia, sólo deben llegarle los pedidos que requieran ser abonados (SÍ)
        if (data && userSucursalName === 'gerencia' && req.user.role !== 'superadmin') {
            data = data.filter(p => p.abonado === true);
        }

        const formattedData = data.map(p => ({
            'Fecha': p.fecha,
            'Quién Solicita': p.quien_solicita || '',
            'Para Quién': p.para_quien || '',
            'N° Pedido Venta': p.nro_pedido_venta || '',
            'Proveedor/Marca': p.proveedor_marca || '',
            'N° de Pedido Compra': p.nro_pedido || '',
            'Código Producto Proveed.': p.codigo_producto_proveed || '',
            'Abonado': p.abonado ? 'SÍ' : 'NO',
            'Urgencia': p.urgencia ? 'SÍ' : 'NO',
            'Rotación': p.rotacion ? 'SÍ' : 'NO',
            'Transp. Mercurio': p.transp_mercurio ? 'SÍ' : 'NO',
            'Otro Transporte': p.otro_transporte ? 'SÍ' : 'NO',
            'Código Mercurio': p.codigo_mercurio || '',
            'Descripción/Capacidad': p.descripcion_capacidad || '',
            'Cant. Pedido': p.cant_pedido || 0,
            'Prev. Entrada': p.prev_entrada || '',
            'N° Pedido Compra (OC)': p.nro_pedido_compra || '',
            'Recepción Parcial (Comentarios)': p.recepcion_parcial || '',
            'Cant. Recep. Parcial': p.cant_recepcion_parcial || '',
            'Contacto Mercurio - ¿Quién?': p.contacto_mercurio || '',
            'Contacto Mercurio - ¿Fechas?': p.contacto_mercurio_fecha || '',
            'Contacto Proveedor - ¿Quién?': p.contacto_proveedor || '',
            'Contacto Proveedor - ¿Fecha Original?': p.contacto_proveedor_fecha_original || '',
            'Contacto Proveedor - ¿Fecha Actual/Modificada?': p.contacto_proveedor_fecha || '',
            'Contacto Proveedor - Observaciones': p.contacto_proveedor_observaciones || '',
            'Contacto Proveedor - Tipo Entrega': p.contacto_proveedor_entrega || '',
            'Contacto Proveedor - Fecha Pendiente': p.contacto_proveedor_fecha_pendiente || '',
            'Estado': p.estado || 'Pendiente'
        }));

        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(formattedData);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Seguimiento Pedidos');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Seguimiento_Pedidos_2025.xlsx');
        res.send(buffer);
    } catch (error) {
        console.error('Error al exportar pedidos a Excel:', error);
        res.status(500).json({ message: 'Error interno al generar el archivo Excel' });
    }
};

// Obtener configuración de notificaciones de abonado
exports.getNotificationSettings = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'seguimiento_pedidos_notifications')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching notification settings:', error);
            return res.status(500).json({ message: 'Error al obtener la configuración de notificaciones' });
        }

        if (!data) {
            return res.json({ notifyUserOnSi: '', notifyUserOnNo: '', notifyUserOnConfirmDate: '' });
        }

        res.json({
            notifyUserOnSi: data.value?.notifyUserOnSi || '',
            notifyUserOnNo: data.value?.notifyUserOnNo || '',
            notifyUserOnConfirmDate: data.value?.notifyUserOnConfirmDate || ''
        });
    } catch (error) {
        console.error('Server error fetching notification settings:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// Actualizar configuración de notificaciones de abonado
exports.updateNotificationSettings = async (req, res) => {
    const { notifyUserOnSi, notifyUserOnNo, notifyUserOnConfirmDate } = req.body;

    try {
        const { error } = await supabase
            .from('app_settings')
            .upsert({
                key: 'seguimiento_pedidos_notifications',
                value: { 
                    notifyUserOnSi: notifyUserOnSi || '', 
                    notifyUserOnNo: notifyUserOnNo || '',
                    notifyUserOnConfirmDate: notifyUserOnConfirmDate || ''
                },
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error('Error updating notification settings:', error);
            return res.status(500).json({ 
                message: 'Error al actualizar la configuración de notificaciones', 
                error: error.message,
                details: error.details,
                hint: error.hint
            });
        }

        res.json({ success: true, notifyUserOnSi, notifyUserOnNo, notifyUserOnConfirmDate });
    } catch (error) {
        console.error('Server error updating notification settings:', error);
        res.status(500).json({ message: 'Error al actualizar la configuración', error: error.message || error });
    }
};

// Subir imágenes asociadas a un pedido (Gerencia solamente)
exports.uploadImagenes = async (req, res) => {
    const { id } = req.params;
    const files = req.files || [];

    if (files.length === 0) {
        return res.status(400).json({ message: 'No se recibió ninguna imagen' });
    }

    try {
        // 1. Obtener el pedido actual
        const { data: pedido, error: pedidoError } = await supabase
            .from('seguimiento_pedidos')
            .select('*')
            .eq('id', id)
            .single();

        if (pedidoError || !pedido) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }

        // 2. Validar que el pedido tenga abonado = true (SÍ)
        if (pedido.abonado !== true) {
            return res.status(400).json({ message: 'Sólo se pueden cargar imágenes para pedidos que requieran ser abonados (SÍ)' });
        }

        // 3. Validar que la sucursal del usuario sea "Gerencia" o sea superadmin
        let userSucursalName = '';
        if (req.user.sucursal_id) {
            const { data: sucursal } = await supabase
                .from('sucursales')
                .select('name')
                .eq('id', req.user.sucursal_id)
                .single();
            if (sucursal && sucursal.name) {
                userSucursalName = sucursal.name.toLowerCase();
            }
        }
        const isGerencia = userSucursalName === 'gerencia' || req.user.role === 'superadmin';

        if (!isGerencia) {
            return res.status(403).json({ message: 'Sólo los usuarios de la sucursal Gerencia pueden subir imágenes' });
        }

        // 4. Subir imágenes a Supabase Storage
        const newUrls = [];
        for (const file of files) {
            const fileName = `seguimiento-pedidos/${pedido.id}/${Date.now()}_${file.originalname}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('receipt-documents')
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true
                });

            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from('receipt-documents')
                    .getPublicUrl(fileName);
                newUrls.push(publicUrl);
            } else {
                console.error('[SEGUIMIENTO PEDIDOS IMAGE] Error al subir archivo:', file.originalname, uploadError);
            }
        }

        if (newUrls.length === 0) {
            return res.status(500).json({ message: 'Error al subir las imágenes al servidor de almacenamiento' });
        }

        // 5. Actualizar columna 'imagenes' en la BD
        let currentImagenes = [];
        if (pedido.imagenes) {
            try {
                currentImagenes = Array.isArray(pedido.imagenes) ? pedido.imagenes : JSON.parse(pedido.imagenes);
            } catch (e) {
                currentImagenes = [pedido.imagenes];
            }
        }
        const updatedImagenes = [...currentImagenes, ...newUrls];

        const { data: updatedPedido, error: updateError } = await supabase
            .from('seguimiento_pedidos')
            .update({ imagenes: updatedImagenes })
            .eq('id', pedido.id)
            .select()
            .single();

        if (updateError) throw updateError;

        // 6. Notificar a los usuarios de Compras y al usuario de Depósito/Destinatario del pedido
        try {
            const usernamesToNotify = new Set();
            const actorNormalized = req.user.username ? req.user.username.trim().toLowerCase() : '';

            const addIfValid = (username) => {
                if (username && typeof username === 'string') {
                    const trimmed = username.trim();
                    if (trimmed && trimmed.toLowerCase() !== actorNormalized) {
                        usernamesToNotify.add(trimmed);
                    }
                }
            };

            // Notificar al destinatario y al solicitante
            addIfValid(pedido.para_quien);
            addIfValid(pedido.quien_solicita);

            // Obtener configuración de notificaciones para traer al usuario de Depósito (notifyUserOnNo)
            let notifyUserOnNo = '';
            try {
                const { data: settingsData } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'seguimiento_pedidos_notifications')
                    .single();

                if (settingsData && settingsData.value) {
                    notifyUserOnNo = settingsData.value.notifyUserOnNo || '';
                }
            } catch (settingsErr) {
                console.error('Error fetching settings in uploadImagenes:', settingsErr);
            }

            // Notificar al usuario de depósito configurado
            addIfValid(notifyUserOnNo);

            // Obtener todos los usuarios de la sucursal 'Compras'
            const usersToNotify = [];
            try {
                const { data: sucursalCompras } = await supabase
                    .from('sucursales')
                    .select('id')
                    .ilike('name', 'compras')
                    .single();

                if (sucursalCompras) {
                    const { data: comprasUsers } = await supabase
                        .from('users')
                        .select('id, username')
                        .eq('sucursal_id', sucursalCompras.id);

                    if (comprasUsers && comprasUsers.length > 0) {
                        comprasUsers.forEach(u => {
                            if (u.username && u.username.toLowerCase() !== actorNormalized) {
                                usersToNotify.push({ id: u.id, username: u.username });
                            }
                        });
                    }
                }
            } catch (comprasErr) {
                console.error('Error fetching compras users in uploadImagenes:', comprasErr);
            }

            // Buscar los IDs de los otros usuarios configurados
            if (usernamesToNotify.size > 0) {
                const orFilter = Array.from(usernamesToNotify)
                    .map(username => `username.ilike.${username}`)
                    .join(',');

                try {
                    const { data: otherUsers } = await supabase
                        .from('users')
                        .select('id, username')
                        .or(orFilter);

                    if (otherUsers && otherUsers.length > 0) {
                        otherUsers.forEach(ou => {
                            // Evitar duplicados con los de Compras
                            if (!usersToNotify.some(u => u.id === ou.id)) {
                                usersToNotify.push({ id: ou.id, username: ou.username });
                            }
                        });
                    }
                } catch (usersErr) {
                    console.error('Error fetching additional users to notify in uploadImagenes:', usersErr);
                }
            }

            if (usersToNotify.length > 0) {
                const notifications = usersToNotify.map(user => ({
                    user_id: user.id,
                    title: 'Comprobante de pago subido',
                    message: `El usuario ${req.user.username} subió ${newUrls.length} imagen/es al pedido de ${pedido.proveedor_marca || 'Proveedor'} (${pedido.descripcion_capacidad || 'Producto'}).`,
                    type: 'pedido_comprobante_subido',
                    pedido_id: pedido.id,
                    read: false
                }));

                await supabase.from('notifications').insert(notifications);

                // Enviar push notification
                const userIds = notifications.map(n => n.user_id);
                const { data: tokenRecords } = await supabase
                    .from('user_fcm_tokens')
                    .select('token')
                    .in('user_id', userIds);

                if (tokenRecords && tokenRecords.length > 0) {
                    const tokens = tokenRecords.map(t => t.token);
                    await firebase.sendPushNotification(
                        tokens,
                        'Comprobante de pago subido',
                        `Se subieron comprobantes al pedido de ${pedido.proveedor_marca || 'Proveedor'}.`,
                        {
                            pedido_id: String(pedido.id),
                            type: 'pedido_comprobante_subido'
                        }
                    );
                }
            }
        } catch (notifErr) {
            console.error('Error generating notifications for image upload:', notifErr);
        }

        res.json({ success: true, imagenes: updatedImagenes });
    } catch (error) {
        console.error('Error uploading imagenes to pedido:', error);
        res.status(500).json({ message: 'Error interno al subir imágenes' });
    }
};

// Confirmación de la recepción de mercadería por parte del destinatario (para_quien)
exports.confirmarRecepcionDestinatario = async (req, res) => {
    const { id } = req.params;
    const { cant_recibida_destinatario, comentario_destinatario } = req.body;

    try {
        // 1. Obtener el pedido actual
        const { data: currentPedido, error: fetchError } = await supabase
            .from('seguimiento_pedidos')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !currentPedido) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }

        // 2. Validar que el usuario sea el destinatario (para_quien) o superadmin
        const isDestinatario = (req.user.username && currentPedido.para_quien && req.user.username.trim().toLowerCase() === currentPedido.para_quien.trim().toLowerCase()) || req.user.role === 'superadmin';
        
        if (!isDestinatario) {
            return res.status(403).json({ message: 'No tienes permisos para confirmar la recepción de este pedido (requiere ser el destinatario del campo "Para quién")' });
        }

        // 3. Actualizar campos de confirmación
        const updateData = {
            confirmado_destinatario: true,
            cant_recibida_destinatario: cant_recibida_destinatario !== undefined ? parseFloat(cant_recibida_destinatario) : null,
            comentario_destinatario: comentario_destinatario || '',
            fecha_confirmacion_destinatario: new Date().toISOString()
        };

        const { data: updatedPedido, error: updateError } = await supabase
            .from('seguimiento_pedidos')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        const canView = await canUserViewImages(req.user);
        if (!canView && updatedPedido) {
            updatedPedido.imagenes = [];
        }

        res.json(updatedPedido);
    } catch (error) {
        console.error('Error confirming reception:', error);
        res.status(500).json({ message: 'Error interno al confirmar la recepción' });
    }
};

function getWorkingDaysRemaining(expDateStr) {
    const curDate = new Date();
    curDate.setHours(0,0,0,0);
    const targetDate = new Date(expDateStr + 'T00:00:00');
    targetDate.setHours(0,0,0,0);
    if (targetDate.getTime() < curDate.getTime()) return 0;
    
    let count = 0;
    const tempDate = new Date(curDate.getTime());
    while (tempDate.getTime() < targetDate.getTime()) {
        tempDate.setDate(tempDate.getDate() + 1);
        const dayOfWeek = tempDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
        }
    }
    return count;
}

