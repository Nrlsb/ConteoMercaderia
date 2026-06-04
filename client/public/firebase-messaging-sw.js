// importScripts de Firebase SDK compat (versiones 9 o 10 son estables para service workers)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Inicializar la App de Firebase en el Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyDG2mSNa431zNH5ZwyhqxGO-Fi06TuSzpw",
  authDomain: "conteomercaderia-d8ef0.firebaseapp.com",
  projectId: "conteomercaderia-d8ef0",
  storageBucket: "conteomercaderia-d8ef0.firebasestorage.app",
  messagingSenderId: "340010528101",
  appId: "1:340010528101:web:placeholder" // Reemplazar con el Web App ID real si es necesario
});

const messaging = firebase.messaging();

// Manejar notificaciones en segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Recibido mensaje en segundo plano:', payload);
  
  const notificationTitle = payload.notification?.title || 'Nuevo Pedido';
  const notificationOptions = {
    body: payload.notification?.body || 'Se ha actualizado un pedido',
    icon: '/logo.png',
    badge: '/logo.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Abrir la aplicación y navegar a la sección de seguimiento al hacer clic en la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = new URL('/seguimiento-pedidos', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((windowClients) => {
      // Si la pestaña ya está abierta, hacer foco en ella
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // De lo contrario, abrir una nueva pestaña
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
