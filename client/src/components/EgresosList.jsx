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
    const fileInputRef = useRef(null);

    // Folder watcher state
    const [folderName, setFolderName] = useState(null);
    const [watching, setWatching] = useState(false);
    const [watcherProgress, setWatcherProgress] = useState(null); // { fileName, percent, current, total }
    const [needsPermission, setNeedsPermission] = useState(false);
    const [showFolderGuide, setShowFolderGuide] = useState(false);
    const dirHandleRef = useRef(null);
    const watchIntervalRef = useRef(null);
    const checkingRef = useRef(false); // Lock to prevent concurrent checkFolder runs
    const processedFilesRef = useRef(new Set(
        JSON.parse(localStorage.getItem('egreso_processed_files') || '[]')
    ));

    // Access control
    const canAccessEgresos = user?.role === 'superadmin' || user?.role === 'admin' || user?.sucursal_name === 'Deposito' || user?.permissions?.includes('tab_egresos');
    const canUploadPdf = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || user?.permissions?.includes('upload_egresos');
    const canDelete = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || user?.permissions?.includes('delete_egresos');

    const fetchEgresos = useCallback(async () => {
        try {
            const response = await api.get('/api/egresos');
            setEgresos(response.data);
            setLoading(false);
            // Cache in IndexedDB (much larger quota than localStorage)
            await db.offline_caches.put({
                id: 'egresos_list',
                data: response.data,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Error fetching egresos:', error);
            // Try to load from IndexedDB cache
            const cache = await db.offline_caches.get('egresos_list');
            if (cache) {
                setEgresos(cache.data);
                toast.info('Mostrando datos offline');
            } else {
                toast.error('Error al cargar los egresos');
            }
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEgresos();
    }, [fetchEgresos]);

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
            for await (const [name, handle] of dirHandleRef.current.entries()) {
                if (handle.kind !== 'file') continue;
                if (!name.toLowerCase().endsWith('.pdf')) continue;
                const file = await handle.getFile();
                const fileKey = `${name}_${file.size}_${file.lastModified}`;
                if (processedFilesRef.current.has(fileKey)) continue;
                newFiles.push({ name, file, fileKey });
            }

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
                    // Mark as processed BEFORE any state updates to prevent race
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
                    toast.error(`Error en "${name}": ${msg}`);
                    // Don't mark as processed so it retries next cycle
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
                    toast.error(msg);
                }
            }
            fetchEgresos();
        } finally {
            setUploading(false);
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
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

    if (loading) return <div className="p-4 text-center">Cargando...</div>;
    if (!canAccessEgresos) return <Navigate to="/" replace />;

    const searchTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const filteredEgresos = searchTerms.length > 0
        ? egresos.filter(e => {
            const ref = (e.reference_number || '').toLowerCase();
            const pdf = (e.pdf_filename || '').toLowerCase();
            const createdBy = (e.created_by || '').toLowerCase();
            const status = e.status === 'finalized' ? 'finalizado' : 'abierto';
            return searchTerms.every(term =>
                ref.includes(term) || pdf.includes(term) || createdBy.includes(term) || status.includes(term)
            );
        })
        : egresos;

    return (
        <div className="container mx-auto p-4 max-w-lg md:max-w-4xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Egreso de Mercadería</h1>
                {canUploadPdf && (
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
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
                            className="bg-brand-blue hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {uploading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    {uploadProgress}
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                    </svg>
                                    Cargar PDF
                                </>
                            )}
                        </button>
                        {!folderName ? (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={connectFolder}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-md transition-colors flex items-center gap-2"
                                    title="Conectar una carpeta local y subir PDFs automáticamente"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                                    </svg>
                                    Carpeta Auto
                                </button>
                                <button
                                    onClick={() => setShowFolderGuide(true)}
                                    className="w-8 h-8 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold text-sm flex items-center justify-center transition-colors border border-emerald-300"
                                    title="Ver guía de uso"
                                >
                                    !
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={disconnectFolder}
                                    className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2.5 px-5 rounded-lg shadow-md transition-colors flex items-center gap-2"
                                    title="Desconectar carpeta"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6" />
                                    </svg>
                                    Desconectar
                                </button>
                                <button
                                    onClick={() => setShowFolderGuide(true)}
                                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm flex items-center justify-center transition-colors border border-gray-300"
                                    title="Ver guía de uso"
                                >
                                    !
                                </button>
                            </div>
                        )}
                    </div>
                )}
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
                            <span className="flex items-center gap-1.5 text-xs font-medium">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Activa
                            </span>
                        )}
                        {watcherProgress && (
                            <span className="text-xs font-bold">{watcherProgress.percent}%</span>
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

            {/* Intelligent Search */}
            {egresos.length > 0 && (
                <div className="mb-4">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full text-base p-3 border rounded-xl focus:ring-2 focus:ring-brand-blue outline-none bg-white shadow-sm"
                        placeholder="Buscar por referencia, PDF, usuario o estado..."
                        autoComplete="off"
                    />
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
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Referencia
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Archivo PDF
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Fecha
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Estado
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Creado Por
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEgresos.map(egreso => (
                                <tr key={egreso.id}>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 whitespace-no-wrap font-bold">{egreso.reference_number}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-600 whitespace-no-wrap">{egreso.pdf_filename || '-'}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 whitespace-no-wrap">
                                            {new Date(egreso.date).toLocaleDateString()} {new Date(egreso.date).toLocaleTimeString()}
                                        </p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <span className={`relative inline-block px-3 py-1 font-semibold leading-tight`}>
                                            <span aria-hidden className={`absolute inset-0 ${egreso.status === 'finalized' ? 'bg-green-200' : 'bg-yellow-200'} opacity-50 rounded-full`}></span>
                                            <span className="relative">{egreso.status === 'finalized' ? 'Finalizado' : 'Abierto'}</span>
                                        </span>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 whitespace-no-wrap">{egreso.created_by}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <div className="flex gap-3 items-center">
                                            <Link to={`/egresos/${egreso.id}`} className="text-blue-600 hover:text-blue-900 font-bold">
                                                Ver Detalles
                                            </Link>
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
                {filteredEgresos.map(egreso => (
                    <Link
                        to={`/egresos/${egreso.id}`}
                        key={egreso.id}
                        className="block bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{egreso.reference_number}</h3>
                                <p className="text-xs text-brand-gray">
                                    {new Date(egreso.date).toLocaleDateString()} - {new Date(egreso.date).toLocaleTimeString()}
                                </p>
                                {egreso.pdf_filename && (
                                    <p className="text-xs text-gray-400 mt-0.5">📄 {egreso.pdf_filename}</p>
                                )}
                            </div>
                            <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-full ${egreso.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {egreso.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Por: <span className="font-medium">{egreso.created_by}</span></span>
                            <div className="flex gap-3 items-center">
                                {canDelete && (
                                    <button
                                        onClick={(e) => { e.preventDefault(); handleDelete(egreso.id); }}
                                        className="text-red-600 hover:text-red-900 font-bold"
                                    >
                                        Eliminar
                                    </button>
                                )}
                                <span className="text-brand-blue font-bold">Ver detalles →</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

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
