import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../api';
import BranchesManage from './BranchesManage';
import UsersManage from './UsersManage';

const SettingsPage = () => {
    const [activeTab, setActiveTab] = useState('general'); // 'general', 'branches', 'users'
    const { user } = useAuth();
    const navigate = useNavigate();

    const [versionData, setVersionData] = useState({ version: '', downloadUrl: '', releaseNotes: '' });
    const [isSavingVersion, setIsSavingVersion] = useState(false);
    const [scannerTorchDefault, setScannerTorchDefault] = useState(() => localStorage.getItem('scanner_torch_default') === 'true');

    const [syncStatus, setSyncStatus] = useState({
        running: false,
        processed: 0,
        total: 0,
        updated: 0,
        notFound: 0,
        errors: 0,
        startTime: null,
        endTime: null,
        errorMsg: null
    });
    const [isCheckingSync, setIsCheckingSync] = useState(false);

    const fetchSyncStatus = async () => {
        try {
            const response = await api.get('/api/products/sync-from-protheus/status');
            setSyncStatus(response.data);
            return response.data;
        } catch (error) {
            console.error('Error al obtener estado de sincronización:', error);
        }
    };

    // Polling si está corriendo
    useEffect(() => {
        let intervalId;
        
        fetchSyncStatus().then(status => {
            if (status?.running) {
                intervalId = setInterval(async () => {
                    const currentStatus = await fetchSyncStatus();
                    if (currentStatus && !currentStatus.running) {
                        clearInterval(intervalId);
                        toast.success('¡Sincronización finalizada con éxito!');
                    }
                }, 3000);
            }
        });

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, []);

    // Iniciar sincronización
    const handleStartSync = async () => {
        setIsCheckingSync(true);
        try {
            const response = await api.post('/api/products/sync-from-protheus');
            setSyncStatus(response.data.status);
            toast.info('Sincronización iniciada en segundo plano');
            
            // Iniciar polling
            const intervalId = setInterval(async () => {
                const currentStatus = await fetchSyncStatus();
                if (currentStatus && !currentStatus.running) {
                    clearInterval(intervalId);
                    toast.success('¡Sincronización finalizada con éxito!');
                }
            }, 3000);
            
            return () => clearInterval(intervalId);
        } catch (error) {
            console.error('Error al iniciar sincronización:', error);
            const errMessage = error.response?.data?.message || 'Error de red al iniciar la sincronización';
            toast.error(`Error: ${errMessage}`);
        } finally {
            setIsCheckingSync(false);
        }
    };

    useEffect(() => {
        if (user?.role === 'superadmin') {
            fetchVersionData();
        }
    }, [user]);

    const fetchVersionData = async () => {
        try {
            const response = await api.get('/api/app-version');
            const data = response.data;
            setVersionData({
                version: data.version || '',
                downloadUrl: data.downloadUrl || '',
                releaseNotes: data.releaseNotes || ''
            });
        } catch (error) {
            console.error('Error fetching version data:', error);
        }
    };

    const handleUpdateVersion = async (e) => {
        e.preventDefault();
        setIsSavingVersion(true);
        try {
            await api.put('/api/app-version', versionData);
            toast.success('Versión pública actualizada correctamente');
        } catch (error) {
            console.error('Error updating version:', error);
            const errMessage = error.response?.data?.message || 'Error de red al actualizar la versión';
            toast.error(`Error: ${errMessage}`);
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

            {/* Tabs Navigation */}
            <div className="flex border-b mb-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <button
                    className={`px-4 py-2 font-semibold flex-shrink-0 ${activeTab === 'general' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}
                    onClick={() => setActiveTab('general')}
                >
                    General
                </button>
                <button
                    className={`px-4 py-2 font-semibold flex-shrink-0 ${activeTab === 'branches' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}
                    onClick={() => setActiveTab('branches')}
                >
                    Sucursales
                </button>
                <button
                    className={`px-4 py-2 font-semibold flex-shrink-0 ${activeTab === 'users' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}
                    onClick={() => setActiveTab('users')}
                >
                    Usuarios
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'general' && (
                <div className="space-y-6">
                    {/* Scanner Settings */}
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-6">
                        <h2 className="text-lg font-semibold text-blue-900 mb-2 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path><line x1="7" y1="12" x2="17" y2="12"></line></svg>
                            Configuración del Escáner
                        </h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-800">Linterna por defecto</p>
                                <p className="text-xs text-blue-600">Encender automáticamente al abrir el escáner.</p>
                            </div>
                            <button
                                onClick={() => {
                                    const newValue = !scannerTorchDefault;
                                    setScannerTorchDefault(newValue);
                                    localStorage.setItem('scanner_torch_default', newValue.toString());
                                    toast.success(newValue ? 'Linterna automática activada' : 'Linterna automática desactivada');
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${scannerTorchDefault ? 'bg-blue-600' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scannerTorchDefault ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Sincronización de Productos con Protheus */}
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 mb-6">
                        <h2 className="text-lg font-semibold text-purple-900 mb-2 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={syncStatus.running ? "animate-spin text-purple-700" : "text-purple-700"}><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            Sincronización con Protheus
                        </h2>
                        <p className="text-xs text-purple-700 mb-4">
                            Actualiza la descripción, precios de costo, marcas y capacidad de todos los productos desde el catálogo de Protheus de forma masiva en segundo plano.
                        </p>

                        {syncStatus.running ? (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm font-medium text-purple-900">
                                    <span>Sincronizando catálogo...</span>
                                    <span>{syncStatus.processed} / {syncStatus.total}</span>
                                </div>
                                <div className="w-full bg-purple-200 rounded-full h-2.5">
                                    <div 
                                        className="bg-purple-600 h-2.5 rounded-full transition-all duration-500" 
                                        style={{ width: `${syncStatus.total ? (syncStatus.processed / syncStatus.total) * 100 : 0}%` }}
                                    ></div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs text-center mt-2">
                                    <div className="bg-purple-100 p-2 rounded text-purple-800">
                                        <div className="font-bold text-sm">{syncStatus.updated}</div>
                                        <div>Actualizados</div>
                                    </div>
                                    <div className="bg-yellow-100 p-2 rounded text-yellow-800">
                                        <div className="font-bold text-sm">{syncStatus.notFound}</div>
                                        <div>No Encontrados</div>
                                    </div>
                                    <div className="bg-red-100 p-2 rounded text-red-800">
                                        <div className="font-bold text-sm">{syncStatus.errors}</div>
                                        <div>Errores</div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {syncStatus.endTime && (
                                    <div className="text-xs text-purple-800 bg-purple-100/50 p-3 rounded-lg border border-purple-200/50">
                                        <p className="font-semibold mb-1">Última sincronización finalizada:</p>
                                        <ul className="list-disc list-inside space-y-0.5">
                                            <li>Total evaluados: <span className="font-semibold">{syncStatus.total}</span></li>
                                            <li>Sincronizados con éxito: <span className="font-semibold text-green-700">{syncStatus.updated}</span></li>
                                            <li>No encontrados: <span className="font-semibold text-yellow-700">{syncStatus.notFound}</span></li>
                                            <li>Errores: <span className="font-semibold text-red-600">{syncStatus.errors}</span></li>
                                            {syncStatus.errorMsg && <li className="text-red-600 font-bold">Fallo crítico: {syncStatus.errorMsg}</li>}
                                        </ul>

                                        {syncStatus.notFoundProducts && syncStatus.notFoundProducts.length > 0 && (
                                            <details className="mt-3 bg-white p-2.5 rounded border border-purple-200 cursor-pointer">
                                                <summary className="font-semibold text-purple-900 focus:outline-none">
                                                    Ver productos no encontrados ({syncStatus.notFoundProducts.length})
                                                </summary>
                                                <div className="mt-2 max-h-36 overflow-y-auto space-y-1.5 pr-1 text-[11px] font-mono">
                                                    {syncStatus.notFoundProducts.map((p, idx) => (
                                                        <div key={idx} className="flex justify-between border-b pb-1 last:border-b-0 border-purple-50">
                                                            <span className="font-bold text-purple-950">{p.code}</span>
                                                            <span className="text-gray-600 truncate max-w-[220px]" title={p.description}>{p.description}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        )}

                                        {syncStatus.failedProducts && syncStatus.failedProducts.length > 0 && (
                                            <details className="mt-2 bg-white p-2.5 rounded border border-red-200 cursor-pointer">
                                                <summary className="font-semibold text-red-900 focus:outline-none">
                                                    Ver productos con error ({syncStatus.failedProducts.length})
                                                </summary>
                                                <div className="mt-2 max-h-36 overflow-y-auto space-y-1.5 pr-1 text-[11px] font-mono">
                                                    {syncStatus.failedProducts.map((p, idx) => (
                                                        <div key={idx} className="border-b pb-1 last:border-b-0 border-red-50">
                                                            <div className="flex justify-between">
                                                                <span className="font-bold text-red-950">{p.code}</span>
                                                                <span className="text-gray-600 truncate max-w-[220px]" title={p.description}>{p.description}</span>
                                                            </div>
                                                            <div className="text-[10px] text-red-600 mt-0.5">{p.error}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                )}
                                <button
                                    onClick={handleStartSync}
                                    disabled={isCheckingSync}
                                    className={`w-full py-2.5 px-4 rounded-lg font-bold text-white shadow transition-all ${
                                        isCheckingSync ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 active:scale-95'
                                    }`}
                                >
                                    {isCheckingSync ? 'Iniciando...' : 'Iniciar Sincronización Masiva'}
                                </button>
                            </div>
                        )}
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
            )}
            {activeTab === 'branches' && <BranchesManage />}
            {activeTab === 'users' && <UsersManage />}

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
