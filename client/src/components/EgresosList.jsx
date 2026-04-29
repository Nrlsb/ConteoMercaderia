import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { db } from '../db';

// IndexedDB helpers for persisting directory handle across page reloads
const openFolderDB = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('egreso_folder_db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
});
const saveFolderHandle = async (handle) => {
    const db = await openFolderDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'egreso_folder');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
};
const loadFolderHandle = async () => {
    const db = await openFolderDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('egreso_folder');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
};
const clearFolderHandle = async () => {
    const db = await openFolderDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete('egreso_folder');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
};

const EgresosList = () => {
    const { user } = useAuth();
    const [egresos, setEgresos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'open', 'finalized'
    const [destinationFilter, setDestinationFilter] = useState('all'); // 'all', 'branch', 'client'
    const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'normal', 'transfer', 'return'
    const fileInputRef = useRef(null);

    // Folder watcher state
    const [folderName, setFolderName] = useState(null);
    const [watching, setWatching] = useState(false);
    const [watcherProgress, setWatcherProgress] = useState(null); // { fileName, percent, current, total }
    const [needsPermission, setNeedsPermission] = useState(false);
    const [showFolderGuide, setShowFolderGuide] = useState(false);
    const [failedFiles, setFailedFiles] = useState([]); // Track files that failed in the current session
    const [visibleCount, setVisibleCount] = useState(20); // Limit display to 20 initially
    const dirHandleRef = useRef(null);
    const watchIntervalRef = useRef(null);
    const checkingRef = useRef(false); // Lock to prevent concurrent checkFolder runs
    const processedFilesRef = useRef(new Set(
        JSON.parse(localStorage.getItem('egreso_processed_files') || '[]')
    ));
    const [detectionStats, setDetectionStats] = useState({ total: 0, ignored: 0 });

    // Access control
    const canAccessEgresos = user?.role === 'superadmin' || user?.role === 'admin' || user?.sucursal_name === 'Deposito' || user?.permissions?.includes('tab_egresos');
    const canUploadPdf = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || user?.permissions?.includes('upload_egresos');
    const canDelete = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || user?.permissions?.includes('delete_egresos');
    const canFinalize = user?.role === 'superadmin' || user?.role === 'admin';

    const fetchEgresos = useCallback(async () => {
        try {
            const response = await api.get('/api/egresos');
            setEgresos(response.data);
            
            // Non-blocking cache update
            db.offline_caches.put({
                id: 'egresos_list',
                data: response.data,
                timestamp: Date.now()
            }).catch(err => console.error('Error caching egresos:', err));

        } catch (error) {
            console.error('Error fetching egresos:', error);
            // Try to load from IndexedDB cache
            try {
                const cache = await db.offline_caches.get('egresos_list');
                if (cache) {
                    setEgresos(cache.data);
                    toast.info('Mostrando datos offline');
                } else {
                    toast.error('Error al cargar los egresos');
                }
            } catch (cacheError) {
                console.error('Cache read error:', cacheError);
                toast.error('Error al cargar los egresos');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEgresos();
    }, [fetchEgresos]);

    // Global refresh polling (every 30 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            fetchEgresos();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchEgresos]);

    // Reset visible count when search or filter changes
    useEffect(() => {
        setVisibleCount(20);
    }, [search, statusFilter, destinationFilter, typeFilter]);

    // Auto-clear cache at 8 PM (20:00)
    useEffect(() => {
        const checkAutoClear = () => {
            const now = new Date();
            const hours = now.getHours();
            const today = now.toISOString().split('T')[0];
            const lastClearDay = localStorage.getItem('egreso_last_auto_clear');

            if (hours >= 20 && lastClearDay !== today) {
                console.log('[Carpeta Auto] Limpieza programada de las 20:00 hs ejecutándose');
                processedFilesRef.current = new Set();
                localStorage.setItem('egreso_processed_files', '[]');
                localStorage.setItem('egreso_last_auto_clear', today);
                setFailedFiles([]); // Clear failures too
                toast.info('Historial de archivos limpiado (Programado 20:00 hs)');
            }
        };

        const timer = setInterval(checkAutoClear, 60000); // Check every minute
        checkAutoClear(); // Check immediately on mount
        return () => clearInterval(timer);
    }, []);

    // --- Folder Watcher Logic ---

    const checkFolder = useCallback(async () => {
        if (!dirHandleRef.current) return;
        // Lock: prevent concurrent runs (avoids double-upload race condition)
        if (checkingRef.current) return;
        checkingRef.current = true;
        try {
            const permission = await dirHandleRef.current.queryPermission({ mode: 'read' });
            if (permission !== 'granted') {
                setNeedsPermission(true);
                setWatching(false);
                if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
                return;
            }

            const newFiles = [];
            let totalPdfs = 0;
            let ignoredCount = 0;

            for await (const [name, handle] of dirHandleRef.current.entries()) {
                if (handle.kind !== 'file') continue;
                if (!name.toLowerCase().endsWith('.pdf')) continue;

                totalPdfs++;

                const file = await handle.getFile();
                const fileKey = `${name}_${file.size}_${file.lastModified}`;
                
                if (processedFilesRef.current.has(fileKey)) {
                    ignoredCount++;
                    continue;
                }
                
                // Esperar 2 segundos para verificar estabilidad
                await new Promise(r => setTimeout(r, 2000));
                const fileAfterWait = await handle.getFile();
                if (file.size !== fileAfterWait.size) continue;

                newFiles.push({ name, file: fileAfterWait, fileKey });
            }

            setDetectionStats({ total: totalPdfs, ignored: ignoredCount });

            for (let i = 0; i < newFiles.length; i++) {
                const { name, file, fileKey } = newFiles[i];
                setWatcherProgress({ fileName: name, percent: 0, current: i + 1, total: newFiles.length });
                try {
                    const formData = new FormData();
                    formData.append('pdf', file);
                    const response = await api.post('/api/egresos/upload-pdf', formData, {
                        onUploadProgress: (evt) => {
                            const percent = evt.total ? Math.round((evt.loaded * 100) / evt.total) : 50;
                            setWatcherProgress(prev => prev ? { ...prev, percent } : null);
                        }
                    });
                    const { results } = response.data;
                    processedFilesRef.current.add(fileKey);
                    const allKeys = [...processedFilesRef.current];
                    if (allKeys.length > 1000) {
                        processedFilesRef.current = new Set(allKeys.slice(-1000));
                    }
                    localStorage.setItem('egreso_processed_files', JSON.stringify([...processedFilesRef.current]));

                    toast.success(`"${name}" → ${results.success.length} productos cargados${results.failed.length > 0 ? `, ${results.failed.length} no encontrados` : ''}`);
                    fetchEgresos();
                } catch (error) {
                    const msg = error.response?.data?.message || 'Error al procesar';
                    const isDuplicate = msg.includes('ya fue cargado previamente') || error.response?.data?.duplicateId;

                    console.error(`[Carpeta Auto] Error en "${name}":`, msg);
                    
                    // Siempre marcamos como procesado para evitar bucles infinitos cada 30 segundos,
                    // incluso si hay un error (el usuario puede reintentar manualmente).
                    processedFilesRef.current.add(fileKey);
                    const allKeys = [...processedFilesRef.current];
                    if (allKeys.length > 1000) {
                        processedFilesRef.current = new Set(allKeys.slice(-1000));
                    }
                    localStorage.setItem('egreso_processed_files', JSON.stringify([...processedFilesRef.current]));

                    if (isDuplicate) {
                        // Limpiamos de la lista de errores si estaba
                        setFailedFiles(prev => prev.filter(f => f.fileKey !== fileKey));
                        toast.info(`"${name}" ya estaba cargado. Omitiendo.`);
                    } else {
                        toast.error(`Error en "${name}": ${msg}`);
                        setFailedFiles(prev => [{ name, error: msg, time: new Date(), fileKey }, ...prev].slice(0, 20));
                    }
                }
            }
        } catch (err) {
            console.error('Error checking folder:', err);
            if (err.name === 'NotAllowedError') {
                setNeedsPermission(true);
                setWatching(false);
                if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
            }
        } finally {
            checkingRef.current = false;
            setWatcherProgress(null);
        }
    }, [fetchEgresos]);

    const startWatcher = useCallback((handle) => {
        dirHandleRef.current = handle;
        if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
        watchIntervalRef.current = setInterval(() => {
            checkFolder();
        }, 30000);
        setWatching(true);
        setNeedsPermission(false);
    }, [checkFolder]);

    const connectFolder = async () => {
        if (!('showDirectoryPicker' in window)) {
            toast.error('Tu navegador no soporta esta función. Usá Chrome o Edge.');
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'read' });
            await saveFolderHandle(handle);
            startWatcher(handle);
            setFolderName(handle.name);
            toast.success(`Carpeta "${handle.name}" conectada. Revisando cada 30 segundos.`);
            checkFolder(); // Check immediately
        } catch (err) {
            if (err.name !== 'AbortError') {
                toast.error('No se pudo conectar la carpeta');
            }
        }
    };

    const requestPermissionAgain = async () => {
        if (!dirHandleRef.current) return;
        try {
            const result = await dirHandleRef.current.requestPermission({ mode: 'read' });
            if (result === 'granted') {
                startWatcher(dirHandleRef.current);
                toast.success('Permiso restaurado. Carpeta activa.');
                checkFolder();
            } else {
                toast.error('No se otorgó permiso a la carpeta');
            }
        } catch (err) {
            toast.error('Error al solicitar permiso');
        }
    };

    const disconnectFolder = async () => {
        if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
        watchIntervalRef.current = null;
        dirHandleRef.current = null;
        setFolderName(null);
        setWatching(false);
        setNeedsPermission(false);
        await clearFolderHandle();
        toast.info('Carpeta desconectada');
    };

    const clearProcessedHistory = () => {
        if (!window.confirm('¿Deseas limpiar el historial de archivos vistos? Se volverán a procesar todos los archivos actuales de la carpeta.')) return;
        processedFilesRef.current = new Set();
        localStorage.setItem('egreso_processed_files', '[]');
        setDetectionStats({ total: 0, ignored: 0 });
        setFailedFiles([]);
        toast.success('Historial limpiado. Re-escaneando...');
        checkFolder();
    };

    const retryFailedFile = (fileKey) => {
        if (!fileKey) return;
        processedFilesRef.current.delete(fileKey);
        localStorage.setItem('egreso_processed_files', JSON.stringify([...processedFilesRef.current]));
        setFailedFiles(prev => prev.filter(f => f.fileKey !== fileKey));
        toast.info('Reintentando archivo...');
        checkFolder();
    };

    // Restore folder handle from IndexedDB on mount
    useEffect(() => {
        const restoreFolder = async () => {
            try {
                const handle = await loadFolderHandle();
                if (!handle) return;
                dirHandleRef.current = handle;
                setFolderName(handle.name);
                const permission = await handle.queryPermission({ mode: 'read' });
                if (permission === 'granted') {
                    startWatcher(handle);
                } else {
                    // Permission must be re-requested on user gesture — show a prompt button
                    setNeedsPermission(true);
                }
            } catch (err) {
                console.error('Error restoring folder handle:', err);
            }
        };
        restoreFolder();
        return () => {
            if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
        };
    }, [startWatcher]);

    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.name.toLowerCase().endsWith('.pdf')) {
                    toast.error(`"${file.name}" omitido: Solo se permiten archivos PDF`);
                    continue;
                }

                setUploadProgress(`Procesando ${i + 1}/${files.length}: ${file.name}`);

                try {
                    const formData = new FormData();
                    formData.append('pdf', file);

                    const response = await api.post('/api/egresos/upload-pdf', formData);

                    const { results } = response.data;
                    if (results.success.length > 0) {
                        toast.success(`"${file.name}" → Egreso creado: ${results.success.length} productos cargados`);
                    }
                    if (results.failed.length > 0) {
                        toast.warning(`"${file.name}" → ${results.failed.length} productos no encontrados`);
                    }
                } catch (error) {
                    console.error(`Error uploading PDF ${file.name}:`, error);
                    const msg = error.response?.data?.message || `Error al procesar "${file.name}"`;
                    const isDuplicate = msg.includes('ya fue cargado previamente') || error.response?.data?.duplicateId;
                    
                    if (isDuplicate) {
                        toast.info(`"${file.name}" ya estaba cargado. Omitiendo.`);
                    } else {
                        toast.error(msg);
                        setFailedFiles(prev => [{ name: file.name, error: msg, time: new Date() }, ...prev].slice(0, 20));
                    }
                }
            }
            fetchEgresos();
        } finally {
            setUploading(false);
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFinalize = async (id) => {
        if (!window.confirm('¿Está seguro de que desea dar por finalizado este remito? Todas las cantidades se marcarán como completas.')) return;
        try {
            await api.put(`/api/egresos/${id}/finalize`);
            toast.success('Remito finalizado y cantidades completadas');
            fetchEgresos();
        } catch (error) {
            console.error('Error finalizing egreso:', error);
            toast.error(error.response?.data?.message || 'Error al finalizar el egreso');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Está seguro de que desea eliminar este egreso?')) return;
        try {
            await api.delete(`/api/egresos/${id}`);
            toast.success('Egreso eliminado correctamente');
            fetchEgresos();
        } catch (error) {
            console.error('Error deleting egreso:', error);
            toast.error('Error al eliminar el egreso');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center py-20 animate-in fade-in duration-700">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 bg-blue-50 rounded-full"></div>
                    </div>
                </div>
                <h2 className="mt-6 text-lg font-semibold text-gray-600 tracking-wide">Cargando Egresos...</h2>
                <p className="text-sm text-gray-400 mt-2">Estamos preparando todo para vos</p>
            </div>
        );
    }
    if (!canAccessEgresos) return <Navigate to="/" replace />;

    const searchTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const filteredEgresos = egresos.filter(e => {
        // First filter by status if not 'all'
        if (statusFilter === 'open' && e.status === 'finalized') return false;
        if (statusFilter === 'finalized' && e.status !== 'finalized') return false;

        // Filter by destination
        if (destinationFilter === 'branch' && e.sucursal_name === 'Deposito') return false;
        if (destinationFilter === 'client' && e.sucursal_name !== 'Deposito') return false;

        // Filter by type
        if (typeFilter === 'normal' && (e.is_transferencia || e.is_devolucion)) return false;
        if (typeFilter === 'transfer' && !e.is_transferencia) return false;
        if (typeFilter === 'return' && !e.is_devolucion) return false;

        // Then filter by search terms
        if (searchTerms.length === 0) return true;

        const ref = (e.reference_number || '').toLowerCase();
        const pdf = (e.pdf_filename || '').toLowerCase();
        const createdBy = (e.created_by || '').toLowerCase();
        const sucursal = (e.sucursal_name || '').toLowerCase();
        const status = e.status === 'finalized' ? 'finalizado' : 'abierto';
        
        return searchTerms.every(term =>
            ref.includes(term) || pdf.includes(term) || createdBy.includes(term) || status.includes(term) || sucursal.includes(term)
        );
    });

    const displayedEgresos = filteredEgresos.slice(0, visibleCount);

    return (
        <div className="container mx-auto p-4 max-w-lg md:max-w-6xl">
            <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-4 sm:p-5 border border-gray-100 shadow-sm mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1">
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Egreso de Mercadería</h1>
                        <p className="text-sm text-gray-500 font-medium">Gestioná tus remitos y cargas automáticas</p>
                    </div>
                    {canUploadPdf && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full md:w-auto">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                                id="pdf-upload"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="group relative overflow-hidden bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 disabled:opacity-50"
                            >
                                <div className="absolute inset-0 bg-linear-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                {uploading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span className="truncate max-w-[150px]">{uploadProgress}</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                        </svg>
                                        <span>Cargar PDF</span>
                                    </>
                                )}
                            </button>

                            <div className="relative flex">
                                {!folderName ? (
                                    <button
                                        onClick={connectFolder}
                                        className="flex-1 group bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 pr-12 rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5"
                                        title="Conectar una carpeta local y subir PDFs automáticamente"
                                    >
                                        <svg className="w-5 h-5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                                        </svg>
                                        <span>Carpeta Auto</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={disconnectFolder}
                                        className="flex-1 group bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 px-6 pr-12 rounded-xl shadow-lg shadow-gray-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5"
                                        title="Desconectar carpeta"
                                    >
                                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>Desconectar</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowFolderGuide(true)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors border border-white/10 backdrop-blur-sm"
                                    title="Ver guía de uso"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Folder guide modal */}
            {showFolderGuide && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowFolderGuide(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold text-lg flex items-center justify-center border border-emerald-300">!</div>
                                <h2 className="text-lg font-bold text-gray-800">Guía: Carpeta Auto</h2>
                            </div>
                            <button onClick={() => setShowFolderGuide(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-5 space-y-5 text-sm text-gray-700">
                            <p className="text-gray-500">Conectá una carpeta de tu PC y cada PDF que copies ahí se convierte en un pedido de egreso automáticamente.</p>

                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-800 text-xs">
                                Requiere <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong>. Firefox y Safari no son compatibles.
                            </div>

                            <div>
                                <p className="font-semibold text-gray-800 mb-2">Pasos para empezar</p>
                                <ol className="space-y-3">
                                    <li className="flex gap-3">
                                        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                                        <span>Hacé clic en el botón verde <strong>Carpeta Auto</strong>.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                                        <span>Seleccioná la carpeta de tu PC donde vas a depositar los PDFs y hacé clic en <strong>Seleccionar carpeta</strong>.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                                        <span>El navegador te pedirá confirmación de acceso — hacé clic en <strong>Permitir</strong>.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">4</span>
                                        <span>Copiá o mové cualquier PDF de remito a esa carpeta. En máximo <strong>30 segundos</strong> el sistema lo detecta y crea el egreso automáticamente.</span>
                                    </li>
                                </ol>
                            </div>

                            <div>
                                <p className="font-semibold text-gray-800 mb-2">Estados del indicador</p>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                                        <span><strong>Verde — Activa:</strong> revisando la carpeta cada 30 segundos.</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0"></span>
                                        <span><strong>Amarillo — Re-autorizar:</strong> el permiso venció al recargar la página. Hacé clic en el botón <strong>Autorizar</strong> que aparece en el banner.</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-gray-400 shrink-0"></span>
                                        <span><strong>Gris:</strong> carpeta registrada pero sin monitoreo activo.</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <p className="font-semibold text-gray-800 mb-2">A tener en cuenta</p>
                                <ul className="space-y-1.5 text-gray-600 list-disc list-inside">
                                    <li>Un mismo PDF <strong>nunca se sube dos veces</strong>, aunque quede permanentemente en la carpeta.</li>
                                    <li>Solo se procesan archivos <strong>.pdf</strong> — otros tipos se ignoran.</li>
                                    <li>Si un archivo falla, se reintenta en el próximo ciclo de 30 segundos.</li>
                                    <li>Al recargar la página, el nombre de la carpeta se recuerda pero hay que volver a <strong>Autorizar</strong> el acceso.</li>
                                </ul>
                            </div>
                        </div>
                        <div className="p-4 border-t flex justify-end">
                            <button onClick={() => setShowFolderGuide(false)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg transition-colors text-sm">
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Folder watcher status banner */}
            {folderName && (
                <div className={`mb-4 rounded-xl border text-sm overflow-hidden ${needsPermission
                    ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
                    : watching
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}>
                    <div className="flex flex-wrap items-center gap-3 p-3">
                        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                            <span className="font-semibold">Carpeta:</span> <span className="font-mono truncate">{folderName}</span>
                            {watching && !needsPermission && !watcherProgress && (
                                <span className="ml-2 text-xs">— Revisando cada 30 seg</span>
                            )}
                            {watcherProgress && (
                                <span className="ml-2 text-xs font-medium">
                                    — Subiendo {watcherProgress.total > 1 ? `${watcherProgress.current}/${watcherProgress.total}: ` : ''}&ldquo;{watcherProgress.fileName}&rdquo;
                                </span>
                            )}
                            {needsPermission && (
                                <span className="ml-2">— Se requiere re-autorizar el acceso</span>
                            )}
                        </div>
                        {needsPermission && (
                            <button
                                onClick={requestPermissionAgain}
                                className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                            >
                                Autorizar
                            </button>
                        )}
                            {watching && !needsPermission && !watcherProgress && (
                                <div className="ml-auto flex items-center gap-3">
                                    <span className="text-[10px] bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                                        Detección: {detectionStats.total} total / {detectionStats.ignored} omitidos
                                    </span>
                                    <button 
                                        onClick={clearProcessedHistory}
                                        className="text-[10px] text-emerald-700 hover:underline font-bold"
                                        title="Limpiar historial para procesar todo de nuevo"
                                    >
                                        Limpiar Historial
                                    </button>
                                    <span className="flex items-center gap-1.5 text-xs font-medium">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        Activa
                                    </span>
                                </div>
                            )}
                            {watcherProgress && (
                                <span className="ml-auto text-xs font-bold">{watcherProgress.percent}%</span>
                            )}
                        </div>

                    {/* Upload progress bar */}
                    {watcherProgress && (
                        <div className="px-3 pb-3">
                            <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-emerald-600 h-2 rounded-full transition-all duration-200"
                                    style={{ width: `${watcherProgress.percent}%` }}
                                />
                            </div>
                            <p className="text-xs text-emerald-700 mt-1">
                                Procesando PDF — extrayendo productos y verificando códigos...
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Failed uploads list */}
            {failedFiles.length > 0 && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between p-3 border-b border-red-100 bg-red-100/50">
                        <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Archivos con Error ({failedFiles.length})
                        </div>
                        <button 
                            onClick={() => setFailedFiles([])}
                            className="text-xs bg-white hover:bg-red-50 text-red-600 px-2 py-1 rounded border border-red-200 transition-colors font-medium"
                        >
                            Limpiar lista
                        </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                        <ul className="divide-y divide-red-100">
                            {failedFiles.map((f, idx) => (
                                <li key={idx} className="p-3 flex flex-col gap-1.5">
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="font-mono text-xs font-bold text-red-900 truncate flex-1">{f.name}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] text-red-400">{f.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            {f.fileKey && (
                                                <button 
                                                    onClick={() => retryFailedFile(f.fileKey)}
                                                    className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2 py-0.5 rounded transition-colors"
                                                >
                                                    Reintentar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-red-600 leading-tight">{f.error}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Intelligent Search & Filters */}
            {egresos.length > 0 && (
                <div className="mb-6 space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setStatusFilter('all')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${statusFilter === 'all' 
                                    ? 'bg-brand-blue text-white shadow-md shadow-blue-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                <span>Todos</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === 'all' ? 'bg-white/20' : 'bg-gray-100'}`}>
                                    {egresos.length}
                                </span>
                            </button>
                            <button
                                onClick={() => setStatusFilter('open')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${statusFilter === 'open' 
                                    ? 'bg-yellow-500 text-white shadow-md shadow-yellow-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                <span>Abiertos</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === 'open' ? 'bg-white/20' : 'bg-gray-100'}`}>
                                    {egresos.filter(e => e.status !== 'finalized').length}
                                </span>
                            </button>
                            <button
                                onClick={() => setStatusFilter('finalized')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${statusFilter === 'finalized' 
                                    ? 'bg-green-600 text-white shadow-md shadow-green-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                <span>Finalizados</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === 'finalized' ? 'bg-white/20' : 'bg-gray-100'}`}>
                                    {egresos.filter(e => e.status === 'finalized').length}
                                </span>
                            </button>
                        </div>

                        <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setDestinationFilter('all')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${destinationFilter === 'all' 
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                Destino: Todos
                            </button>
                            <button
                                onClick={() => setDestinationFilter('branch')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${destinationFilter === 'branch' 
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                Sucursales
                            </button>
                            <button
                                onClick={() => setDestinationFilter('client')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${destinationFilter === 'client' 
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                Clientes
                            </button>
                        </div>

                        <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${typeFilter === 'all' 
                                    ? 'bg-rose-600 text-white shadow-md shadow-rose-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                Tipo: Todos
                            </button>
                            <button
                                onClick={() => setTypeFilter('normal')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${typeFilter === 'normal' 
                                    ? 'bg-rose-600 text-white shadow-md shadow-rose-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                Normales
                            </button>
                            <button
                                onClick={() => setTypeFilter('transfer')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${typeFilter === 'transfer' 
                                    ? 'bg-rose-600 text-white shadow-md shadow-rose-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                Transferencias
                            </button>
                            <button
                                onClick={() => setTypeFilter('return')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${typeFilter === 'return' 
                                    ? 'bg-rose-600 text-white shadow-md shadow-rose-200' 
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                            >
                                Devoluciones
                            </button>
                        </div>
                    </div>
                    <div className="relative group">
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full text-base p-4 pl-12 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue outline-none bg-white shadow-sm transition-all"
                            placeholder="Buscar por referencia, PDF, usuario o estado..."
                            autoComplete="off"
                        />
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-brand-blue transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
            )}

            {/* Upload area visual indicator when no egresos exist */}
            {canUploadPdf && egresos.length === 0 && !uploading && (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-6 p-12 border-2 border-dashed border-gray-300 rounded-xl bg-white hover:border-brand-blue hover:bg-blue-50/30 transition-all cursor-pointer text-center"
                >
                    <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <p className="text-gray-500 font-medium text-lg mb-1">Arrastrá o hacé clic para subir un PDF</p>
                    <p className="text-gray-400 text-sm">Se extraerán automáticamente los productos del documento</p>
                </div>
            )}

            {/* Uploading overlay */}
            {uploading && (
                <div className="mb-6 p-8 bg-white rounded-xl shadow-lg border-l-4 border-brand-blue text-center">
                    <div className="w-12 h-12 border-4 border-blue-100 border-t-brand-blue rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-lg font-bold text-gray-800">Procesando PDF...</p>
                    <p className="text-sm text-gray-500 mt-1">Extrayendo productos y buscando códigos de barras</p>
                </div>
            )}

            {/* Vista de Escritorio (Tabla) */}
            {filteredEgresos.length > 0 && (
                <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden">
                    <table className="min-w-full leading-normal">
                        <thead>
                            <tr>
                                <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Referencia
                                </th>
                                <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Archivo PDF
                                </th>
                                <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Fecha
                                </th>
                                <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Estado
                                </th>
                                <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Sucursal
                                </th>
                                <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Creado Por
                                </th>
                                <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedEgresos.map(egreso => (
                                <tr key={egreso.id}>
                                    <td className="px-3 py-5 border-b border-gray-200 bg-white text-sm">
                                        <div className="flex items-center gap-2">
                                            <p className="text-gray-900 whitespace-no-wrap font-bold">{egreso.reference_number}</p>
                                            {egreso.is_devolucion && (
                                                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase">
                                                    Devolución
                                                </span>
                                            )}
                                            {egreso.is_transferencia && (
                                                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-200 uppercase">
                                                    Transferencia
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-600 truncate max-w-[150px]" title={egreso.pdf_filename}>{egreso.pdf_filename || '-'}</p>
                                    </td>
                                    <td className="px-3 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 whitespace-no-wrap">
                                            {new Date(egreso.date).toLocaleDateString()} {new Date(egreso.date).toLocaleTimeString()}
                                        </p>
                                    </td>
                                    <td className="px-3 py-5 border-b border-gray-200 bg-white text-sm">
                                        <span className={`relative inline-block px-3 py-1 font-semibold leading-tight`}>
                                            <span aria-hidden className={`absolute inset-0 ${egreso.status === 'finalized' ? 'bg-green-200' : 'bg-yellow-200'} opacity-50 rounded-full`}></span>
                                            <span className="relative">{egreso.status === 'finalized' ? 'Finalizado' : 'Abierto'}</span>
                                        </span>
                                    </td>
                                    <td className="px-3 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 font-medium">{egreso.sucursal_name}</p>
                                    </td>
                                    <td className="px-3 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 whitespace-no-wrap">{egreso.created_by}</p>
                                    </td>
                                    <td className="px-3 py-5 border-b border-gray-200 bg-white text-sm">
                                        <div className="flex gap-3 items-center">
                                            <Link to={`/egresos/${egreso.id}`} className="text-blue-600 hover:text-blue-900 font-bold">
                                                Ver Detalles
                                            </Link>
                                            {canFinalize && egreso.status !== 'finalized' && (
                                                <button
                                                    onClick={() => handleFinalize(egreso.id)}
                                                    className="text-emerald-600 hover:text-emerald-900 font-bold"
                                                    title="Marcar todas las cantidades como completas y finalizar"
                                                >
                                                    Finalizar
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    onClick={() => handleDelete(egreso.id)}
                                                    className="text-red-600 hover:text-red-900 font-bold"
                                                >
                                                    Eliminar
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Vista Mobile (Tarjetas) */}
            <div className="md:hidden space-y-4">
                {displayedEgresos.map(egreso => (
                    <Link
                        to={`/egresos/${egreso.id}`}
                        key={egreso.id}
                        className="block bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
                    >
                        <div className="flex justify-between items-start gap-4 mb-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <h3 className="text-lg font-bold text-gray-900 break-words leading-tight">{egreso.reference_number}</h3>
                                    {egreso.is_devolucion && (
                                        <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase shrink-0">
                                            Devolución
                                        </span>
                                    )}
                                    {egreso.is_transferencia && (
                                        <span className="bg-blue-100 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-200 uppercase shrink-0">
                                            Transferencia
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-brand-gray">
                                    {new Date(egreso.date).toLocaleDateString()} - {new Date(egreso.date).toLocaleTimeString()}
                                </p>
                                {egreso.pdf_filename && (
                                    <p className="text-xs text-gray-400 mt-0.5 break-all">📄 {egreso.pdf_filename}</p>
                                )}
                                <p className="text-[10px] mt-1.5 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md inline-block font-bold">
                                    📍 {egreso.sucursal_name}
                                </p>
                            </div>
                            <span className={`shrink-0 inline-block px-2.5 py-1 text-xs font-bold rounded-full ${egreso.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {egreso.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                            </span>
                        </div>
                        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap justify-between items-center gap-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs text-gray-500 whitespace-nowrap">Por:</span>
                                <span className="text-xs font-bold text-gray-700 truncate">{egreso.created_by}</span>
                            </div>
                            <div className="flex items-center gap-4 ml-auto">
                                {canFinalize && egreso.status !== 'finalized' && (
                                    <button
                                        onClick={(e) => { e.preventDefault(); handleFinalize(egreso.id); }}
                                        className="text-emerald-600 hover:text-emerald-700 text-xs font-bold whitespace-nowrap transition-colors"
                                    >
                                        Finalizar
                                    </button>
                                )}
                                {canDelete && (
                                    <button
                                        onClick={(e) => { e.preventDefault(); handleDelete(egreso.id); }}
                                        className="text-red-600 hover:text-red-700 text-xs font-bold whitespace-nowrap transition-colors"
                                    >
                                        Eliminar
                                    </button>
                                )}
                                <span className="text-brand-blue font-bold text-sm whitespace-nowrap">Ver detalles →</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Pagination / Load More */}
            {filteredEgresos.length > visibleCount && (
                <div className="mt-8 mb-12 flex justify-center">
                    <button
                        onClick={() => setVisibleCount(prev => prev + 20)}
                        className="bg-white hover:bg-gray-50 text-brand-blue font-bold py-3 px-8 rounded-xl border-2 border-brand-blue/20 hover:border-brand-blue transition-all shadow-sm flex items-center gap-2"
                    >
                        <span>Cargar más remitos</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>
            )}

            {egresos.length === 0 && !uploading && (
                <div className="bg-white p-8 text-center rounded-lg shadow-inner text-gray-500 italic mt-4">
                    No hay egresos registrados. Subí un PDF para crear uno.
                </div>
            )}
            {egresos.length > 0 && filteredEgresos.length === 0 && (
                <div className="bg-white p-8 text-center rounded-lg shadow-inner text-gray-400 italic mt-4">
                    No se encontraron egresos con esa búsqueda.
                </div>
            )}
        </div>
    );
};

export default EgresosList;
