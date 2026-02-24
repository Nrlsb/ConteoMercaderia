import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const SettingsPage = () => {
    const { countMode, setCountMode } = useSettings();
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const [versionData, setVersionData] = useState({ version: '', downloadUrl: '', releaseNotes: '' });
    const [isSavingVersion, setIsSavingVersion] = useState(false);

    useEffect(() => {
        if (user?.role === 'superadmin') {
            fetchVersionData();
        }
    }, [user]);

    const fetchVersionData = async () => {
        try {
            const response = await fetch('/api/app-version');
            if (response.ok) {
                const data = await response.json();
                setVersionData({
                    version: data.version || '',
                    downloadUrl: data.downloadUrl || '',
                    releaseNotes: data.releaseNotes || ''
                });
            }
        } catch (error) {
            console.error('Error fetching version data:', error);
        }
    };

    const handleUpdateVersion = async (e) => {
        e.preventDefault();
        setIsSavingVersion(true);
        try {
            const response = await fetch('/api/app-version', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': token
                },
                body: JSON.stringify(versionData)
            });

            if (response.ok) {
                toast.success('Versión pública actualizada correctamente');
            } else {
                const errData = await response.json();
                toast.error(`Error: ${errData.message || 'No se pudo actualizar la versión'}`);
            }
        } catch (error) {
            console.error('Error updating version:', error);
            toast.error('Error de red al actualizar la versión');
        } finally {
            setIsSavingVersion(false);
        }
    };

    if (user?.role !== 'admin' && user?.role !== 'superadmin') {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                No tienes permisos para acceder a esta configuración.
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto bg-white md:p-8 p-4 rounded-xl shadow-md my-8 border border-gray-200">
            <h1 className="text-2xl font-bold mb-6 text-brand-dark border-b pb-4">Configuración del Sistema</h1>

            <div className="space-y-6">

                {/* Count Mode Section */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800 mb-2">Modo de Conteo</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Define cómo se cargan los conteos en el escáner principal.
                    </p>

                    <div className="flex flex-col md:flex-row gap-4">
                        <button
                            onClick={() => setCountMode('pre_remito')}
                            className={`flex-1 p-4 rounded-lg border-2 transition text-left flex items-start gap-3 ${countMode === 'pre_remito'
                                ? 'border-brand-blue bg-blue-50 ring-1 ring-brand-blue'
                                : 'border-gray-200 hover:border-blue-300'
                                }`}
                        >
                            <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center ${countMode === 'pre_remito' ? 'border-brand-blue' : 'border-gray-400'
                                }`}>
                                {countMode === 'pre_remito' && <div className="w-2.5 h-2.5 rounded-full bg-brand-blue" />}
                            </div>
                            <div>
                                <span className={`block font-bold ${countMode === 'pre_remito' ? 'text-brand-blue' : 'text-gray-700'}`}>
                                    Desde Carga (Conteo Específico)
                                </span>
                                <span className="text-sm text-gray-500 mt-1">
                                    Requiere cargar un pedido/lista antes de escanear. Valida cantidades esperadas.
                                </span>
                            </div>
                        </button>

                        <button
                            onClick={() => setCountMode('products')}
                            className={`flex-1 p-4 rounded-lg border-2 transition text-left flex items-start gap-3 ${countMode === 'products'
                                ? 'border-brand-blue bg-blue-50 ring-1 ring-brand-blue'
                                : 'border-gray-200 hover:border-blue-300'
                                }`}
                        >
                            <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center ${countMode === 'products' ? 'border-brand-blue' : 'border-gray-400'
                                }`}>
                                {countMode === 'products' && <div className="w-2.5 h-2.5 rounded-full bg-brand-blue" />}
                            </div>
                            <div>
                                <span className={`block font-bold ${countMode === 'products' ? 'text-brand-blue' : 'text-gray-700'}`}>
                                    General (Tabla SB2)
                                </span>
                                <span className="text-sm text-gray-500 mt-1">
                                    Escaneo libre contra la base de datos de productos (SB2). Sin cantidades pre-definidas.
                                </span>
                            </div>
                        </button>
                    </div>
                </div>

                {/* App Version Management */}
                {user?.role === 'superadmin' && (
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mt-6">
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">Versión Pública de la App</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Modifica la versión que los usuarios de la aplicación verán para ser notificados de una actualización.
                        </p>

                        <form onSubmit={handleUpdateVersion} className="space-y-4">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Versión (ej: 1.0.0)</label>
                                    <input
                                        type="text"
                                        value={versionData.version}
                                        onChange={(e) => setVersionData({ ...versionData, version: e.target.value })}
                                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-blue"
                                        required
                                        placeholder="1.0.0"
                                    />
                                </div>
                                <div className="flex-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">URL de Descarga</label>
                                    <input
                                        type="text"
                                        value={versionData.downloadUrl}
                                        onChange={(e) => setVersionData({ ...versionData, downloadUrl: e.target.value })}
                                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-blue"
                                        required
                                        placeholder="/apk/ConteoMercaderia.apk"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notas de la Versión</label>
                                <textarea
                                    value={versionData.releaseNotes}
                                    onChange={(e) => setVersionData({ ...versionData, releaseNotes: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-blue resize-none"
                                    rows="3"
                                    placeholder="Mejoras y correcciones en esta versión..."
                                />
                            </div>
                            <div>
                                <button
                                    type="submit"
                                    disabled={isSavingVersion}
                                    className={`px-4 py-2 font-bold rounded text-white ${isSavingVersion ? 'bg-gray-400' : 'bg-brand-blue hover:bg-blue-600'} transition`}
                                >
                                    {isSavingVersion ? 'Guardando...' : 'Publicar Versión'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

            </div>

            <div className="mt-8 flex justify-end">
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded hover:bg-gray-300 transition"
                >
                    Volver al Inicio
                </button>
            </div>
        </div>
    );
};

export default SettingsPage;
