const supabase = require('./supabaseClient');
const firebase = require('./firebase');

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
            const minute = parseInt(parts.find(p => p.type === 'minute').value);
            const day = parts.find(p => p.type === 'day').value;

            // Ejecutar a las 23:00 si no se ha ejecutado ya en este día de Buenos Aires
            if (hour === 23 && minute === 0 && lastRunDate !== day) {
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
            const minute = parseInt(parts.find(p => p.type === 'minute').value);
            const day = parts.find(p => p.type === 'day').value;

            // Ejecutar a las 09:00 si no se ha ejecutado ya en este día de Buenos Aires
            if (hour === 9 && minute === 0 && lastNotifDate !== day) {
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

module.exports = {
    startLabelHistoryCleanupTask,
    startProviderContactNotificationTask
};
