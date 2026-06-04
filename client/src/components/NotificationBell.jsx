import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check } from 'lucide-react';
import { toast } from 'sonner';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

const NotificationBell = () => {
    const { user, isAuthenticated } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // Solicitar permisos de notificación en el Sistema (Web / APK)
    const requestNotificationPermission = async () => {
        try {
            if (Capacitor.isNativePlatform()) {
                const permStatus = await LocalNotifications.checkPermissions();
                if (permStatus.display !== 'granted') {
                    await LocalNotifications.requestPermissions();
                }
            } else {
                if ('Notification' in window && Notification.permission !== 'granted') {
                    await Notification.requestPermission();
                }
            }
        } catch (error) {
            console.warn('Error al solicitar permisos de notificación de sistema:', error);
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
                // Registrar para recibir el token FCM de Google
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
                // Notificación nativa en la barra de Android/APK
                await LocalNotifications.schedule({
                    notifications: [
                        {
                            title,
                            body: message,
                            id: Math.floor(Math.random() * 100000),
                            extra: {
                                pedidoId
                            },
                            smallIcon: 'res://ic_stat_bell', // Icono configurado en Android
                            sound: 'res://platform_default',
                            actionTypeId: 'OPEN_PEDIDO'
                        }
                    ]
                });
            } else {
                // Notificación nativa en la barra del Navegador Web
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

    // Cargar notificaciones del servidor
    const fetchNotifications = async () => {
        try {
            const res = await api.get('/api/notifications');
            setNotifications(res.data);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    // Registrar listener para clicks de notificaciones locales en la APK
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
            
            toast.info(notification.title, {
                description: notification.body,
                duration: 6000,
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

    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;

        fetchNotifications();
        requestNotificationPermission();

        // Suscribirse a cambios en tiempo real en la tabla de notificaciones para el usuario actual con un canal único
        const channelId = `user-notifications-${user.id}-${Math.random().toString(36).substring(2, 9)}`;
        console.log(`[REALTIME] Intentando suscribir al canal '${channelId}' para el usuario:`, user.username, "ID:", user.id);
        
        const channel = supabase
            .channel(channelId)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('[REALTIME] ¡Nueva notificación recibida en tiempo real!', payload);
                    const newNotif = payload.new;
                    setNotifications((prev) => [newNotif, ...prev]);
                    
                    // 1. Mostrar toast visual dentro de la app (Web o la APK)
                    toast.info(newNotif.title, {
                        description: newNotif.message,
                        duration: 6000,
                        action: {
                            label: 'Ver Pedido',
                            onClick: () => {
                                setIsOpen(true);
                                navigate('/seguimiento-pedidos');
                            }
                        }
                    });

                    // 2. Enviar notificación a la barra de notificaciones del sistema
                    showSystemNotification(newNotif.title, newNotif.message, newNotif.pedido_id);
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

    // Cerrar dropdown al hacer click afuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleMarkAsRead = async (id, e) => {
        e.stopPropagation();
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

    const handleNotificationClick = (notification) => {
        if (!notification.read) {
            api.put(`/api/notifications/${notification.id}/read`)
                .then(() => {
                    setNotifications(prev =>
                        prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
                    );
                })
                .catch(err => console.error(err));
        }
        setIsOpen(false);
        if (notification.pedido_id) {
            navigate('/seguimiento-pedidos');
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 relative group focus:outline-none"
                title="Notificaciones"
            >
                <Bell className="w-5 h-5 group-hover:rotate-12 transition-transform duration-200" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-blue-900 animate-pulse">
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-200/80 shadow-2xl z-50 overflow-hidden text-gray-900 animate-in fade-in slide-in-from-top-3 duration-200">
                    {/* Header */}
                    <div className="px-4 py-3 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">Notificaciones</span>
                            {unreadCount > 0 && (
                                <span className="bg-red-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                    {unreadCount} nuevas
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllAsRead}
                                className="text-xs text-blue-100 hover:text-white hover:underline font-medium transition-all"
                            >
                                Marcar todo leído
                            </button>
                        )}
                    </div>

                    {/* Lista de Notificaciones */}
                    <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-100 bg-white/80">
                        {notifications.length === 0 ? (
                            <div className="py-8 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
                                <Bell className="w-8 h-8 text-gray-300" />
                                <span className="text-xs font-semibold">No tienes notificaciones</span>
                            </div>
                        ) : (
                            notifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className={`p-4 flex gap-3 cursor-pointer hover:bg-blue-50/50 transition-all duration-150 relative ${
                                        !notif.read ? 'bg-blue-50/20 font-medium' : ''
                                    }`}
                                >
                                    {!notif.read && (
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                                    )}
                                    
                                    <div className="flex-grow pl-1">
                                        <div className="flex justify-between items-start">
                                            <span className={`text-xs font-bold text-gray-800 ${!notif.read ? 'text-blue-900' : ''}`}>
                                                {notif.title}
                                            </span>
                                            <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                                                {new Date(notif.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                            {notif.message}
                                        </p>
                                    </div>

                                    {!notif.read && (
                                        <div className="flex items-center">
                                            <button
                                                onClick={(e) => handleMarkAsRead(notif.id, e)}
                                                className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                                title="Marcar como leída"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex justify-center">
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                navigate('/seguimiento-pedidos');
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 font-bold transition-all"
                        >
                            Ir a Seguimiento de Pedidos
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;

