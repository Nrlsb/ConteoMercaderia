import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import Scanner from './Scanner';
import api from '../api';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';

const BarcodeControl = () => {
    const [scannedBarcode, setScannedBarcode] = useState('');
    const [inputBarcode, setInputBarcode] = useState('');
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

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

    // Scanner state
    const [showScanner, setShowScanner] = useState(false);

    // Tabs state
    const [activeTab, setActiveTab] = useState('scanner'); // 'scanner' | 'history'

    // History state
    const [actionHistory, setActionHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Fetch history on mount and when switching to history tab
    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab]);

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const response = await api.get('/api/barcode-history');
            setActionHistory(response.data);
        } catch (err) {
            console.error('Error fetching history:', err);
            toast.error('Error al cargar el historial');
        } finally {
            setHistoryLoading(false);
        }
    };

    const logHistoryEvent = async (action_type, product, details) => {
        try {
            await api.post('/api/barcode-history', {
                action_type,
                product_id: product.id,
                product_description: product.description || 'Producto sin descripción',
                details
            });
            // If we are currently on the history tab, refresh it
            if (activeTab === 'history') {
                fetchHistory();
            }
        } catch (err) {
            console.error('Error logging history:', err);
            // Non-blocking error for the user
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

    const lookupProduct = async (code) => {
        setLoading(true);
        setError(null);
        setProduct(null);
        setEditMode(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedProductToLink(null);

        try {
            const response = await api.get(`/api/products/barcode/${code}`);
            const data = response.data;
            setProduct(data);
            setEditData({
                description: data.description || '',
                code: data.code || '',
                barcode: data.barcode || '',
                provider_code: data.provider_code || ''
            });
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

            const changes = [];
            if (product.description !== updated.description) changes.push('Descripción');
            if (product.code !== updated.code) changes.push('Cód Interno');
            if (product.provider_code !== updated.provider_code) changes.push('Cód Proveedor');
            if (product.barcode !== updated.barcode) changes.push('Cód Barras');

            const detailsStr = changes.join(', ') || 'Modificación general';

            // Log to database
            await logHistoryEvent('edit', updated, detailsStr);

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
            const response = await api.get(`/api/products/search?q=${encodeURIComponent(query)}`);
            const data = response.data;
            setSearchResults(data);
            if (data.length === 0) {
                toast.info('No se encontraron productos para esta búsqueda');
            }
        } catch (err) {
            console.error('Search error:', err);
            toast.error('Error de conexión al buscar');
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
                    maxResults: 1,
                    prompt: 'Diga el nombre del producto a buscar',
                    partialResults: false,
                    popup: true
                }).then(result => {
                    if (result && result.matches && result.matches.length > 0) {
                        const transcript = result.matches[0];
                        setSearchQuery(transcript);
                        executeSearch(transcript);
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

            // Log to database
            await logHistoryEvent('link', updated, `Cód Barras: ${scannedBarcode}`);

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
        setSearchQuery('');
        setSearchResults([]);
        setSelectedProductToLink(null);
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
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-800 text-center sm:text-left">Control de Códigos de Barras</h2>
                    {activeTab === 'scanner' && (
                        <button
                            onClick={resetView}
                            className="btn btn-secondary text-sm flex items-center gap-2 w-full sm:w-auto justify-center"
                            title="Limpiar pantalla"
                        >
                            <i className="fas fa-redo"></i> Limpiar
                        </button>
                    )}
                </div>

                {/* Tabs Navigation */}
                <div className="flex border-b border-gray-200 mb-6 w-full">
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'scanner' ? 'border-primary-600 text-primary-600 bg-primary-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('scanner')}
                    >
                        <i className="fas fa-barcode mr-1.5 sm:mr-2"></i> Escanear
                    </button>
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'history' ? 'border-primary-600 text-primary-600 bg-primary-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <i className="fas fa-history mr-1.5 sm:mr-2"></i> Historial
                        {actionHistory.length > 0 && (
                            <span className="ml-1.5 sm:ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs border border-gray-200">{actionHistory.length}</span>
                        )}
                    </button>
                </div>

                {activeTab === 'scanner' && (
                    <div className="animate-fade-in">
                        {/* Main Scanner Input */}
                        <form onSubmit={handleScan} className="mb-6 sm:mb-8">
                            <div className="relative flex flex-col sm:flex-row items-center max-w-lg mx-auto gap-2 sm:gap-3">
                                <div className="relative w-full">
                                    <i className="fas fa-barcode absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg sm:text-xl"></i>
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
                                    className="w-full sm:w-auto px-6 py-3 sm:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 font-medium text-base sm:text-base flex-shrink-0 h-auto sm:h-[60px]"
                                >
                                    Buscar
                                </button>
                            </div>
                            <div className="flex justify-center mt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowScanner(true)}
                                    className="btn bg-gray-800 text-white hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <i className="fas fa-camera"></i> Usar Cámara / Escáner Nativo
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
                                        <i className="fas fa-check-circle text-green-600"></i>
                                        Producto Encontrado
                                    </h3>
                                    {!editMode && (
                                        <button
                                            onClick={() => setEditMode(true)}
                                            className="px-4 py-2 bg-white sm:bg-transparent border sm:border-0 border-gray-200 rounded text-gray-700 sm:text-primary-600 font-medium text-sm flex items-center justify-center gap-2 w-full sm:w-auto hover:bg-gray-50"
                                        >
                                            <i className="fas fa-edit"></i> Editar
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
                                                <i className="fas fa-barcode"></i> Cód. Barras Activo
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
                            <div className="border border-amber-200 bg-amber-50 rounded-lg p-6 animate-fade-in shadow-sm">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 text-amber-800">
                                    <i className="fas fa-exclamation-triangle text-2xl text-amber-500 flex-shrink-0"></i>
                                    <div>
                                        <h3 className="text-lg font-bold">Código no encontrado</h3>
                                        <p className="text-sm break-all">El código de barras <span className="font-bold underline">{scannedBarcode}</span> no está asociado a ningún producto.</p>
                                    </div>
                                </div>

                                <div className="mt-6 bg-white p-4 sm:p-6 rounded-2xl border border-amber-200 shadow-md">
                                    <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                            <i className="fas fa-search"></i>
                                        </div>
                                        Vincular a un producto existente
                                    </h4>

                                    <form onSubmit={handleSearchSubmit} className="relative mb-4">
                                        <div className="relative flex items-center">
                                            <i className="fas fa-box absolute left-4 text-gray-400 text-lg"></i>
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={handleSearchInputChange}
                                                placeholder="Nombre del producto..."
                                                className="w-full pl-12 pr-24 py-3.5 rounded-xl border-2 border-gray-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-50 transition-all text-base shadow-sm outline-none bg-gray-50 focus:bg-white"
                                            />
                                            {searchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSearchQuery('');
                                                        setSearchResults([]);
                                                    }}
                                                    className="absolute right-12 text-gray-400 hover:text-gray-600 p-2 focus:outline-none"
                                                    title="Limpiar búsqueda"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={handleVoiceSearch}
                                                className={`absolute right-2 p-2.5 rounded-lg transition-all focus:outline-none ${isListening ? 'bg-red-100 text-red-600 animate-pulse scale-110' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                                title="Buscar por voz"
                                            >
                                                <i className="fas fa-microphone text-lg"></i>
                                            </button>
                                        </div>
                                        <button type="submit" className="hidden">Buscar</button>
                                    </form>

                                    {searching && (
                                        <div className="flex justify-center py-4">
                                            <i className="fas fa-spinner fa-spin text-amber-500 text-2xl"></i>
                                        </div>
                                    )}

                                    {/* Search Results */}
                                    {!selectedProductToLink && searchResults.length > 0 && (
                                        <div className="mt-4 border border-gray-100 rounded-xl bg-gray-50/50 p-2 sm:p-3 shadow-inner">
                                            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                                                {searchResults.map((item) => (
                                                    <div key={item.id} className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:border-amber-300 hover:shadow transition-all group flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                                                        <div className="flex-1 w-full">
                                                            <h5 className="font-bold text-gray-900 mb-1.5 leading-tight group-hover:text-amber-700 transition-colors">{item.description}</h5>
                                                            <div className="flex flex-wrap text-xs text-gray-600 gap-2 items-center">
                                                                <span className="bg-gray-100 px-2 py-1 rounded-md font-mono border border-gray-200">
                                                                    <span className="text-gray-400 font-sans text-[10px] uppercase tracking-wider mr-1">Cód</span>
                                                                    {item.code}
                                                                </span>
                                                                {item.barcode && (
                                                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-mono border border-blue-100 flex items-center gap-1">
                                                                        <i className="fas fa-barcode"></i> {item.barcode}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => setSelectedProductToLink(item)}
                                                            className="w-full sm:w-auto px-5 py-2.5 bg-amber-100 text-amber-800 hover:bg-amber-500 hover:text-white rounded-lg font-bold transition-all text-sm flex items-center justify-center gap-2 active:scale-95 shrink-0"
                                                        >
                                                            <i className="fas fa-check"></i> Seleccionar
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selectedProductToLink && (
                                        <div className="mt-4 border-2 border-amber-300 bg-amber-50 rounded-xl p-5 shadow-md animate-fade-in relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200 rounded-bl-full opacity-50 pointer-events-none -z-0"></div>

                                            <div className="flex justify-between items-start mb-4 relative z-10">
                                                <h5 className="font-bold text-amber-900 flex items-center gap-2 text-base sm:text-lg leading-tight pr-2">
                                                    <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-700 flex shrink-0 items-center justify-center">
                                                        <i className="fas fa-link"></i>
                                                    </div>
                                                    Confirmar Vinculación
                                                </h5>
                                                <button
                                                    onClick={() => setSelectedProductToLink(null)}
                                                    className="w-8 h-8 flex shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white hover:text-gray-700 transition-colors shadow-sm bg-white/50"
                                                    title="Cancelar selección"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>

                                            <div className="bg-white p-3 sm:p-4 rounded-xl border border-amber-100 mb-4 shadow-sm relative z-10 w-full overflow-hidden">
                                                <p className="text-sm sm:text-base font-bold text-gray-800 mb-3 break-words">{selectedProductToLink.description}</p>
                                                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm text-gray-600 bg-gray-50 p-2 sm:p-3 rounded-lg border border-gray-100">
                                                    <div>
                                                        <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Cód Int</span>
                                                        <span className="font-mono text-gray-900 font-medium break-all">{selectedProductToLink.code}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Cód Prov</span>
                                                        <span className="font-mono text-gray-900 font-medium break-all">{selectedProductToLink.provider_code || '-'}</span>
                                                    </div>
                                                    <div className="col-span-2 pt-2 mt-1 border-t border-gray-200/60 w-full">
                                                        <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Cód Barras Actual</span>
                                                        {selectedProductToLink.barcode ? (
                                                            <span className="inline-flex bg-white border border-gray-200 px-2 py-1.5 sm:px-3 rounded-md text-gray-800 font-mono text-xs sm:text-sm tracking-widest shadow-sm items-center gap-2 w-full sm:w-fit break-all">
                                                                <i className="fas fa-barcode text-gray-400 shrink-0"></i>
                                                                <span className="break-all">{selectedProductToLink.barcode}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400 italic text-sm">Ninguno asociado</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-primary-50 border-2 border-primary-200 p-3 sm:p-4 rounded-xl mb-4 sm:mb-5 text-center relative z-10 shadow-sm overflow-hidden group w-full">
                                                <div className="absolute inset-0 bg-primary-100 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                                                <p className="text-[10px] sm:text-xs text-primary-600 font-bold uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
                                                    <i className="fas fa-qrcode"></i> Nuevo Código a Vincular
                                                </p>
                                                <div className="bg-white px-2 sm:px-4 py-2 rounded-lg border border-primary-100 shadow-sm w-full mx-auto max-w-full">
                                                    <p className="text-lg sm:text-2xl font-mono font-black text-primary-800 tracking-wider sm:tracking-widest break-all">
                                                        {scannedBarcode}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 relative z-10 w-full">
                                                <button
                                                    onClick={() => setSelectedProductToLink(null)}
                                                    className="w-full sm:flex-1 py-2.5 sm:py-3 bg-white border-2 border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 text-sm sm:text-base"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={() => handleLinkProduct(selectedProductToLink)}
                                                    className="w-full sm:flex-[2] py-2.5 sm:py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-bold hover:from-amber-600 hover:to-amber-700 transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 text-base sm:text-lg"
                                                >
                                                    <i className="fas fa-save"></i> Confirmar
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
                        {historyLoading ? (
                            <div className="flex justify-center py-10">
                                <i className="fas fa-spinner fa-spin text-3xl text-primary-500"></i>
                            </div>
                        ) : actionHistory.length > 0 ? (
                            <div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                        <i className="fas fa-history text-gray-500"></i>
                                        Historial Reciente
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {actionHistory.map(item => (
                                        <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:shadow transition-shadow">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-semibold text-gray-800 text-base">{item.product_description}</p>
                                                    {item.users?.username && (
                                                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                            <i className="fas fa-user text-[10px]"></i> {item.users.username}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1.5 flex items-center gap-2">
                                                    {item.action_type === 'edit' ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-100 text-blue-700 font-medium text-xs">
                                                            <i className="fas fa-edit"></i>
                                                            Editado: {item.details}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-green-100 text-green-700 font-medium text-xs">
                                                            <i className="fas fa-link"></i>
                                                            Vinculado: {item.details}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-500 flex items-center gap-1.5 sm:justify-end border-t sm:border-t-0 border-gray-200 pt-2 sm:pt-0 shrink-0">
                                                <i className="far fa-clock"></i>
                                                {new Date(item.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-500">
                                <i className="fas fa-clipboard-list text-4xl mb-3 text-gray-300"></i>
                                <p>No hay cambios recientes registrados en la base de datos.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Scanner Modal overlay */}
            {showScanner && (
                <div className="fixed inset-0 z-50 flex flex-col bg-black">
                    <div className="flex justify-between items-center p-4 bg-gray-900 text-white">
                        <h3 className="text-lg font-bold">Escanear Código</h3>
                        <button
                            onClick={() => setShowScanner(false)}
                            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
                        >
                            <i className="fas fa-times text-xl w-6 h-6 flex items-center justify-center"></i>
                        </button>
                    </div>
                    <div className="flex-1 relative">
                        <Scanner
                            onScan={onScannerDecode}
                            isEnabled={showScanner}
                        />
                        <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
                            <p className="bg-black/50 text-white px-4 py-2 rounded-full text-sm pointer-events-none backdrop-blur-sm">
                                Apunta la cámara al código de barras
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BarcodeControl;
