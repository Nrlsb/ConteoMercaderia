import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { onMessage } from 'firebase/messaging';
import { useAuth } from './AuthContext';
import { supabase } from '../supabaseClient';
import api from '../api';
import { messaging, requestForToken } from '../firebase';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [browserPermission, setBrowserPermission] = useState('default');
    const navigate = useNavigate();

    // Referencias para evitar rehacer los listeners si cambian los estados
    const isAuthenticatedRef = useRef(isAuthenticated);
    const userIdRef = useRef(user?.id);
    const userUsernameRef = useRef(user?.username);
    const processedNotificationsRef = useRef(new Set());

    useEffect(() => {
        isAuthenticatedRef.current = isAuthenticated;
        userIdRef.current = user?.id;
        userUsernameRef.current = user?.username;
    }, [isAuthenticated, user]);

    useEffect(() => {
        if ('Notification' in window) {
            setBrowserPermission(Notification.permission);
        }
    }, []);

    // Cargar notificaciones del servidor
    const fetchNotifications = async () => {
        if (!isAuthenticatedRef.current || !userIdRef.current) return;
        try {
            const res = await api.get('/api/notifications');
            setNotifications(res.data);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    // Solicitar permisos de notificación en el Sistema (Web / APK)
    const requestNotificationPermission = async () => {
        try {
            if (Capacitor.isNativePlatform()) {
                const permStatus = await LocalNotifications.checkPermissions();
                if (permStatus.display !== 'granted') {
                    await LocalNotifications.requestPermissions();
                }
            } else {
                if ('Notification' in window) {
                    setBrowserPermission(Notification.permission);
                }
            }
        } catch (error) {
            console.warn('Error al solicitar permisos de notificación de sistema:', error);
        }
    };

    // Registrar y solicitar permisos para Push Notifications de Firebase en la Web
    const registerWebPushNotifications = async () => {
        if (Capacitor.isNativePlatform()) return;

        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                const token = await requestForToken();
                if (token) {
                    console.log('[PUSH WEB] Token Web FCM obtenido:', token);
                    await api.post('/api/notifications/register-token', {
                        token: token,
                        deviceType: 'web'
                    });
                    console.log('[PUSH WEB] Token Web registrado en la base de datos correctamente');
                }
            }
        } catch (e) {
            console.error('[PUSH WEB] Error al registrar Web Push Notifications:', e);
        }
    };

    // Solicitar permiso de forma interactiva en la web
    const handleEnableWebNotifications = async () => {
        try {
            if ('Notification' in window) {
                const permission = await Notification.requestPermission();
                setBrowserPermission(permission);
                if (permission === 'granted') {
                    toast.success('Notificaciones de escritorio activadas');
                    showSystemNotification('¡Notificaciones Activas!', 'Ahora recibirás alertas de tus pedidos en el navegador.');
                    await registerWebPushNotifications();
                } else if (permission === 'denied') {
                    toast.error('Has bloqueado las notificaciones. Actívalas desde la configuración de tu navegador.');
                }
            }
        } catch (error) {
            console.error('Error al solicitar permiso de notificaciones:', error);
        }
    };

    // Registrar y solicitar permisos para Push Notifications de Firebase (APK)
    const registerPushNotifications = async () => {
        if (!Capacitor.isNativePlatform()) return;

        try {
            let permStatus = await PushNotifications.checkPermissions();
            if (permStatus.receive !== 'granted') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive === 'granted') {
                await PushNotifications.register();
            }
        } catch (e) {
            console.error('Error al inicializar Push Notifications nativas:', e);
        }
    };

    // Lanzar notificación en la barra del sistema (Web / APK)
    const showSystemNotification = async (title, message, pedidoId) => {
        try {
            if (Capacitor.isNativePlatform()) {
                // En plataforma nativa (móvil), no agendamos notificaciones locales para alertas de la base de datos,
                // ya que Firebase se encarga de mostrar la notificación push real en la barra de Android.
                // Esto previene que se duplique la notificación con la de Firebase.
                return;
            } else {
                // Notificación nativa en la barra del Navegador Web (Desktop)
                if ('Notification' in window && Notification.permission === 'granted') {
                    const notif = new Notification(title, {
                        body: message,
                        icon: '/favicon.ico',
                        tag: pedidoId || 'pedido'
                    });
                    notif.onclick = () => {
                        window.focus();
                        navigate('/seguimiento-pedidos');
                    };
                }
            }
        } catch (error) {
            console.error('Error al mostrar notificación de sistema:', error);
        }
    };

    // Lanzar notificación visual y de sistema deduplicada (Web)
    const triggerVisualNotification = (title, body, pedidoId) => {
        if (Capacitor.isNativePlatform()) return;

        // Clave única basada en título y cuerpo
        const key = `${title}|${body}`;
        if (processedNotificationsRef.current.has(key)) {
            console.log('[NOTIFICACION] Ya procesada recientemente en primer plano, omitiendo duplicada:', key);
            return;
        }

        // Registrar clave en el set deduplicador
        processedNotificationsRef.current.add(key);
        // Expirar la clave en 15 segundos
        setTimeout(() => {
            processedNotificationsRef.current.delete(key);
        }, 15000);

        console.log('[NOTIFICACION] Disparando alerta visual en primer plano:', title, body);

        // 1. Mostrar toast visual dentro de la app
        toast.info(title, {
            description: body,
            duration: Infinity,
            action: {
                label: 'Ver Pedido',
                onClick: () => {
                    navigate('/seguimiento-pedidos');
                }
            }
        });

        // 2. Enviar notificación a la barra de notificaciones del sistema
        showSystemNotification(title, body, pedidoId);
    };

    // Registrar listeners locales en la APK (Acciones sobre notificaciones locales)
    useEffect(() => {
        let isMounted = true;
        
        if (Capacitor.isNativePlatform()) {
            LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
                console.log('Notificación pulsada en APK:', action);
                if (isMounted) {
                    navigate('/seguimiento-pedidos');
                }
            });
        }

        return () => {
            isMounted = false;
            if (Capacitor.isNativePlatform()) {
                LocalNotifications.removeAllListeners();
            }
        };
    }, [navigate]);

    // Registrar y gestionar listeners de Push Notifications de Firebase (APK)
    useEffect(() => {
        if (!isAuthenticated || !user?.id || !Capacitor.isNativePlatform()) return;

        registerPushNotifications();

        // 1. Obtener y enviar el token FCM al servidor
        const regListener = PushNotifications.addListener('registration', async (token) => {
            console.log('[PUSH] Token FCM obtenido en dispositivo:', token.value);
            try {
                await api.post('/api/notifications/register-token', {
                    token: token.value,
                    deviceType: 'android'
                });
                console.log('[PUSH] Token registrado en base de datos correctamente');
            } catch (err) {
                console.error('[PUSH] Error al registrar token en backend:', err);
            }
        });

        // 2. Error de registro
        const errListener = PushNotifications.addListener('registrationError', (error) => {
            console.error('[PUSH] Error en registro de Firebase:', error);
        });

        // 3. Notificación Push recibida en primer plano
        const notifListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[PUSH] Recibida en primer plano:', notification);
            fetchNotifications(); // Recargar campanita
            
            // Mostrar toast visual dentro de la app (móvil)
            toast.info(notification.title, {
                description: notification.body,
                duration: Infinity,
                action: {
                    label: 'Ver Pedido',
                    onClick: () => {
                        navigate('/seguimiento-pedidos');
                    }
                }
            });
        });

        // 4. Acción sobre notificación Push en segundo plano / barra
        const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('[PUSH] Notificación pulsada desde la barra de Android:', action);
            navigate('/seguimiento-pedidos');
        });

        return () => {
            regListener.remove();
            errListener.remove();
            notifListener.remove();
            actionListener.remove();
        };
    }, [isAuthenticated, user?.id, navigate]);

    // Suscribirse a Supabase Realtime para notificaciones en tiempo real
    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;

        fetchNotifications();
        requestNotificationPermission();
        if (!Capacitor.isNativePlatform()) {
            registerWebPushNotifications();
        }

        const channelId = `user-notifications-${user.id}-${Math.random().toString(36).substring(2, 9)}`;
        console.log(`[REALTIME] Intentando suscribir al canal '${channelId}' para el usuario:`, user.username, "ID:", user.id);
        
        const channel = supabase
            .channel(channelId)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications'
                },
                (payload) => {
                    const newNotif = payload.new;
                    
                    // Filtrar en el cliente: ignorar si no es para el usuario actual
                    if (newNotif.user_id !== user.id) return;
                    
                    console.log('[REALTIME] ¡Nueva notificación recibida en tiempo real!', payload);
                    
                    // Evitar duplicados en la lista local
                    setNotifications((prev) => {
                        if (prev.some(n => n.id === newNotif.id)) return prev;
                        return [newNotif, ...prev];
                    });
                    
                    // En dispositivos móviles (APK), las alertas visuales (toast) y nativas
                    // las gestiona exclusivamente el plugin de Firebase FCM (en foreground/background).
                    // En el navegador web (Desktop), las gestionamos nosotros a través del realtime y LocalNotifications.
                    if (!Capacitor.isNativePlatform()) {
                        triggerVisualNotification(newNotif.title, newNotif.message, newNotif.pedido_id);
                    }
                }
            )
            .subscribe((status, err) => {
                console.log(`[REALTIME] Estado de la suscripción para ${user.username}:`, status);
                if (err) {
                    console.error('[REALTIME] Error en la suscripción:', err);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isAuthenticated, user?.id, navigate]);

    // Listener en primer plano para Firebase Cloud Messaging en la Web
    useEffect(() => {
        if (!isAuthenticated || !user?.id || Capacitor.isNativePlatform()) return;

        let unsubscribe = () => {};

        try {
            unsubscribe = onMessage(messaging, (payload) => {
                console.log('[PUSH WEB] Mensaje recibido en primer plano:', payload);
                fetchNotifications(); // Recargar campanita de notificaciones
                
                // Si viene un payload con notificación, disparar la alerta visual
                // usando el deduplicador (por si también llega por Supabase Realtime)
                if (payload.notification) {
                    const title = payload.notification.title || 'Nueva notificación';
                    const body = payload.notification.body || '';
                    const pedidoId = payload.data?.pedido_id;
                    triggerVisualNotification(title, body, pedidoId);
                }
            });
        } catch (error) {
            console.error('[PUSH WEB] Error al configurar el listener en primer plano:', error);
        }

        return () => {
            unsubscribe();
        };
    }, [isAuthenticated, user?.id]);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleMarkAsRead = async (id, e) => {
        if (e) e.stopPropagation();
        try {
            await api.put(`/api/notifications/${id}/read`);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, read: true } : n)
            );
            toast.success('Notificación marcada como leída');
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        if (unreadCount === 0) return;
        try {
            await api.put('/api/notifications/mark-all-read');
            setNotifications(prev =>
                prev.map(n => ({ ...n, read: true }))
            );
            toast.success('Todas las notificaciones marcadas como leídas');
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    };

    const handleNotificationClick = (notification, onClose) => {
        if (!notification.read) {
            api.put(`/api/notifications/${notification.id}/read`)
                .then(() => {
                    setNotifications(prev =>
                        prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
                    );
                })
                .catch(err => console.error(err));
        }
        if (onClose) onClose();
        if (notification.pedido_id) {
            navigate('/seguimiento-pedidos');
        }
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            browserPermission,
            handleEnableWebNotifications,
            handleMarkAsRead,
            handleMarkAllAsRead,
            handleNotificationClick,
            fetchNotifications
        }}>
            {children}
        </NotificationContext.Provider>
    );
};
