import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import Scanner from './Scanner';
import api from '../api';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import { useProductSync } from '../hooks/useProductSync';
import { RotateCcw, Barcode, History, Camera, CheckCircle2, Edit, AlertTriangle, Search, Package, X, Mic, Loader2, Link, Clock, User, ClipboardList, Download, Filter } from 'lucide-react';

const BarcodeControl = () => {
    const [scannedBarcode, setScannedBarcode] = useState('');
    const [inputBarcode, setInputBarcode] = useState('');
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);
    const productCacheRef = useRef({});
    const { getProductByCode, searchProductsLocally, isSyncing, lastSync, syncProducts } = useProductSync();

    useEffect(() => {
        syncProducts();
    }, []);

    // Edit state
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});

    // Search state (for linking new barcodes)
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const searchTimeoutRef = useRef(null);

    // Selected product to link
    const [selectedProductToLink, setSelectedProductToLink] = useState(null);

    // Duplicate product selection state
    const [duplicateProducts, setDuplicateProducts] = useState([]);
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

    // Scanner state
    const [showScanner, setShowScanner] = useState(false);

    // Tabs state
    const [activeTab, setActiveTab] = useState('scanner'); // 'scanner' | 'history'

    // History state
    const [actionHistory, setActionHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    // Layout state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [layoutHistory, setLayoutHistory] = useState([]);
    const [layoutLoading, setLayoutLoading] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [usersList, setUsersList] = useState([]);
    const [saveToLayout, setSaveToLayout] = useState(() => {
        const saved = localStorage.getItem('saveToLayout');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const [allowRepetition, setAllowRepetition] = useState(() => {
        const saved = localStorage.getItem('allowRepetition');
        return saved !== null ? JSON.parse(saved) : true;
    });

    // Sesión local de códigos escaneados para evitar repetición inmediata si está desactivado
    const [scannedInSession, setScannedInSession] = useState(new Set());

    // Guide state
    const [showGuide, setShowGuide] = useState(false);

    // Save toggle preferences to localStorage
    useEffect(() => {
        localStorage.setItem('saveToLayout', JSON.stringify(saveToLayout));
    }, [saveToLayout]);

    useEffect(() => {
        localStorage.setItem('allowRepetition', JSON.stringify(allowRepetition));
    }, [allowRepetition]);

    // Fetch history/layout on mount and when switching tabs
    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        } else if (activeTab === 'layout') {
            fetchLayout();
            fetchUsersForFilter();
        }
    }, [activeTab]);

    const fetchUsersForFilter = async () => {
        try {
            // We could use /api/users if admin, but to be safe for all roles
            // we can just get them from the history if needed, or if we have admin rights:
            const response = await api.get('/api/users');
            setUsersList(response.data);
        } catch (err) {
            console.error('Error fetching users for filter:', err);
            // Fallback: empty list or just common users
        }
    };

    const fetchLayout = async () => {
        setLayoutLoading(true);
        try {
            let url = '/api/barcode-history?action_type=SCAN';
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedUserId) params.append('user_id', selectedUserId);

            if (params.toString()) {
                url += `&${params.toString()}`;
            }

            const response = await api.get(url);
            setLayoutHistory(response.data);
        } catch (err) {
            console.error('Error fetching layout:', err);
            toast.error('Error al cargar el layout');
        } finally {
            setLayoutLoading(false);
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            let url = '/api/barcode-history';
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            const response = await api.get(url);
            setActionHistory(response.data);
        } catch (err) {
            console.error('Error fetching history:', err);
            toast.error('Error al cargar el historial');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleExportExcel = async () => {
        try {
            if (!startDate || !endDate) {
                toast.error('Debe seleccionar Fecha Desde y Fecha Hasta para exportar.');
                return;
            }

            let url = '/api/barcode-history/export';
            const params = new URLSearchParams();
            params.append('startDate', startDate);
            params.append('endDate', endDate);

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            const response = await api.get(url);

            if (response.data && response.data.files) {
                response.data.files.forEach((file, index) => {
                    setTimeout(() => {
                        const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8;' });
                        const downloadUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = downloadUrl;
                        link.download = file.filename;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(downloadUrl);
                    }, index * 500); // Slight delay for multiple downloads
                });
                toast.success(`Exportación generada: ${response.data.files.length} archivo(s) CSV`);
            }
        } catch (err) {
            console.error('Error exporting history:', err);
            if (err.response && err.response.status === 400) {
                toast.error(err.response.data.message || 'Debe seleccionar fechas para exportar');
            } else if (err.response && err.response.status === 404) {
                toast.error(err.response.data.message || 'No hay datos para exportar en el rango seleccionado');
            } else {
                toast.error('Error al exportar el historial');
            }
        }
    };


    // Focus input on mount and whenever we are not in edit mode or searching
    useEffect(() => {
        if (!editMode && product === null && !searchQuery) {
            inputRef.current?.focus();
        }
    }, [editMode, product, searchQuery]);

    const handleScan = async (e) => {
        e.preventDefault();
        const code = inputBarcode.trim();
        if (!code) return;

        setScannedBarcode(code);
        await lookupProduct(code);
    };

    const logScan = async (productData, code) => {
        try {
            await api.post('/api/barcode-history', {
                action_type: 'SCAN',
                product_id: productData?.id || null,
                product_description: productData?.description || `Código desconocido: ${code}`,
                details: `Escaneo de ${code}`
            });
        } catch (err) {
            console.error('Error logging scan:', err);
        }
    };

    const selectProduct = (productData) => {
        setProduct(productData);
        setEditData({
            description: productData.description || '',
            code: productData.code || '',
            barcode: productData.barcode || '',
            provider_code: productData.provider_code || ''
        });
    };

    const lookupProduct = async (code) => {
        setLoading(true);
        setError(null);
        setProduct(null);
        setEditMode(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedProductToLink(null);
        setDuplicateProducts([]);
        setIsDuplicateModalOpen(false);

        try {
            let data;
            if (productCacheRef.current[code]) {
                data = productCacheRef.current[code];
            } else {
                // 1. Try Local DB first
                const localData = await getProductByCode(code);
                if (localData) {
                    data = localData;
                } else {
                    // 2. Fallback to API
                    if (navigator.onLine) {
                        const response = await api.get(`/api/products/barcode/${code}`);
                        data = response.data;
                    } else {
                        throw { response: { status: 404 } };
                    }
                }
                productCacheRef.current[code] = data; // Guardar en caché
            }

            if (Array.isArray(data) && data.length > 1) {
                setDuplicateProducts(data);
                setIsDuplicateModalOpen(true);
            } else {
                const foundProduct = Array.isArray(data) ? data[0] : (data || null);

                // Si la repetición no está permitida, verificar si ya se escaneó en esta "sesión"
                // Usamos el código o el ID del producto para verificar
                const productIdentifier = foundProduct?.id || code;
                if (!allowRepetition && scannedInSession.has(productIdentifier)) {
                    toast.warning('Este producto ya fue escaneado en esta sesión.');
                    selectProduct(foundProduct);
                    if (!data) setError('code_not_found');
                    return;
                }

                selectProduct(foundProduct);
                if (!data) setError('code_not_found');

                // Log the scan (lookup) only if enabled
                if (saveToLayout) {
                    logScan(foundProduct, code);
                    // Agregar a la sesión de escaneados
                    setScannedInSession(prev => new Set(prev).add(productIdentifier));
                }
            }
        } catch (err) {
            console.error('Lookup error:', err);
            if (err.response && err.response.status === 404) {
                setError('code_not_found'); // Special error state
            } else {
                const msg = err.response?.data?.message || 'Error al buscar el producto';
                setError(msg);
                toast.error(msg);
            }
        } finally {
            setLoading(false);
            setInputBarcode(''); // clear input for next scan
            // Only focus if we are not showing the scanner
            if (inputRef.current && !showScanner) inputRef.current.focus();
        }
    };

    const handleSaveEdit = async () => {
        if (!product) return;
        setLoading(true);
        try {
            const response = await api.put(`/api/products/${product.id}`, editData);
            const updated = response.data;
            setProduct(updated);
            setEditMode(false);


            productCacheRef.current = {}; // Limpiar caché tras editar

            toast.success('Producto actualizado correctamente');
        } catch (err) {
            console.error('Update error:', err);
            const msg = err.response?.data?.message || 'Error al actualizar';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const executeSearch = async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        try {
            const localResults = await searchProductsLocally(query);
            const apiResults = [];

            if (navigator.onLine && localResults.length < 5) {
                try {
                    const response = await api.get(`/api/products/search?q=${encodeURIComponent(query)}`);
                    apiResults.push(...response.data);
                } catch (e) { console.error("API Search fallback failed", e); }
            }

            // Merge
            const combined = [...localResults];
            apiResults.forEach(apiItem => {
                if (!combined.some(c => c.id === apiItem.id)) {
                    combined.push(apiItem);
                }
            });

            setSearchResults(combined);
            if (combined.length === 0) {
                toast.info('No se encontraron productos para esta búsqueda');
            }
        } catch (err) {
            console.error('Search error:', err);
            toast.error('Error al buscar productos');
        } finally {
            setSearching(false);
        }
    };

    const handleSearchInputChange = (e) => {
        const value = e.target.value;
        setSearchQuery(value);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(() => {
            executeSearch(value);
        }, 500);
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        executeSearch(searchQuery);
    };

    const handleVoiceSearch = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const { available } = await SpeechRecognition.available();
                if (!available) {
                    toast.error('El reconocimiento de voz no está disponible.');
                    return;
                }

                const { speechRecognition } = await SpeechRecognition.checkPermissions();
                if (speechRecognition !== 'granted') {
                    const { speechRecognition: newPermission } = await SpeechRecognition.requestPermissions();
                    if (newPermission !== 'granted') {
                        toast.error('Permiso de micrófono denegado.');
                        return;
                    }
                }

                setIsListening(true);

                SpeechRecognition.start({
                    language: 'es-ES',
                    maxResults: 5,
                    prompt: 'Diga el nombre del producto a buscar',
                    partialResults: false,
                    popup: true
                }).then(async result => {
                    if (result && result.matches && result.matches.length > 0) {
                        // Expandir candidatos: también probar versión sin espacios (ej: "ter suave" → "tersuave")
                        const candidates = [];
                        for (const match of result.matches) {
                            candidates.push(match);
                            const compressed = match.replace(/\s+/g, '');
                            if (compressed !== match) candidates.push(compressed);
                        }
                        for (const match of candidates) {
                            if (!match || !match.trim()) continue;
                            try {
                                // 1. Try Local DB
                                const localResults = await searchProductsLocally(match);
                                if (localResults && localResults.length > 0) {
                                    setSearchQuery(match);
                                    setSearchResults(localResults);
                                    return;
                                }

                                // 2. Fallback to API
                                const res = await api.get(`/api/products/search?q=${encodeURIComponent(match)}`);
                                if (res.data && res.data.length > 0) {
                                    setSearchQuery(match);
                                    setSearchResults(res.data);
                                    return;
                                }
                            } catch (e) { /* probar siguiente alternativa */ }
                        }
                        // Ninguna alternativa encontró resultados, usar la primera
                        const first = result.matches[0];
                        setSearchQuery(first);
                        executeSearch(first);
                    }
                }).catch(error => {
                    console.error('Speech error:', error);
                }).finally(() => {
                    setIsListening(false);
                });

            } catch (error) {
                console.error('Core Voice error:', error);
                setIsListening(false);
            }
            return;
        }

        // Web Fallback
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            toast.error('Navegador no compatible con voz.');
            return;
        }

        const SpeechRecognitionWeb = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognitionWeb();
        recognition.lang = 'es-ES';
        recognition.interimResults = false;
        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setSearchQuery(transcript);
            executeSearch(transcript);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
    };

    const handleLinkProduct = async (selectedProduct) => {
        if (!window.confirm(`¿Estás seguro de que quieres asignar el código de barras "${scannedBarcode}" al producto:\n${selectedProduct.description}?`)) {
            return;
        }

        setLoading(true);
        try {
            const response = await api.put(`/api/products/${selectedProduct.id}`, { barcode: scannedBarcode });
            const updated = response.data;


            toast.success('Código de barras vinculado exitosamente');
            // Refresh the view to show the newly linked product
            setProduct(updated);
            setEditData({
                description: updated.description || '',
                code: updated.code || '',
                barcode: updated.barcode || '',
                provider_code: updated.provider_code || ''
            });
            setError(null);
            setSearchQuery('');
            setSearchResults([]);
            setSelectedProductToLink(null);
        } catch (err) {
            console.error('Link error:', err);
            const msg = err.response?.data?.message || 'Error al vincular el código';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const resetView = () => {
        setProduct(null);
        setError(null);
        setScannedBarcode('');
        setInputBarcode('');
        setDuplicateProducts([]);
        setIsDuplicateModalOpen(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedProductToLink(null);
        setScannedInSession(new Set()); // Limpiar sesión de escaneados al resetear
        setTimeout(() => { if (!showScanner) inputRef.current?.focus() }, 100);
    };

    const onScannerDecode = async (code) => {
        setShowScanner(false);
        setScannedBarcode(code);
        await lookupProduct(code);
    };

    return (
        <div className="max-w-4xl mx-auto p-2 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-md p-3 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-6 gap-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 text-center sm:text-left">Control de Códigos de Barras</h2>
                        <button
                            onClick={() => setShowGuide(true)}
                            className="w-7 h-7 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-700 font-bold text-sm flex items-center justify-center transition-colors border border-primary-300 shadow-sm"
                            title="Ver guía de uso"
                        >
                            !
                        </button>
                    </div>
                    {activeTab === 'scanner' && (
                        <button
                            onClick={resetView}
                            className="btn btn-secondary text-sm flex items-center gap-2 w-full sm:w-auto justify-center"
                            title="Limpiar pantalla"
                        >
                            <RotateCcw className="w-4 h-4" /> Limpiar
                        </button>
                    )}
                </div>

                {/* Guide Modal */}
                {showGuide && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowGuide(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 font-bold text-lg flex items-center justify-center border border-primary-300">!</div>
                                    <h2 className="text-lg font-bold text-gray-800">Guía: Control de Códigos</h2>
                                </div>
                                <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="p-5 space-y-6 text-sm text-gray-700">
                                <p className="text-gray-500">Esta pantalla te permite consultar y gestionar productos escaneando sus códigos de barras.</p>

                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                                            <Barcode className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 mb-1">Modos de Escaneo</p>
                                            <ul className="list-disc list-inside space-y-1 text-gray-600">
                                                <li><strong>Escáner de Mano:</strong> Pestañeá el producto directamente. El sistema detecta el código automáticamente.</li>
                                                <li><strong>Cámara:</strong> Hacé clic en "Usar Cámara" para habilitar el escáner del celular.</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                                            <ClipboardList className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 mb-1">Guardado en Layout</p>
                                            <p className="text-gray-600">Si está <strong>Activado</strong>, cada vez que escanees un producto se registrará en la pestaña "Layout" con tu usuario. Sirve para auditoría de estanterías.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                                            <RotateCcw className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 mb-1">Permitir Repetición</p>
                                            <p className="text-gray-600">Si está <strong>Inactivo</strong>, el sistema te avisará si intentás escanear el mismo producto dos veces seguidas en la misma sesión.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                                            <Link className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 mb-1">Vincular Códigos</p>
                                            <p className="text-gray-600">Si un código no es reconocido, el sistema te permitirá buscar el producto manualmente y asociarle ese código para escaneos futuros.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 border-t flex justify-end bg-gray-50">
                                <button onClick={() => setShowGuide(false)} className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-6 rounded-lg transition-colors text-sm">
                                    Entendido
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs Navigation */}
                <div className="flex border-b border-gray-200 mb-6 w-full">
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'scanner' ? 'border-primary-600 text-primary-600 bg-primary-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('scanner')}
                    >
                        <Barcode className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" /> Escanear
                    </button>
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'history' ? 'border-primary-600 text-primary-600 bg-primary-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <History className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" /> Historial
                        {actionHistory.length > 0 && (
                            <span className="ml-1.5 sm:ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs border border-gray-200">{actionHistory.length}</span>
                        )}
                    </button>
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'layout' ? 'border-primary-600 text-primary-600 bg-primary-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('layout')}
                    >
                        <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" /> Layout
                        {layoutHistory.length > 0 && (
                            <span className="ml-1.5 sm:ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs border border-gray-200">{layoutHistory.length}</span>
                        )}
                    </button>
                </div>

                {activeTab === 'scanner' && (
                    <div className="animate-fade-in">
                        {/* Config Toggles */}
                        <div className="flex flex-col sm:flex-row justify-center items-center mb-6 gap-4 sm:gap-8">
                            {/* Save to Layout Toggle */}
                            <label className="flex items-center cursor-pointer group">
                                <span className={`mr-3 text-sm font-medium transition-colors ${saveToLayout ? 'text-brand-blue font-bold' : 'text-gray-500'}`}>
                                    {saveToLayout ? 'Guardado en Layout Activado' : 'Guardado en Layout Desactivado'}
                                </span>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={saveToLayout}
                                        onChange={() => setSaveToLayout(!saveToLayout)}
                                    />
                                    <div className={`w-14 h-7 rounded-full transition-colors duration-200 border border-gray-200 shadow-inner ${saveToLayout ? 'bg-brand-blue' : 'bg-gray-300'}`}></div>
                                    <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ease-in-out ${saveToLayout ? 'translate-x-7' : 'translate-x-0'}`}></div>
                                </div>
                            </label>

                            {/* Allow Repetition Toggle */}
                            <label className="flex items-center cursor-pointer group">
                                <span className={`mr-3 text-sm font-medium transition-colors ${allowRepetition ? 'text-brand-blue font-bold' : 'text-gray-500'}`}>
                                    {allowRepetition ? 'Permitir Repetición Activo' : 'Permitir Repetición Inactivo'}
                                </span>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={allowRepetition}
                                        onChange={() => setAllowRepetition(!allowRepetition)}
                                    />
                                    <div className={`w-14 h-7 rounded-full transition-colors duration-200 border border-gray-200 shadow-inner ${allowRepetition ? 'bg-brand-blue' : 'bg-gray-300'}`}></div>
                                    <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ease-in-out ${allowRepetition ? 'translate-x-7' : 'translate-x-0'}`}></div>
                                </div>
                            </label>
                        </div>

                        {/* Main Scanner Input */}
                        <form onSubmit={handleScan} className="mb-6 sm:mb-8">
                            <div className="relative flex flex-col sm:flex-row items-center max-w-lg mx-auto gap-2 sm:gap-3">
                                <div className="relative w-full">
                                    <Barcode className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 sm:w-6 sm:h-6" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputBarcode}
                                        onChange={(e) => setInputBarcode(e.target.value)}
                                        placeholder="Escanear o ingresar código..."
                                        className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 rounded-lg border-2 border-primary-500 focus:ring-4 focus:ring-primary-200 focus:border-primary-600 transition-all text-base sm:text-lg shadow-sm"
                                        disabled={loading}
                                        autoFocus
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading || !inputBarcode.trim()}
                                    className="w-full sm:w-auto px-6 py-3 sm:py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue/80 transition disabled:opacity-50 font-medium text-base sm:text-base flex-shrink-0 h-auto sm:h-[60px]"
                                >
                                    Buscar
                                </button>
                            </div>
                            <div className="flex justify-center mt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowScanner(true)}
                                    className="btn bg-brand-dark text-white hover:bg-brand-dark/80 flex items-center gap-2"
                                >
                                    <Camera className="w-4 h-4" /> Usar Cámara / Escáner Nativo
                                </button>
                            </div>
                            <p className="text-center text-sm text-gray-500 mt-4">
                                El escáner de mano debería enviar automáticamente la consulta tras leer el código.
                            </p>
                        </form>

                        {loading && (
                            <div className="flex justify-center p-8">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                            </div>
                        )}

                        {/* Product Found Section */}
                        {product && !loading && (
                            <div className="border border-green-200 bg-green-50 rounded-lg p-3 sm:p-6 animate-fade-in shadow-sm">
                                <div className="flex flex-col sm:flex-row justify-between items-center sm:items-start mb-4 gap-3">
                                    <h3 className="text-lg sm:text-xl font-bold text-green-800 flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                                        Producto Encontrado
                                    </h3>
                                    {!editMode && (
                                        <button
                                            onClick={() => setEditMode(true)}
                                            className="px-4 py-2 bg-white sm:bg-transparent border sm:border-0 border-gray-200 rounded text-gray-700 sm:text-primary-600 font-medium text-sm flex items-center justify-center gap-2 w-full sm:w-auto hover:bg-gray-50"
                                        >
                                            <Edit className="w-4 h-4" /> Editar
                                        </button>
                                    )}
                                </div>

                                {editMode ? (
                                    <div className="space-y-4 bg-white p-4 rounded border border-gray-200">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                                            <input
                                                type="text"
                                                value={editData.description}
                                                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                                                className="input-field"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Código Interno</label>
                                                <input
                                                    type="text"
                                                    value={editData.code}
                                                    onChange={(e) => setEditData({ ...editData, code: e.target.value })}
                                                    className="input-field"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Cód. Proveedor</label>
                                                <input
                                                    type="text"
                                                    value={editData.provider_code}
                                                    onChange={(e) => setEditData({ ...editData, provider_code: e.target.value })}
                                                    className="input-field"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Cód. Barras</label>
                                                <input
                                                    type="text"
                                                    value={editData.barcode}
                                                    onChange={(e) => setEditData({ ...editData, barcode: e.target.value })}
                                                    className="input-field bg-gray-50"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                                            <button
                                                onClick={() => {
                                                    setEditMode(false);
                                                    // revert changes
                                                    setEditData({
                                                        description: product.description || '',
                                                        code: product.code || '',
                                                        barcode: product.barcode || '',
                                                        provider_code: product.provider_code || ''
                                                    });
                                                }}
                                                className="btn btn-secondary w-full sm:w-auto"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleSaveEdit}
                                                className="btn btn-primary w-full sm:w-auto"
                                            >
                                                Guardar Cambios
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 bg-white p-3 sm:p-5 rounded border border-green-100">
                                        <div className="col-span-1 sm:col-span-2 border-b border-gray-100 pb-2 sm:pb-3">
                                            <p className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Descripción</p>
                                            <p className="text-sm sm:text-lg font-medium text-gray-900 leading-tight sm:leading-normal">{product.description || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Código Interno</p>
                                            <p className="text-sm sm:text-base text-gray-900 font-mono bg-gray-50 p-1.5 sm:p-2 rounded inline-block break-all">{product.code || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Cód. Proveedor</p>
                                            <p className="text-sm sm:text-base text-gray-900 font-mono bg-gray-50 p-1.5 sm:p-2 rounded inline-block break-all">{product.provider_code || '-'}</p>
                                        </div>
                                        <div className="col-span-1 sm:col-span-2 mt-1 sm:mt-2 pt-2 sm:pt-3 border-t border-gray-100">
                                            <p className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 sm:mb-2">
                                                <Barcode className="w-4 h-4" /> Cód. Barras Activo
                                            </p>
                                            <div className="bg-primary-50 border border-primary-100 rounded-md sm:rounded-lg p-2 sm:p-3">
                                                <p className="text-base sm:text-lg font-bold text-primary-700 tracking-wider sm:tracking-widest break-all w-full text-center leading-tight">{product.barcode || '-'}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Not Found / Link Section */}
                        {error === 'code_not_found' && !loading && (
                            <div className="animate-fade-in">
                                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 sm:p-4 shadow-sm mb-4">
                                    <div className="flex items-start sm:items-center gap-3 text-amber-800">
                                        <AlertTriangle className="w-8 h-8 text-amber-500 flex-shrink-0" />
                                        <div>
                                            <h3 className="text-lg font-bold">Código no encontrado</h3>
                                            <p className="text-sm break-all">El código <span className="font-bold">{scannedBarcode}</span> no está asociado a ningún producto.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-3 sm:p-5 rounded-xl border border-gray-200 shadow-sm">
                                    <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-base sm:text-lg">
                                        <Search className="w-5 h-5 text-blue-500" /> Vincular a un producto existente
                                    </h4>

                                    <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                                                <p className="font-bold text-xs text-blue-800">Buscá el producto</p>
                                            </div>
                                            <p className="text-[11px] text-blue-700 leading-tight">Escribí el nombre o marca en el cuadro de abajo.</p>
                                        </div>
                                        <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                                                <p className="font-bold text-xs text-amber-800">Elegí el correcto</p>
                                            </div>
                                            <p className="text-[11px] text-amber-700 leading-tight">Seleccioná de la lista el producto que tenés en la mano.</p>
                                        </div>
                                        <div className="bg-green-50/50 p-3 rounded-xl border border-green-100">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
                                                <p className="font-bold text-xs text-green-800">Confirmá la unión</p>
                                            </div>
                                            <p className="text-[11px] text-green-700 leading-tight">Aceptá el cartel para que el código quede guardado.</p>
                                        </div>
                                    </div>

                                    <form onSubmit={handleSearchSubmit} className="relative mb-4">
                                        <div className="relative flex items-center">
                                            <Package className="absolute left-4 text-gray-400 w-5 h-5" />
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={handleSearchInputChange}
                                                placeholder="Nombre del producto..."
                                                className="w-full pl-12 pr-24 py-3.5 rounded-xl border-2 border-gray-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-50 transition-all text-base shadow-sm outline-none bg-gray-50 focus:bg-white"
                                            />
                                            <div className="absolute right-2 flex items-center gap-1">
                                                {searchQuery && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSearchQuery('');
                                                            setSearchResults([]);
                                                        }}
                                                        className="text-gray-400 hover:text-gray-600 p-2 focus:outline-none"
                                                        title="Limpiar búsqueda"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={handleVoiceSearch}
                                                    className={`p-2.5 rounded-lg transition-all focus:outline-none ${isListening ? 'bg-red-100 text-red-600 animate-pulse scale-110' : 'text-gray-500 hover:text-amber-600 hover:bg-amber-50'}`}
                                                    title="Buscar por voz"
                                                >
                                                    <Mic className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                        <button type="submit" className="hidden">Buscar</button>
                                    </form>

                                    {searching && (
                                        <div className="flex justify-center py-4">
                                            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                                        </div>
                                    )}

                                    {/* Search Results */}
                                    {!selectedProductToLink && searchResults.length > 0 && (
                                        <div className="mt-4 border border-gray-100 rounded-xl bg-gray-50/50 p-2 shadow-inner">
                                            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                                                {searchResults.map((item) => (
                                                    <div key={item.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm hover:border-amber-300 hover:shadow transition-all flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
                                                        <div className="flex-1 w-full">
                                                            <h5 className="font-bold text-gray-900 mb-1 leading-snug">{item.description}</h5>
                                                            <div className="flex flex-wrap text-xs text-gray-600 gap-2 items-center">
                                                                <span className="bg-gray-100 px-2 py-1 rounded font-mono border border-gray-200">
                                                                    <span className="text-gray-400 font-sans text-[10px] uppercase mr-1">Cód</span>
                                                                    {item.code}
                                                                </span>
                                                                {item.barcode && (
                                                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-mono border border-blue-100 flex items-center gap-1">
                                                                        <Barcode className="w-4 h-4" /> {item.barcode}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => setSelectedProductToLink(item)}
                                                            className="w-full sm:w-auto px-4 py-2 bg-amber-100 text-amber-800 hover:bg-amber-500 hover:text-white rounded-lg font-bold transition-all text-sm flex items-center justify-center gap-2 shrink-0"
                                                        >
                                                            Seleccionar
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selectedProductToLink && (
                                        <div className="mt-4 border border-gray-200 bg-gray-50/50 rounded-xl p-3 sm:p-4 shadow-sm animate-fade-in w-full">
                                            <div className="flex justify-between items-start mb-3">
                                                <h5 className="font-bold text-gray-800 flex items-center gap-2 text-base sm:text-lg">
                                                    <Link className="w-5 h-5 text-amber-500" /> Confirmar Vinculación
                                                </h5>
                                                <button
                                                    onClick={() => setSelectedProductToLink(null)}
                                                    className="w-8 h-8 flex shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                                                    title="Cancelar selección"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="bg-white p-3 rounded-xl border border-gray-200 mb-3 shadow-sm w-full">
                                                <p className="text-sm sm:text-base font-bold text-gray-900 mb-2 leading-tight">{selectedProductToLink.description}</p>
                                                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
                                                    <div>
                                                        <span className="text-[10px] uppercase font-bold text-gray-400 mr-1">Cód Int</span>
                                                        <span className="font-mono text-gray-900">{selectedProductToLink.code}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] uppercase font-bold text-gray-400 mr-1">Cód Prov</span>
                                                        <span className="font-mono text-gray-900">{selectedProductToLink.provider_code || '-'}</span>
                                                    </div>
                                                    <div className="w-full flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] uppercase font-bold text-gray-400">Actual</span>
                                                        {selectedProductToLink.barcode ? (
                                                            <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-gray-800 font-mono text-xs">
                                                                <Barcode className="w-3 h-3 mr-1 text-gray-400 inline" />
                                                                {selectedProductToLink.barcode}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400 italic text-xs">Ninguno</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-amber-50 border border-amber-200 p-2.5 sm:p-3 rounded-xl mb-4 text-center w-full">
                                                <label className="block text-[10px] text-amber-700 font-bold uppercase mb-1.5 cursor-pointer">
                                                    Nuevo Código a Vincular
                                                </label>
                                                <input
                                                    type="text"
                                                    value={scannedBarcode}
                                                    onChange={(e) => setScannedBarcode(e.target.value)}
                                                    className="w-full text-center text-lg sm:text-xl font-mono font-black text-amber-900 bg-white border border-amber-300 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all shadow-sm"
                                                    placeholder="Ingrese o escanee el código"
                                                />
                                            </div>

                                            <div className="flex gap-2 w-full">
                                                <button
                                                    onClick={() => setSelectedProductToLink(null)}
                                                    className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-50 transition-all text-sm"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={() => handleLinkProduct(selectedProductToLink)}
                                                    className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-all shadow-sm text-sm"
                                                >
                                                    Confirmar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Generic Error */}
                        {error && error !== 'code_not_found' && !loading && (
                            <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                                <span className="block sm:inline">{error}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* History Section */}
                {activeTab === 'history' && (
                    <div className="animate-fade-in pt-2">
                        {/* Date Filters and Export */}
                        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
                            <div className="flex flex-col sm:flex-row gap-3 items-end">
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Desde</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                                    />
                                </div>
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Hasta</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                                    />
                                </div>
                                <div className="w-full sm:w-auto flex flex-row gap-2">
                                    <button
                                        onClick={fetchHistory}
                                        className="flex-1 sm:flex-none btn btn-primary py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                        disabled={historyLoading}
                                    >
                                        <Filter className="w-4 h-4" /> Filtrar
                                    </button>
                                    <button
                                        onClick={handleExportExcel}
                                        className="flex-1 sm:flex-none btn bg-green-600 hover:bg-green-700 text-white py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                    >
                                        <Download className="w-4 h-4" /> Exportar
                                    </button>
                                </div>
                            </div>
                        </div>

                        {historyLoading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                            </div>
                        ) : actionHistory.length > 0 ? (
                            <div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                        <History className="w-5 h-5 text-gray-500" />
                                        Historial {startDate || endDate ? 'Filtrado' : 'Reciente'}
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {actionHistory.map(item => (
                                        <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:shadow transition-shadow">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <p className="font-semibold text-gray-800 text-base">{item.product_description}</p>
                                                    {item.products?.barcode && (
                                                        <span className="text-xs bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                                                            <Barcode className="w-3 h-3" /> {item.products.barcode}
                                                        </span>
                                                    )}
                                                    {item.users?.username && (
                                                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                            <User className="w-3 h-3" /> {item.users.username}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1.5 flex items-center gap-2">
                                                    {item.action_type === 'edit' ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-100 text-blue-700 font-medium text-xs">
                                                            <Edit className="w-4 h-4" />
                                                            Editado: {item.details}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-green-100 text-green-700 font-medium text-xs">
                                                            <Link className="w-4 h-4" />
                                                            Vinculado: {item.details}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-500 flex items-center gap-1.5 sm:justify-end border-t sm:border-t-0 border-gray-200 pt-2 sm:pt-0 shrink-0">
                                                <Clock className="w-4 h-4" />
                                                {new Date(item.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-500">
                                <ClipboardList className="w-12 h-12 mb-3 text-gray-300 mx-auto" />
                                <p>No hay cambios recientes registrados en la base de datos.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Layout Section */}
                {activeTab === 'layout' && (
                    <div className="animate-fade-in pt-2">
                        {/* Filters */}
                        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
                            <div className="flex flex-col sm:flex-row gap-3 items-end">
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Usuario</label>
                                    <select
                                        value={selectedUserId}
                                        onChange={(e) => setSelectedUserId(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                                    >
                                        <option value="">Todos los usuarios</option>
                                        {usersList.map(u => (
                                            <option key={u.id} value={u.id}>{u.username}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Desde</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                                    />
                                </div>
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Hasta</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                                    />
                                </div>
                                <div className="w-full sm:w-auto">
                                    <button
                                        onClick={fetchLayout}
                                        className="w-full btn btn-primary py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                        disabled={layoutLoading}
                                    >
                                        <Filter className="w-4 h-4" /> Filtrar
                                    </button>
                                </div>
                            </div>
                        </div>

                        {layoutLoading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                            </div>
                        ) : layoutHistory.length > 0 ? (
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-primary-500" />
                                    Orden de Escaneo (Layout)
                                </h3>
                                <div className="space-y-3">
                                    {layoutHistory.map((item, index) => (
                                        <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm hover:border-primary-200 transition-colors">
                                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                                                    {layoutHistory.length - index}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{item.product_description}</p>
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        {item.products?.barcode && (
                                                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono flex items-center gap-1 border border-gray-200">
                                                                <Barcode className="w-3 h-3" /> {item.products.barcode}
                                                            </span>
                                                        )}
                                                        {item.users?.username && (
                                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded flex items-center gap-1 border border-blue-100">
                                                                <User className="w-3 h-3" /> {item.users.username}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded border border-gray-100 self-end sm:self-auto">
                                                <Clock className="w-3.5 h-3.5" />
                                                {new Date(item.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <Package className="w-12 h-12 mb-3 text-gray-300 mx-auto" />
                                <p className="text-gray-500 font-medium">No hay escaneos registrados para los criterios seleccionados.</p>
                                <p className="text-xs text-gray-400 mt-1">Comienza a escanear productos en la pestaña principal.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal for Duplicate Products Selection */}
            {isDuplicateModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl border border-gray-100">
                        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 flex items-center gap-4 shadow-lg">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white leading-tight uppercase tracking-wide">Detectamos Duplicados</h2>
                                <p className="text-amber-50 text-sm font-medium opacity-90">Selecciona el producto correcto para continuar</p>
                            </div>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto bg-gray-50/50 space-y-3">
                            {duplicateProducts.map((prod) => (
                                <button
                                    key={prod.id || prod.code}
                                    onClick={() => {
                                        setIsDuplicateModalOpen(false);
                                        setDuplicateProducts([]);
                                        selectProduct(prod);
                                    }}
                                    className="w-full text-left group transition-all duration-300 transform active:scale-[0.98]"
                                >
                                    <div className="bg-white border-2 border-transparent group-hover:border-amber-400 p-5 rounded-2xl shadow-sm group-hover:shadow-md group-hover:bg-amber-50/30 flex items-center gap-5 relative overflow-hidden">
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-200 group-hover:bg-amber-500 transition-colors"></div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-gray-900 text-lg leading-tight mb-1 group-hover:text-amber-900 uppercase">
                                                {prod.description}
                                            </h4>
                                            <div className="flex flex-wrap gap-2 items-center">
                                                <span className="inline-flex items-center bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono group-hover:bg-amber-100 group-hover:text-amber-700">
                                                    INT: {prod.code}
                                                </span>
                                                {prod.barcode && (
                                                    <span className="inline-flex items-center bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
                                                        BAR: {prod.barcode}
                                                    </span>
                                                )}
                                                {prod.brand && (
                                                    <span className="text-xs text-gray-400 font-semibold italic group-hover:text-amber-600/70">
                                                        • {prod.brand}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-gray-100 p-2 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex justify-end px-6 py-4">
                            <button
                                onClick={() => { setIsDuplicateModalOpen(false); setDuplicateProducts([]); }}
                                className="px-5 py-2.5 text-gray-500 font-bold hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all active:scale-95"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Scanner Component */}
            {showScanner && (
                <div className="fixed inset-0 z-[60] bg-transparent flex flex-col">
                    <div className="relative h-full w-full">
                        <Scanner
                            onScan={onScannerDecode}
                            onCancel={() => setShowScanner(false)}
                            isEnabled={showScanner}
                        />
                    </div>
                </div>
            )}

            {/* Sync Status Badge */}
            <div className="fixed bottom-20 right-4 z-40">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg text-[10px] font-bold border transition-all ${isSyncing ? 'bg-blue-500 text-white border-blue-400 animate-pulse' : 'bg-white text-gray-400 border-gray-100'}`}>
                    <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-white' : 'bg-green-500'}`}></div>
                    {isSyncing ? 'SINCRONIZANDO...' : `CATÁLOGO: ${lastSync ? lastSync.toLocaleTimeString([]) : 'PENDIENTE'}`}
                    {!isSyncing && (
                        <button onClick={() => syncProducts(true)} className="ml-1 hover:text-blue-500" title="Sincronizar ahora" type="button">
                            <RotateCcw className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BarcodeControl;
