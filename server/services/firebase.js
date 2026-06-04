const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let isInitialized = false;
let messaging = null;

try {
    const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
    
    if (fs.existsSync(serviceAccountPath)) {
        // Inicializar usando el archivo JSON de credenciales
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        isInitialized = true;
        messaging = admin.messaging();
        console.log('[FIREBASE] Inicializado correctamente usando firebase-service-account.json');
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        // Inicializar usando variables de entorno
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
        });
        isInitialized = true;
        messaging = admin.messaging();
        console.log('[FIREBASE] Inicializado correctamente usando variables de entorno');
    } else {
        console.warn('[FIREBASE] ADVERTENCIA: No se encontró firebase-service-account.json ni variables de entorno de Firebase.');
        console.warn('[FIREBASE] Las notificaciones Push en segundo plano estarán DESACTIVADAS hasta que se configure Firebase.');
    }
} catch (error) {
    console.error('[FIREBASE] Error al inicializar Firebase Admin SDK:', error.message);
}

// Función auxiliar para enviar una notificación push a múltiples tokens
const sendPushNotification = async (tokens, title, body, data = {}) => {
    if (!isInitialized || !messaging) {
        console.warn('[FIREBASE] Intento de enviar push ignorado: Firebase no está inicializado.');
        return { success: false, error: 'Firebase no inicializado' };
    }

    if (!tokens || tokens.length === 0) {
        return { success: true, sentCount: 0 };
    }

    // Filtrar tokens vacíos o duplicados
    const uniqueTokens = [...new Set(tokens.filter(t => !!t))];
    if (uniqueTokens.length === 0) return { success: true, sentCount: 0 };

    const message = {
        notification: {
            title: title,
            body: body
        },
        data: {
            ...data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK', // O Capacitor standard click handlers
        },
        tokens: uniqueTokens
    };

    try {
        const response = await messaging.sendEachForMulticast(message);
        console.log(`[FIREBASE] Notificaciones push enviadas. Éxito: ${response.successCount}, Fallas: ${response.failureCount}`);
        
        // Si hay tokens inválidos, reportarlos para poder limpiarlos de la BD
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const errorCode = resp.error?.code;
                if (errorCode === 'messaging/invalid-registration-token' || 
                    errorCode === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(uniqueTokens[idx]);
                }
            }
        });

        return { 
            success: true, 
            successCount: response.successCount, 
            failureCount: response.failureCount,
            invalidTokens 
        };
    } catch (error) {
        console.error('[FIREBASE] Error al enviar multicast push:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    isFirebaseInitialized: () => isInitialized,
    sendPushNotification
};
