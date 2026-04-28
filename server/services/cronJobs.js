const supabase = require('./supabaseClient');

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

module.exports = {
    startLabelHistoryCleanupTask
};
