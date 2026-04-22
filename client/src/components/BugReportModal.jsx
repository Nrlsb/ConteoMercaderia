import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { X, Bug, MessageSquare, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BugReportModal = ({ isOpen, onClose, initialData = null }) => {
    const { token } = useAuth();
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [appVersion, setAppVersion] = useState('unknown');

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const response = await axios.get('/api/app-version');
                setAppVersion(response.data.version);
            } catch (err) {
                console.error('Error fetching version for report:', err);
            }
        };
        fetchVersion();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!description.trim()) {
            toast.error('Por favor, describe el problema');
            return;
        }

        setLoading(true);
        try {
            const reportBody = {
                description,
                errorData: initialData || {},
                pageUrl: window.location.href,
                userAgent: navigator.userAgent,
                appVersion: appVersion
            };

            await axios.post('/api/reports', reportBody, {
                headers: { 'x-auth-token': token }
            });

            toast.success('Reporte enviado correctamente. ¡Gracias por ayudarnos a mejorar!');
            setDescription('');
            onClose();
        } catch (error) {
            console.error('Error sending report:', error);
            toast.error('Hubo un error al enviar el reporte. Por favor, intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
                {/* Header Fijo */}
                <div className="bg-blue-600 p-5 flex justify-between items-center text-white shrink-0 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <Bug className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold leading-tight">Reportar un Error</h2>
                            <p className="text-blue-100/70 text-[10px] uppercase tracking-widest font-semibold italic">Mejoras Continuas</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-full transition-all active:scale-90"
                    >
                        <X className="w-6 h-6 text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                </div>
                
                {/* Cuerpo con Scroll */}
                <div className="overflow-y-auto flex-grow">
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-blue-600" />
                                ¿Qué sucedió?
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe el error o comportamiento inesperado..."
                                className="w-full min-h-[160px] p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none resize-none text-gray-800 text-sm leading-relaxed"
                                autoFocus
                            />
                        </div>

                        <div className="bg-blue-50/80 p-4 rounded-2xl border border-blue-100/50 flex gap-3">
                            <div className="shrink-0 p-1.5 bg-blue-100 rounded-lg h-fit">
                                <Bug className="w-4 h-4 text-blue-600" />
                            </div>
                            <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                                Capturaremos automáticamente información técnica para ayudarnos a identificar el problema rápido.
                            </p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-4 px-4 bg-gray-50 text-gray-600 font-bold rounded-2xl hover:bg-gray-100 active:scale-95 transition-all border border-gray-200 text-[10px] uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 py-4 px-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 text-[10px] uppercase tracking-widest"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Enviar
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default BugReportModal;
