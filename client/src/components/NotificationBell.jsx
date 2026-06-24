import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useNotifications } from '../context/NotificationContext';

const NotificationBell = () => {
    const {
        notifications,
        unreadCount,
        browserPermission,
        handleEnableWebNotifications,
        handleMarkAsRead,
        handleMarkAllAsRead,
        handleNotificationClick
    } = useNotifications();

    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

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

                    {/* Banner de Permiso de Notificaciones en Web */}
                    {!Capacitor.isNativePlatform() && 'Notification' in window && browserPermission !== 'granted' && (
                        <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex flex-col gap-1.5">
                            <p className="text-[11px] text-blue-800 leading-normal font-medium">
                                {browserPermission === 'denied' 
                                    ? '⚠️ Las notificaciones de escritorio están desactivadas en tu navegador. Habilítalas en el candado de la barra de dirección.' 
                                    : '🔔 Activa las notificaciones en el navegador para enterarte al instante de nuevos pedidos.'}
                            </p>
                            {browserPermission !== 'denied' && (
                                <button
                                    onClick={handleEnableWebNotifications}
                                    className="w-full text-center py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-all duration-200 shadow-sm"
                                >
                                    Activar Notificaciones de Escritorio
                                </button>
                            )}
                        </div>
                    )}

                    {/* Lista de Notificaciones */}
                    <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-100 bg-white/80">
                        {notifications.length === 0 ? (
                            <div className="py-8 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
                                <Bell className="w-8 h-8 text-gray-300" />
                                <span className="text-xs font-semibold">No tienes notificaciones</span>
                            </div>
                        ) : (
                            notifications.map((notif) => {
                                const isRedAlert = notif.type === 'pedido_fecha_reprogramada' || notif.type === 'pedido_anulado';
                                return (
                                    <div
                                        key={notif.id}
                                        onClick={() => handleNotificationClick(notif, () => setIsOpen(false))}
                                        className={`p-4 flex gap-3 cursor-pointer transition-all duration-150 relative border-l-4 ${
                                            isRedAlert 
                                                ? (!notif.read ? 'bg-rose-50/60 hover:bg-rose-100/60 border-rose-500 font-semibold' : 'bg-white hover:bg-rose-50/30 border-rose-300')
                                                : (!notif.read ? 'bg-blue-50/20 hover:bg-blue-50/50 border-blue-500 font-medium' : 'bg-white hover:bg-gray-50 border-transparent')
                                        }`}
                                    >
                                        {!notif.read && (
                                            <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                                                isRedAlert ? 'bg-rose-600 animate-pulse' : 'bg-blue-600'
                                            }`}></span>
                                        )}
                                        
                                        <div className="flex-grow pl-1">
                                            <div className="flex justify-between items-start">
                                                <span className={`text-xs font-bold ${
                                                    isRedAlert 
                                                        ? 'text-rose-800' 
                                                        : (!notif.read ? 'text-blue-900' : 'text-gray-800')
                                                }`}>
                                                    {notif.title}
                                                </span>
                                                <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                                                    {new Date(notif.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className={`text-xs mt-1 leading-relaxed ${
                                                isRedAlert ? 'text-rose-950 font-medium' : 'text-gray-600'
                                            }`}>
                                                {notif.message}
                                            </p>
                                        </div>

                                        {!notif.read && (
                                            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
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
                                );
                            })
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
