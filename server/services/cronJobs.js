const supabase = require('./supabaseClient');
const firebase = require('./firebase');
const { startCatalogSync } = require('./protheusSyncService');
const { actualizarCotizacionesBD } = require('./dolarService');
const { takeStockSnapshot } = require('./stockSnapshotService');

/**
 * Tarea programada para borrar el historial de etiquetas todos los días a las 23:00 hs (Buenos Aires).
 * Se ejecuta cada minuto para verificar la hora y sincronizar el borrado.
 */
function startLabelHistoryCleanupTask() {
    console.log('[CRON] Iniciando monitor de limpieza de historial de etiquetas (Programado: 23:00 BA)...');
    let lastRunDate = null;

    setInterval(async () => {
        try {
            const now = new Date();
            // Obtener fecha y hora en Buenos Aires usando Intl para asegurar la precisión de la zona horaria
            const baFormatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                hour12: false
            });
            
            const parts = baFormatter.formatToParts(now);
            const hour = parseInt(parts.find(p => p.type === 'hour').value);
            const day = parts.find(p => p.type === 'day').value;

            // Ejecutar a las 23:00 (o poco después) si no se ha ejecutado ya en este día de Buenos Aires
            if (hour === 23 && lastRunDate !== day) {
                console.log(`[CRON] ${now.toISOString()} - Ejecutando borrado automático de historial de etiquetas...`);
                
                const { error } = await supabase
                    .from('label_print_history')
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000'); // Filtro para permitir borrado masivo
                
                if (error) {
                    console.error('[CRON ERROR] Detalle de Supabase:', error.message);
                    throw error;
                }
                
                console.log('[CRON] Historial de etiquetas borrado exitosamente.');
                lastRunDate = day;
            }
        } catch (err) {
            console.error('[CRON ERROR] Falló la tarea de limpieza automática:', err.message);
        }
    }, 60000); // Verificar cada 60 segundos
}

/**
 * Tarea programada para revisar las fechas de contacto con el proveedor.
 * Se ejecuta cada minuto, pero realiza el chequeo una vez al día a las 09:00 hs (Buenos Aires).
 */
function startProviderContactNotificationTask() {
    console.log('[CRON] Iniciando monitor de notificaciones de contacto con proveedor (Programado: 09:00 BA)...');
    let lastNotifDate = null;

    setInterval(async () => {
        try {
            const now = new Date();
            const baFormatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                hour12: false
            });
            
            const parts = baFormatter.formatToParts(now);
            const hour = parseInt(parts.find(p => p.type === 'hour').value);
            const day = parts.find(p => p.type === 'day').value;

            // Ejecutar a las 09:00 (o poco después) si no se ha ejecutado ya hoy
            if (hour === 9 && lastNotifDate !== day) {
                console.log(`[CRON] ${now.toISOString()} - Ejecutando chequeo de contacto con proveedores...`);
                await checkAndSendProviderContactNotifications();
                lastNotifDate = day;
            }
        } catch (err) {
            console.error('[CRON ERROR] Falló la tarea de notificaciones de contacto:', err.message);
        }
    }, 60000); // Verificar cada 60 segundos
}

function getWorkingDaysDifference(startDate, endDate) {
    const sDate = new Date(startDate.getTime());
    const eDate = new Date(endDate.getTime());
    
    sDate.setHours(0,0,0,0);
    eDate.setHours(0,0,0,0);
    
    if (eDate.getTime() < sDate.getTime()) {
        const diffTime = eDate.getTime() - sDate.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    let count = 0;
    const curDate = new Date(sDate.getTime());
    
    while (curDate.getTime() < eDate.getTime()) {
        curDate.setDate(curDate.getDate() + 1);
        const dayOfWeek = curDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
        }
    }
    
    return count;
}

async function checkAndSendProviderContactNotifications() {
    try {
        // Obtener la fecha de hoy en Buenos Aires formateada como YYYY-MM-DD
        const baFormatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = baFormatter.formatToParts(new Date());
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        const todayStr = `${year}-${month}-${day}`;
        const today = new Date(`${todayStr}T00:00:00`);

        // Buscamos pedidos que tengan contacto_proveedor_fecha cargado, no estén confirmados y notif_confirmacion_enviada = false
        const { data: pedidos, error } = await supabase
            .from('seguimiento_pedidos')
            .select('*')
            .eq('notif_confirmacion_enviada', false)
            .eq('fecha_confirmada', false)
            .not('contacto_proveedor_fecha', 'is', null)
            .not('contacto_proveedor_fecha', 'eq', '');

        if (error) throw error;
        if (!pedidos || pedidos.length === 0) {
            return;
        }

        for (const pedido of pedidos) {
            // Ignorar pedidos que ya fueron finalizados
            const lowerEstado = pedido.estado?.toLowerCase() || '';
            const isFinalizado =
              lowerEstado.includes('recibido') ||
              lowerEstado.includes('total') ||
              lowerEstado.includes('anulado') ||
              lowerEstado.includes('entregado');
            if (isFinalizado) continue;

            // Validar si tiene formato de fecha YYYY-MM-DD
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(pedido.contacto_proveedor_fecha)) {
                continue;
            }

            const providerDate = new Date(`${pedido.contacto_proveedor_fecha}T00:00:00`);
            const diffDays = getWorkingDaysDifference(today, providerDate);

            // Si faltan exactamente 3 días hábiles (o entre 0 y 3 días hábiles, por si se carga tarde)
            if (diffDays <= 3 && diffDays >= 0) {
                if (!pedido.contacto_mercurio) continue;


                // Buscar el usuario asignado en contacto_mercurio (case-insensitive)
                const { data: userRecord, error: userError } = await supabase
                    .from('users')
                    .select('id, username')
                    .ilike('username', pedido.contacto_mercurio.trim())
                    .single();

                if (userError || !userRecord) {
                    console.log(`[CRON] No se encontró usuario para contacto_mercurio: "${pedido.contacto_mercurio}"`);
                    continue;
                }

                const title = 'Confirmar fecha con proveedor';
                const message = `Faltan ${diffDays} días para la fecha programada de contacto con el proveedor (${pedido.proveedor_marca}) en el pedido OC ${pedido.nro_pedido_compra || ''} (${pedido.descripcion_capacidad || 'producto'}). Por favor confirma la fecha.`;

                // 1. Insertar en tabla de notificaciones
                const { error: insertError } = await supabase
                    .from('notifications')
                    .insert([{
                        user_id: userRecord.id,
                        title,
                        message,
                        type: 'confirmacion_proveedor',
                        pedido_id: pedido.id,
                        read: false
                    }]);

                if (insertError) {
                    console.error(`[CRON ERROR] Al guardar notificación para ${userRecord.username}:`, insertError.message);
                    continue;
                }

                // 2. Enviar notificación push
                const { data: tokenRecords, error: tokenError } = await supabase
                    .from('user_fcm_tokens')
                    .select('token')
                    .eq('user_id', userRecord.id);

                if (!tokenError && tokenRecords && tokenRecords.length > 0) {
                    const tokens = tokenRecords.map(t => t.token);
                    await firebase.sendPushNotification(
                        tokens,
                        title,
                        message,
                        {
                            pedido_id: pedido.id ? String(pedido.id) : '',
                            type: 'confirmacion_proveedor'
                        }
                    );
                }

                // 3. Marcar como notificado en seguimiento_pedidos
                await supabase
                    .from('seguimiento_pedidos')
                    .update({ notif_confirmacion_enviada: true })
                    .eq('id', pedido.id);

                console.log(`[CRON] Notificación de confirmación enviada a ${userRecord.username} para el pedido ${pedido.id}`);
            }
        }
    } catch (err) {
        console.error('[CRON ERROR] Error en checkAndSendProviderContactNotifications:', err);
    }
}

/**
 * Tarea programada para sincronizar el catálogo de Protheus de forma automática todos los días a las 02:00 AM (Buenos Aires).
 * Revisa cada minuto si coincide el horario de ejecución programado.
 */
function startProtheusSyncTask() {
    console.log('[CRON] Iniciando monitor de sincronización de catálogo de Protheus (Programado: 02:00 BA)...');
    let lastRunDate = null;

    setInterval(async () => {
        try {
            const now = new Date();
            const baFormatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                hour12: false
            });
            
            const parts = baFormatter.formatToParts(now);
            const hour = parseInt(parts.find(p => p.type === 'hour').value);
            const day = parts.find(p => p.type === 'day').value;

            // Ejecutar a las 02:00 AM (o poco después) si no se ha ejecutado ya hoy
            if (hour === 2 && lastRunDate !== day) {
                console.log(`[CRON] ${now.toISOString()} - Iniciando sincronización programada diaria del catálogo de Protheus...`);
                await startCatalogSync();
                lastRunDate = day;
            }
        } catch (err) {
            console.error('[CRON ERROR] Falló la sincronización programada del catálogo:', err.message);
        }
    }, 60000); // Verificar cada 60 segundos
}

/**
 * Tarea programada para actualizar las cotizaciones del dólar desde el BNA.
 * Se ejecuta dos veces al día: a las 08:00 hs y a las 12:30 hs (Buenos Aires).
 * Revisa cada minuto.
 */
function startDolarScrapingTask() {
    console.log('[CRON] Iniciando monitor de cotización de dólares BNA (Programado: 08:00 y 12:30 BA)...');
    let lastRunKey = null;

    setInterval(async () => {
        try {
            const now = new Date();
            const baFormatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                hour12: false
            });
            
            const parts = baFormatter.formatToParts(now);
            const hour = parseInt(parts.find(p => p.type === 'hour').value);
            const minute = parseInt(parts.find(p => p.type === 'minute').value);
            const day = parts.find(p => p.type === 'day').value;

            // Horarios de ejecución: 08:00 AM y a partir de las 12:30 PM
            const isTargetTime = (hour === 8) || (hour === 12 && minute >= 30);
            const runKey = `${day}_${hour}`;

            if (isTargetTime && lastRunKey !== runKey) {
                console.log(`[CRON] ${now.toISOString()} - Ejecutando actualización automática de cotización del dólar...`);
                await actualizarCotizacionesBD();
                lastRunKey = runKey;
            }
        } catch (err) {
            console.error('[CRON ERROR] Falló la actualización automática de cotizaciones:', err.message);
        }
    }, 60000); // Verificar cada 60 segundos
}

/**
 * Tarea programada para monitorear el vencimiento de pagos (7 días corridos).
 * Se ejecuta una vez al día a las 09:30 hs (Buenos Aires).
 */
function startPaymentExpirationMonitorTask() {
    console.log('[CRON] Iniciando monitor de vencimiento de pagos (Programado: 09:30 BA)...');
    let lastRunDate = null;

    setInterval(async () => {
        try {
            const now = new Date();
            const baFormatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                hour12: false
            });
            
            const parts = baFormatter.formatToParts(now);
            const hour = parseInt(parts.find(p => p.type === 'hour').value);
            const minute = parseInt(parts.find(p => p.type === 'minute').value);
            const day = parts.find(p => p.type === 'day').value;

            // Ejecutar a partir de las 09:30 AM si no se ha ejecutado ya hoy
            if (hour === 9 && minute >= 30 && lastRunDate !== day) {
                console.log(`[CRON] ${now.toISOString()} - Ejecutando chequeo de vencimiento de pagos...`);
                await checkPaymentExpirations();
                lastRunDate = day;
            }
        } catch (err) {
            console.error('[CRON ERROR] Falló la tarea de vencimiento de pagos:', err.message);
        }
    }, 60000); // Verificar cada 60 segundos
}

async function checkPaymentExpirations() {
    try {
        const now = new Date();
        
        // 1. Obtener todos los pedidos activos que requieren pago
        const { data: pedidos, error } = await supabase
            .from('seguimiento_pedidos')
            .select('*')
            .eq('abonado', true)
            .not('estado', 'ilike', 'anulado')
            .not('estado', 'ilike', 'recepción parcial')
            .not('estado', 'ilike', 'recepción total');

        if (error) throw error;
        if (!pedidos || pedidos.length === 0) return;

        // Helper para comprobar si tiene imágenes
        const hasImgs = (pedido) => {
            if (!pedido.imagenes) return false;
            if (Array.isArray(pedido.imagenes)) return pedido.imagenes.length > 0;
            try {
                const parsed = typeof pedido.imagenes === 'string' ? JSON.parse(pedido.imagenes) : pedido.imagenes;
                if (Array.isArray(parsed)) return parsed.length > 0;
            } catch (e) {}
            return !!pedido.imagenes;
        };

        // Filtrar pedidos que no tienen imágenes de pago cargadas
        const pendingPaymentPedidos = pedidos.filter(p => !hasImgs(p));

        if (pendingPaymentPedidos.length === 0) return;

        // Obtener ids de sucursales Compras y Gerencia
        const { data: sucs, error: sucsErr } = await supabase
            .from('sucursales')
            .select('id, name');
        if (sucsErr) throw sucsErr;

        const targetSucIds = sucs
            .filter(s => s.name && ['compras', 'gerencia'].includes(s.name.toLowerCase()))
            .map(s => s.id);

        // Obtener todos los usuarios de Compras y Gerencia
        const { data: targetUsers, error: usersErr } = await supabase
            .from('users')
            .select('id, username')
            .in('sucursal_id', targetSucIds);
        if (usersErr) throw usersErr;

        for (const pedido of pendingPaymentPedidos) {
            const createdAt = new Date(pedido.created_at || pedido.fecha);
            
            // Fecha de expiración: 7 días corridos a partir de la creación
            const expirationDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
            
            // Si ya venció (pasaron los 7 días corridos)
            if (now.getTime() >= expirationDate.getTime()) {
                console.log(`[CRON] Pedido ${pedido.id} (OC ${pedido.nro_pedido || ''}) ha vencido sin pago. Dando de baja...`);
                
                // Actualizar estado a 'Anulado'
                const { error: updateErr } = await supabase
                    .from('seguimiento_pedidos')
                    .update({ 
                        estado: 'Anulado',
                        recepcion_parcial: (pedido.recepcion_parcial ? pedido.recepcion_parcial + ' | ' : '') + 'Dado de baja automáticamente por falta de pago (vencimiento de 7 días).'
                    })
                    .eq('id', pedido.id);

                if (updateErr) {
                    console.error(`[CRON ERROR] No se pudo dar de baja el pedido ${pedido.id}:`, updateErr.message);
                    continue;
                }

                // Notificar a los usuarios de Compras y Gerencia
                if (targetUsers && targetUsers.length > 0) {
                    const title = 'Pedido dado de baja por falta de pago';
                    const message = `El pedido de ${pedido.proveedor_marca || 'Proveedor'} (${pedido.descripcion_capacidad || 'producto'}) ha sido dado de baja automáticamente porque pasaron los 7 días sin registrarse el pago de Gerencia.`;
                    
                    const notifications = targetUsers.map(user => ({
                        user_id: user.id,
                        title,
                        message,
                        type: 'vencimiento_pago_baja',
                        pedido_id: pedido.id,
                        read: false
                    }));

                    await supabase.from('notifications').insert(notifications);

                    // Enviar notificaciones push
                    for (const user of targetUsers) {
                        const { data: tokenRecords } = await supabase
                            .from('user_fcm_tokens')
                            .select('token')
                            .eq('user_id', user.id);
                        
                        if (tokenRecords && tokenRecords.length > 0) {
                            const tokens = tokenRecords.map(t => t.token);
                            await firebase.sendPushNotification(tokens, title, message, {
                                pedido_id: String(pedido.id),
                                type: 'vencimiento_pago_baja'
                            });
                        }
                    }
                }
            } else {
                // Calcular días hábiles restantes
                const remainingWorkingDays = getWorkingDaysDifference(now, expirationDate);
                
                // Si faltan exactamente 2 días hábiles o menos, y no hemos enviado advertencia aún
                if (remainingWorkingDays <= 2 && remainingWorkingDays >= 0) {
                    // Verificar si ya se envió notificación de advertencia de vencimiento para este pedido
                    const { data: existingNotif, error: notifErr } = await supabase
                        .from('notifications')
                        .select('id')
                        .eq('pedido_id', pedido.id)
                        .eq('type', 'advertencia_vencimiento')
                        .limit(1);

                    if (notifErr) {
                        console.error('[CRON ERROR] Al verificar notificaciones existentes:', notifErr.message);
                        continue;
                    }

                    // Si no existe notificación previa de este tipo
                    if (!existingNotif || existingNotif.length === 0) {
                        console.log(`[CRON] Pedido ${pedido.id} está a ${remainingWorkingDays} días hábiles de vencer. Enviando advertencia...`);
                        
                        if (targetUsers && targetUsers.length > 0) {
                            const title = 'Advertencia: Pago pendiente de vencer';
                            const message = `El pedido de ${pedido.proveedor_marca || 'Proveedor'} (${pedido.descripcion_capacidad || 'producto'}) no ha sido abonado. Quedan ${remainingWorkingDays} días hábiles antes de que se dé de baja automáticamente por vencimiento.`;
                            
                            const notifications = targetUsers.map(user => ({
                                user_id: user.id,
                                title,
                                message,
                                type: 'advertencia_vencimiento',
                                pedido_id: pedido.id,
                                read: false
                            }));

                            await supabase.from('notifications').insert(notifications);

                            // Enviar notificaciones push
                            for (const user of targetUsers) {
                                const { data: tokenRecords } = await supabase
                                    .from('user_fcm_tokens')
                                    .select('token')
                                    .eq('user_id', user.id);
                                
                                if (tokenRecords && tokenRecords.length > 0) {
                                    const tokens = tokenRecords.map(t => t.token);
                                    await firebase.sendPushNotification(tokens, title, message, {
                                        pedido_id: String(pedido.id),
                                        type: 'advertencia_vencimiento'
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('[CRON ERROR] Error en checkPaymentExpirations:', err);
    }
}

/**
 * Tarea programada para registrar y comparar el stock.
 * Se ejecuta dos veces al día: a las 19:00 hs y a las 05:30 hs (Buenos Aires).
 * Revisa cada minuto.
 */
function startStockSnapshotTask() {
    console.log('[CRON] Iniciando monitor de registro y comparación de stock (Programado: 19:00 y 05:30 BA)...');
    let lastRunKey = null;

    setInterval(async () => {
        try {
            const now = new Date();
            const baFormatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                hour12: false
            });
            
            const parts = baFormatter.formatToParts(now);
            const hour = parseInt(parts.find(p => p.type === 'hour').value);
            const minute = parseInt(parts.find(p => p.type === 'minute').value);
            const day = parts.find(p => p.type === 'day').value;

            // Horarios de ejecución flexibles: 19:00 a 19:59 y 05:30 a 05:59
            const isTarget19 = (hour === 19);
            const isTarget05 = (hour === 5 && minute >= 30);

            if (isTarget19 || isTarget05) {
                const scheduleType = isTarget19 ? '19:00' : '05:30';
                const runKey = `${day}_${scheduleType}`;

                if (lastRunKey !== runKey) {
                    console.log(`[CRON] ${now.toISOString()} - Iniciando captura automática programada de stock (${scheduleType})...`);
                    await takeStockSnapshot(scheduleType);
                    // Solo registramos el éxito si la función asíncrona takeStockSnapshot finaliza sin errores
                    lastRunKey = runKey;
                }
            }
        } catch (err) {
            console.error('[CRON ERROR] Falló la captura programada de stock:', err.message);
        }
    }, 60000); // Verificar cada 60 segundos
}

module.exports = {
    startLabelHistoryCleanupTask,
    startProviderContactNotificationTask,
    startProtheusSyncTask,
    startDolarScrapingTask,
    startPaymentExpirationMonitorTask,
    startStockSnapshotTask
};
