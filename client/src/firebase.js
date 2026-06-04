import { initializeApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDG2mSNa431zNH5ZwyhqxGO-Fi06TuSzpw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "conteomercaderia-d8ef0.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "conteomercaderia-d8ef0",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "conteomercaderia-d8ef0.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "340010528101",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "", // Deberá configurarse si se requiere el appId Web
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

export const requestForToken = async () => {
  try {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('[PUSH WEB] Falta la clave VAPID en variables de entorno (VITE_FIREBASE_VAPID_KEY). No se puede registrar token Web Push.');
      return null;
    }
    const currentToken = await getToken(messaging, { vapidKey });
    return currentToken;
  } catch (err) {
    console.error('[PUSH WEB] Error al obtener token Web Push:', err);
    return null;
  }
};
