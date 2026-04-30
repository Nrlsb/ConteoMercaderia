import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

import { toast } from 'sonner';
import Scanner from './Scanner';
import api from '../api';
import { db } from '../db';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import { useProductSync } from '../hooks/useProductSync';
import { RotateCcw, Barcode, History, Camera, CheckCircle2, Edit, AlertTriangle, Search, Package, X, Mic, Loader2, Link, Clock, User, ClipboardList, Download, Filter, FileSpreadsheet, RefreshCcw, ChevronLeft, ChevronRight, ChevronDown, Trash2, Plus, Upload } from 'lucide-react';

const BarcodeControl = () => {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'superadmin';
    const isAdmin = ['superadmin', 'admin', 'branch_admin'].includes(user?.role);
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

    // Sync Badge Expansion State
    const [isSyncBadgeExpanded, setIsSyncBadgeExpanded] = useState(() => localStorage.getItem('isSyncBadgeExpanded') !== 'false');

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
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [productCodeFilter, setProductCodeFilter] = useState('');
    const [isScanningFilter, setIsScanningFilter] = useState(false);
    const [showUnique, setShowUnique] = useState(true);

    // History pagination state
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [historyTotal, setHistoryTotal] = useState(0);

    // Layout pagination state
    const [layoutPage, setLayoutPage] = useState(1);
    const [layoutTotalPages, setLayoutTotalPages] = useState(1);
    const [layoutTotal, setLayoutTotal] = useState(0);
    // Layout Multi-user filter state
    const [showUserFilter, setShowUserFilter] = useState(false);
    const userFilterRef = useRef(null);

    // History Multi-user filter state
    const [showHistoryUserFilter, setShowHistoryUserFilter] = useState(false);
    const userHistoryFilterRef = useRef(null);
    
    // Selection state for History
    const [selectedHistory, setSelectedHistory] = useState([]);
    const [isAllFilteredSelected, setIsAllFilteredSelected] = useState(false);
    
    // Selection state for Layout (Superadmin only)
    const [selectedLayout, setSelectedLayout] = useState([]);

    // Insertion state
    const [showInsertModal, setShowInsertModal] = useState(false);
    const [insertReference, setInsertReference] = useState({ prev: null, next: null });
    const [insertProductSearch, setInsertProductSearch] = useState('');
    const [insertSearchResults, setInsertSearchResults] = useState([]);
    const [insertLoading, setInsertLoading] = useState(false);
    
    // Missing products state
    const [missingProducts, setMissingProducts] = useState([]);
    const [missingLoading, setMissingLoading] = useState(false);
    const [pendingInsertionProduct, setPendingInsertionProduct] = useState(null);
    const [missingSearchQuery, setMissingSearchQuery] = useState('');
    const [missingSuggestions, setMissingSuggestions] = useState([]);
    const [showMissingSuggestions, setShowMissingSuggestions] = useState(false);
    const [missingPage, setMissingPage] = useState(1);
    const [missingTotalPages, setMissingTotalPages] = useState(1);
    const [missingTotal, setMissingTotal] = useState(0);

    // Layout search suggestions
    const [layoutSuggestions, setLayoutSuggestions] = useState([]);
    const [showLayoutSuggestions, setShowLayoutSuggestions] = useState(false);
    const [isSearchingLayout, setIsSearchingLayout] = useState(false);


    const [saveToLayout, setSaveToLayout] = useState(() => {
        const saved = localStorage.getItem('saveToLayout');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [pendingScans, setPendingScans] = useState([]);
    const [showPendingModal, setShowPendingModal] = useState(false);

    const [allowRepetition, setAllowRepetition] = useState(() => {
        const saved = localStorage.getItem('allowRepetition');
        return saved !== null ? JSON.parse(saved) : true;
    });

    // Sesión local de códigos escaneados para evitar repetición inmediata si está desactivado
    const [scannedInSession, setScannedInSession] = useState(new Set());

    // Guide state
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (userFilterRef.current && !userFilterRef.current.contains(event.target)) {
                setShowUserFilter(false);
            }
            if (userHistoryFilterRef.current && !userHistoryFilterRef.current.contains(event.target)) {
                setShowHistoryUserFilter(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Layout suggestions click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest('.layout-search-container')) {
                setShowLayoutSuggestions(false);
            }
            if (!event.target.closest('.missing-search-container')) {
                setShowMissingSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Save toggle preferences to localStorage
    useEffect(() => {
        localStorage.setItem('saveToLayout', JSON.stringify(saveToLayout));
    }, [saveToLayout]);

    useEffect(() => {
        localStorage.setItem('allowRepetition', JSON.stringify(allowRepetition));
    }, [allowRepetition]);

    // Fetch history/layout on mount and when switching tabs
    useEffect(() => {
        checkPendingSync();
        if (activeTab === 'history') {
            fetchHistory(1);
            fetchUsersForFilter();
        } else if (activeTab === 'layout') {
            syncOfflineLayoutData(); // Intentar sincronizar al entrar a layout
            fetchLayout(1);
            fetchUsersForFilter();
        } else if (activeTab === 'missing') {
            fetchMissingProducts(1);
        }

        window.addEventListener('online', syncOfflineLayoutData);
        return () => window.removeEventListener('online', syncOfflineLayoutData);
    }, [activeTab]);

    const checkPendingSync = async () => {
        try {
            const count = await db.pending_syncs
                .where({ type: 'layout_scan' })
                .count();
            setPendingSyncCount(count);
        } catch (e) {
            console.error('Error counting pending syncs:', e);
        }
    };

    const syncOfflineLayoutData = async () => {
        const queue = await db.pending_syncs
            .where({ type: 'layout_scan' })
            .toArray();

        if (queue.length === 0) return;

        toast.info(`Sincronizando ${queue.length} escaneos realizados offline...`, { id: 'layout-sync' });

        try {
            for (const scan of queue) {
                await api.post('/api/barcode-history', {
                    ...scan.data,
                    created_at: new Date(scan.timestamp).toISOString()
                });
                await db.pending_syncs.delete(scan.id);
            }
            await checkPendingSync();
            setPendingScans([]); // Limpiar lista local si estaba abierta
            setShowPendingModal(false);
            toast.success('Sincronización de layout completada', { id: 'layout-sync' });
            if (activeTab === 'layout') fetchLayout();
        } catch (error) {
            console.error('Error syncing layout:', error);
            toast.error('Error al conocer el estado de la red. Reintentando...', { id: 'layout-sync' });
        }
    };

    const fetchPendingScans = async () => {
        try {
            const queue = await db.pending_syncs
                .where({ type: 'layout_scan' })
                .reverse()
                .toArray();
            setPendingScans(queue);
            setShowPendingModal(true);
        } catch (e) {
            console.error('Error fetching pending scans:', e);
            toast.error('Error al cargar la lista de pendientes');
        }
    };

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

    const fetchLayout = async (page = 1) => {
        setLayoutLoading(true);
        try {
            let url = `/api/barcode-history?action_type=SCAN,ADD_BARCODE,UPDATE_BARCODE&page=${page}&limit=50`;
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedUserIds.length > 0) params.append('user_id', selectedUserIds.join(','));
            if (productCodeFilter) {
                params.append('productCode', productCodeFilter);
                params.append('includeContext', 'true');
            }
            if (showUnique) params.append('unique', 'true');

            if (params.toString()) {
                url += `&${params.toString()}`;
            }

            const response = await api.get(url);
            // El backend ahora devuelve un objeto con data, total, page, totalPages
            const { data, total, page: respPage, totalPages } = response.data;
            
            setLayoutHistory(data || []);
            setLayoutPage(respPage);
            setLayoutTotalPages(totalPages);
            setLayoutTotal(total);
        } catch (err) {
            console.error('Error fetching layout:', err);
            toast.error('Error al cargar el layout');
        } finally {
            setLayoutLoading(false);
        }
    };

    const fetchHistory = async (page = 1) => {
        setHistoryLoading(true);
        try {
            let url = `/api/barcode-history?page=${page}&limit=50`;
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedUserIds.length > 0) params.append('user_id', selectedUserIds.join(','));
            if (productCodeFilter) params.append('productCode', productCodeFilter);

            if (params.toString()) {
                url += `&${params.toString()}`;
            }

            const response = await api.get(url);
            const { data, total, page: respPage, totalPages } = response.data;

            setActionHistory(data || []);
            setHistoryPage(respPage);
            setHistoryTotalPages(totalPages);
            setHistoryTotal(total);
        } catch (err) {
            console.error('Error fetching history:', err);
            toast.error('Error al cargar el historial');
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchMissingProducts = async (page = 1, query = null) => {
        const searchQuery = query !== null ? query : missingSearchQuery;
        setMissingLoading(true);
        try {
            const response = await api.get(`/api/barcode-history/missing?page=${page}&limit=50&q=${searchQuery}`);
            const { data, total, page: respPage, totalPages } = response.data;
            setMissingProducts(data || []);
            setMissingPage(respPage);
            setMissingTotalPages(totalPages);
            setMissingTotal(total);
        } catch (err) {
            console.error('Error fetching missing products:', err);
            toast.error('Error al cargar productos faltantes');
        } finally {
            setMissingLoading(false);
        }
    };

    const handleSyncMissingExcel = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setMissingLoading(true);
        try {
            await api.post('/api/barcode-history/missing/sync', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Sincronización exitosa');
            fetchMissingProducts(1);
        } catch (err) {
            console.error('Error syncing missing excel:', err);
            toast.error('Error al sincronizar el Excel');
        } finally {
            setMissingLoading(false);
            e.target.value = ''; // Reset input
        }
    };

    const renderPagination = (currentPage, totalPages, totalItems, onPageChange, itemsPerPage = 50) => {
        if (totalPages <= 1) return null;

        const pages = [];
        const maxPagesToShow = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        return (
            <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm animate-fade-in">
                <div className="text-sm text-gray-500">
                    Mostrando <span className="font-semibold text-gray-800">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-semibold text-gray-800">{Math.min(currentPage * itemsPerPage, totalItems)}</span> de <span className="font-semibold text-gray-800">{totalItems}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    
                    {startPage > 1 && (
                        <>
                            <button onClick={() => onPageChange(1)} className="w-9 h-9 rounded-lg text-sm font-medium hover:bg-gray-100 transition-all text-gray-600">1</button>
                            {startPage > 2 && <span className="text-gray-400 px-1">...</span>}
                        </>
                    )}
                    {pages.map(p => (
                        <button
                            key={p}
                            onClick={() => onPageChange(p)}
                            className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${currentPage === p ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            {p}
                        </button>
                    ))}

                    {endPage < totalPages && (
                        <>
                            {endPage < totalPages - 1 && <span className="text-gray-400 px-1">...</span>}
                            <button onClick={() => onPageChange(totalPages)} className="w-9 h-9 rounded-lg text-sm font-medium hover:bg-gray-100 transition-all text-gray-600">{totalPages}</button>
                        </>
                    )}

                    <button
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        );
    };

    const handleExportCsv = async (isLayout = false) => {
        try {
            if (!startDate || !endDate) {
                toast.error('Debe seleccionar Fecha Desde y Fecha Hasta para exportar.');
                return;
            }

            let url = '/api/barcode-history/export';
            const params = new URLSearchParams();
            params.append('startDate', startDate);
            params.append('endDate', endDate);
            if (selectedUserIds.length > 0) params.append('user_id', selectedUserIds.join(','));
            if (productCodeFilter) params.append('productCode', productCodeFilter);
            
            if (isLayout) {
                params.append('action_type', 'SCAN,ADD_BARCODE,UPDATE_BARCODE');
                if (showUnique) params.append('unique', 'true');
            }

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
                toast.success(`Exportación generada: ${response.data.files.length} archivo(s) CSV (bloques de 300)`);
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

    const handleExportExcel = async (isLayout = false) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedUserIds.length > 0) params.append('user_id', selectedUserIds.join(','));
            if (productCodeFilter) params.append('productCode', productCodeFilter);
            
            if (isLayout) {
                params.append('action_type', 'SCAN,ADD_BARCODE,UPDATE_BARCODE');
                if (showUnique) params.append('unique', 'true');
            }

            const url = `/api/barcode-history/layout-excel?${params.toString()}`;
            
            const response = await api.get(url, { responseType: 'blob' });
            
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${isLayout ? 'Layout' : 'Historial'}_${startDate || 'completo'}_al_${endDate || 'hoy'}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
            
            toast.success(`Excel del ${isLayout ? 'Layout' : 'Historial'} descargado correctamente`);
        } catch (err) {
            console.error('Error exporting to excel:', err);
            if (err.response && err.response.status === 404) {
                toast.error('No hay datos para exportar en el rango seleccionado');
            } else {
                toast.error('Error al descargar el Excel');
            }
        } finally {
            setLoading(false);
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
        const scanData = {
            action_type: 'SCAN',
            product_id: productData?.id || null,
            product_description: productData?.description || `Código desconocido: ${code}`,
            details: `Escaneo de ${code}`
        };

        if (!navigator.onLine) {
            try {
                await db.pending_syncs.add({
                    type: 'layout_scan',
                    data: scanData,
                    timestamp: Date.now()
                });
                checkPendingSync();
                toast.info('Escaneo guardado localmente (sin conexión)');
                return;
            } catch (e) {
                console.error('Error saving scan locally:', e);
            }
        }

        try {
            await api.post('/api/barcode-history', scanData);
        } catch (err) {
            console.error('Error logging scan:', err);
            // Fallback: guardar localmente si falla la API (posible timeout/error red)
            try {
                await db.pending_syncs.add({
                    type: 'layout_scan',
                    data: scanData,
                    timestamp: Date.now()
                });
                checkPendingSync();
                toast.warning('Error de red. Escaneo guardado localmente.');
            } catch (e) {
                console.error('Error in emergency local save:', e);
            }
        }
    };

    const selectProduct = (productData) => {
        setProduct(productData);
        setEditData({
            description: productData.description || '',
            code: productData.code || '',
            barcode: productData.barcode || '',
            provider_code: productData.provider_code || '',
            provider_description: productData.provider_description || ''
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
                // 1. Try Local DB first (INSTANT)
                const localData = await getProductByCode(code);
                if (localData) {
                    data = localData;
                } else {
                    // 2. Fallback to API (ONLY if not found locally)
                    if (navigator.onLine) {
                        const response = await api.get(`/api/products/barcode/${code}`);
                        data = response.data;
                    } else {
                        throw { response: { status: 404 } };
                    }
                }
                productCacheRef.current[code] = data; // Guardar en caché
            }

            // Liberar loading lo antes posible si ya tenemos la data
            setLoading(false);

            if (Array.isArray(data) && data.length > 1) {
                setDuplicateProducts(data);
                setIsDuplicateModalOpen(true);
            } else {
                const foundProduct = Array.isArray(data) ? data[0] : (data || null);

                const productIdentifier = foundProduct?.id || code;
                if (!allowRepetition && scannedInSession.has(productIdentifier)) {
                    toast.warning('Este producto ya fue escaneado en esta sesión.');
                    selectProduct(foundProduct);
                    if (!data) setError('code_not_found');
                    setInputBarcode('');
                    return;
                }

                selectProduct(foundProduct);
                if (!data) setError('code_not_found');

                // Registro secundario (por detrás)
                if (saveToLayout) {
                    logScan(foundProduct, code);
                    setScannedInSession(prev => new Set(prev).add(productIdentifier));
                }
            }
        } catch (err) {
            console.error('Lookup error:', err);
            setLoading(false);
            if (err.response && err.response.status === 404) {
                setError('code_not_found');
            } else {
                const msg = err.response?.data?.message || 'Error al buscar el producto';
                setError(msg);
                toast.error(msg);
            }
        } finally {
            // Asegurar que el input se limpie y procese
            setLoading(false);
            setInputBarcode('');
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
                provider_code: updated.provider_code || '',
                provider_description: updated.provider_description || ''
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

    const handleToggleHistorySelection = (item) => {
        setSelectedHistory(prev => {
            const isSelected = prev.find(i => i.id === item.id);
            if (isSelected) {
                return prev.filter(i => i.id !== item.id);
            } else {
                return [...prev, item];
            }
        });
    };

    const handleSelectAllHistory = () => {
        if (isAllFilteredSelected) {
            setIsAllFilteredSelected(false);
            setSelectedHistory([]);
            return;
        }

        if (selectedHistory.length === actionHistory.length && actionHistory.length > 0) {
            setSelectedHistory([]);
            setIsAllFilteredSelected(false);
        } else {
            setSelectedHistory([...actionHistory]);
            // No activamos isAllFilteredSelected automáticamente aquí,
            // sino que mostraremos el banner para que el usuario decida si quiere "TODOS" los del filtro.
        }
    };

    const handleSelectTotalFilteredResults = () => {
        setSelectedHistory([...actionHistory]); // Mantenemos la visual de la página actual seleccionada
        setIsAllFilteredSelected(true);
    };

    const handleBatchToLayout = async () => {
        if (!isAllFilteredSelected && selectedHistory.length === 0) return;
        
        const count = isAllFilteredSelected ? historyTotal : selectedHistory.length;
        if (!window.confirm(`¿Pasar ${count} productos al Layout? (Se ignorarán automáticamente los que ya estén registrados hoy)`)) {
            return;
        }

        setLoading(true);
        try {
            let response;
            if (isAllFilteredSelected) {
                // Usar nuevo endpoint enviando filtros
                response = await api.post('/api/barcode-history/bulk-transfer-filtered', {
                    startDate,
                    endDate,
                    user_id: null // Opcional si queremos filtrar más, pero por ahora según interfaz
                });
            } else {
                const itemsToProcess = selectedHistory.map(item => ({
                    action_type: 'SCAN',
                    product_id: item.product_id,
                    product_description: item.product_description,
                    details: item.details || 'Re-escaneo desde historial',
                    created_by: item.created_by, // Enviar el autor original
                    created_at: item.created_at // Preservar fecha original
                }));

                response = await api.post('/api/barcode-history/bulk', { items: itemsToProcess });
            }

            const { processed, skipped } = response.data;
            
            if (processed === 0 && skipped > 0) {
                toast.info('Todos los productos seleccionados ya se encontraban en el Layout hoy.');
            } else {
                toast.success(`${processed} productos agregados.${skipped > 0 ? ` (${skipped} duplicados ignorados)` : ''}`);
            }
            
            setSelectedHistory([]);
            setIsAllFilteredSelected(false);
            if (activeTab === 'layout') fetchLayout(1);
        } catch (err) {
            console.error('Error in batch move to layout:', err);
            toast.error(err.response?.data?.message || 'Error al pasar productos al Layout');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteBulk = async (ids, type) => {
        if (!ids || ids.length === 0) return;
        
        if (!window.confirm(`¿Estás seguro de eliminar permanentemente ${ids.length} registros del ${type}? Esta acción no se puede deshacer.`)) {
            return;
        }

        setLoading(true);
        try {
            await api.delete('/api/barcode-history/bulk', { data: { ids } });
            toast.success(`${ids.length} registros eliminados correctamente`);
            
            if (type === 'Historial') {
                setSelectedHistory([]);
                setIsAllFilteredSelected(false);
                fetchHistory(historyPage);
            } else {
                setSelectedLayout([]);
                fetchLayout(layoutPage);
            }
        } catch (err) {
            console.error('Error deleting bulk items:', err);
            toast.error(err.response?.data?.message || 'Error al eliminar los registros');
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
        if (isScanningFilter) {
            if (activeTab === 'missing') {
                setMissingSearchQuery(code);
            } else {
                setProductCodeFilter(code);
                if (activeTab === 'layout') fetchLayout(1);
                else if (activeTab === 'history') fetchHistory(1);
            }
            setIsScanningFilter(false);
            return;
        }
        setScannedBarcode(code);
        await lookupProduct(code);
    };

    const handleOpenInsertModal = (prevItem, nextItem) => {
        if (pendingInsertionProduct) {
            // Si hay un producto pendiente de los faltantes del Excel
            handleConfirmInsertion(pendingInsertionProduct, { prev: prevItem, next: nextItem });
            return;
        }
        setInsertReference({ prev: prevItem, next: nextItem });
        setInsertProductSearch('');
        setInsertSearchResults([]);
        setShowInsertModal(true);
    };

    const handlePrepareInsertion = (product) => {
        setPendingInsertionProduct(product);
        setActiveTab('layout');
        toast.info(`Producto "${product.description}" seleccionado. Ahora elegí el lugar en el Layout donde querés insertarlo.`, { duration: 5000 });
    };

    const handleExecuteInsertSearch = async (query) => {
        if (!query.trim()) return;
        setInsertLoading(true);
        try {
            const results = await searchProductsLocally(query);
            setInsertSearchResults(results);
        } catch (error) {
            console.error('Error searching for insertion:', error);
        } finally {
            setInsertLoading(false);
        }
    };

    const handleConfirmInsertion = async (selectedProd, reference = null) => {
        setLoading(true);
        try {
            const ref = reference || insertReference;
            let targetTime;
            const now = new Date().toISOString();
            
            if (ref.prev && ref.next) {
                // Interpolar entre dos tiempos
                const timePrev = new Date(ref.prev.created_at).getTime();
                const timeNext = new Date(ref.next.created_at).getTime();
                targetTime = new Date((timePrev + timeNext) / 2).toISOString();
            } else if (ref.prev) {
                // Insertar al principio (arriba de prev)
                // Como es DESC, arriba de prev significa un tiempo mayor
                const timePrev = new Date(ref.prev.created_at).getTime();
                targetTime = new Date(timePrev + 1000).toISOString(); // 1 segundo después
            } else if (ref.next) {
                // Insertar al final (debajo de next)
                // Como es DESC, debajo de next significa un tiempo menor
                const timeNext = new Date(ref.next.created_at).getTime();
                targetTime = new Date(timeNext - 1000).toISOString(); // 1 segundo antes
            } else {
                targetTime = now;
            }

            const scanData = {
                action_type: 'SCAN',
                product_id: selectedProd.id,
                product_description: selectedProd.description,
                details: 'Inserción manual en layout',
                created_at: targetTime
            };

            await api.post('/api/barcode-history', scanData);
            toast.success('Producto insertado correctamente');
            setShowInsertModal(false);
            setPendingInsertionProduct(null);
            fetchLayout(layoutPage);
            fetchMissingProducts();
        } catch (err) {
            console.error('Error inserting product:', err);
            toast.error('Error al insertar el producto');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-2 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-md p-3 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-6 gap-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 text-center sm:text-left">Control de Códigos de Barras</h2>
                        <button
                            onClick={() => setShowGuide(true)}
                            className="w-7 h-7 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold text-sm flex items-center justify-center transition-colors border border-blue-300 shadow-sm"
                            title="Ver guía de uso"
                        >
                            !
                        </button>
                    </div>
                    {activeTab === 'scanner' && (
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            {pendingSyncCount > 0 && (
                                <button
                                    onClick={fetchPendingScans}
                                    className="btn bg-amber-100 text-amber-700 hover:bg-amber-200 text-sm flex items-center gap-2 border border-amber-300 animate-pulse"
                                    title="Ver escaneos pendientes"
                                >
                                    <RefreshCcw className="w-4 h-4" /> {pendingSyncCount} Pendientes
                                </button>
                            )}
                            <button
                                onClick={resetView}
                                className="btn btn-secondary text-sm flex items-center gap-2 w-full sm:w-auto justify-center"
                                title="Limpiar pantalla"
                                disabled={loading}
                            >
                                <RotateCcw className="w-4 h-4" /> Limpiar
                            </button>
                        </div>
                    )}
                </div>

                {showGuide && ReactDOM.createPortal(
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setShowGuide(false)}>

                        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-lg flex items-center justify-center border border-blue-300">!</div>
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
                                <button onClick={() => setShowGuide(false)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors text-sm">
                                    Entendido
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}


                {/* Tabs Navigation */}
                <div className="flex border-b border-gray-200 mb-6 w-full">
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'scanner' ? 'border-blue-600 text-blue-600 bg-blue-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('scanner')}
                    >
                        <Barcode className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" /> Escanear
                    </button>
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'history' ? 'border-blue-600 text-blue-600 bg-blue-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <History className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" /> Historial
                        {actionHistory.length > 0 && (
                            <span className="ml-1.5 sm:ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs border border-gray-200">{actionHistory.length}</span>
                        )}
                    </button>
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'layout' ? 'border-blue-600 text-blue-600 bg-blue-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('layout')}
                    >
                        <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" /> Layout
                        {layoutHistory.length > 0 && (
                            <span className="ml-1.5 sm:ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs border border-gray-200">{layoutHistory.length}</span>
                        )}
                    </button>
                    <button
                        className={`flex-1 py-3 px-2 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors border-b-2 ${activeTab === 'missing' ? 'border-blue-600 text-blue-600 bg-blue-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('missing')}
                    >
                        <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" /> Faltantes
                        {missingProducts.length > 0 && (
                            <span className="ml-1.5 sm:ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs border border-gray-200">{missingProducts.length}</span>
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
                                        className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 rounded-lg border-2 border-blue-500 focus:ring-4 focus:ring-blue-200 focus:border-blue-600 transition-all text-base sm:text-lg shadow-sm"
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
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
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
                                            className="px-4 py-2 bg-white sm:bg-transparent border sm:border-0 border-gray-200 rounded text-gray-700 sm:text-blue-600 font-medium text-sm flex items-center justify-center gap-2 w-full sm:w-auto hover:bg-gray-50"
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
                                            <div className="sm:col-span-3">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción del Proveedor (según Remito)</label>
                                                <input
                                                    type="text"
                                                    value={editData.provider_description}
                                                    onChange={(e) => setEditData({ ...editData, provider_description: e.target.value })}
                                                    className="input-field"
                                                    placeholder="Ej: Tersuave Latex Interior 20L"
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
                                                        provider_code: product.provider_code || '',
                                                        provider_description: product.provider_description || ''
                                                    });
                                                }}
                                                className="btn btn-secondary w-full sm:w-auto"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleSaveEdit}
                                                className="btn btn-primary w-full sm:w-auto"
                                                disabled={loading}
                                            >
                                                {loading ? 'Guardando...' : 'Guardar Cambios'}
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
                                        <div className="col-span-1 sm:col-span-2">
                                            <p className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Descripción del Proveedor (Remito)</p>
                                            <p className="text-sm sm:text-base text-gray-900 bg-gray-50 p-1.5 sm:p-2 rounded break-all italic">{product.provider_description || 'Sin descripción vinculada'}</p>
                                        </div>
                                        <div className="col-span-1 sm:col-span-2 mt-1 sm:mt-2 pt-2 sm:pt-3 border-t border-gray-100">
                                            <p className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 sm:mb-2">
                                                <Barcode className="w-4 h-4" /> Cód. Barras Activo
                                            </p>
                                            <div className="bg-blue-50 border border-blue-100 rounded-md sm:rounded-lg p-2 sm:p-3">
                                                <p className="text-base sm:text-lg font-bold text-blue-700 tracking-wider sm:tracking-widest break-all w-full text-center leading-tight">{product.barcode || '-'}</p>
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
                                                    className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-all shadow-sm text-sm disabled:opacity-50"
                                                    disabled={loading}
                                                >
                                                    {loading ? 'Vinculando...' : 'Confirmar'}
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
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Buscar Producto</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={productCodeFilter}
                                            onChange={(e) => setProductCodeFilter(e.target.value)}
                                            placeholder="Descripción, código o barras..."
                                            className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all hover:border-blue-400"
                                            onKeyDown={(e) => e.key === 'Enter' && fetchHistory(1)}
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setIsScanningFilter(true);
                                                setShowScanner(true);
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                            title="Escanear código de barras para filtrar"
                                        >
                                            <Camera className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="w-full sm:w-auto flex-1 relative" ref={userHistoryFilterRef}>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Usuarios</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowHistoryUserFilter(!showHistoryUserFilter)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white flex items-center justify-between gap-2 min-h-[38px] transition-all hover:border-blue-400"
                                    >
                                        <span className="truncate">
                                            {selectedUserIds.length === 0 
                                                ? 'Todos los usuarios' 
                                                : selectedUserIds.length === 1 
                                                    ? usersList.find(u => u.id === selectedUserIds[0])?.username 
                                                    : `${selectedUserIds.length} seleccionados`}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${showHistoryUserFilter ? 'rotate-180' : ''}`} />
                                    </button>

                                    {showHistoryUserFilter && (
                                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="p-2 border-b sticky top-0 bg-white flex justify-between items-center">
                                                <button 
                                                    type="button"
                                                    onClick={() => setSelectedUserIds([])}
                                                    className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                                >
                                                    Limpiar
                                                </button>
                                                <span className="text-[10px] text-gray-400 font-medium">
                                                    {selectedUserIds.length} seleccionados
                                                </span>
                                            </div>
                                            <div className="p-1">
                                                {usersList.map(u => (
                                                    <label 
                                                        key={u.id} 
                                                        className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedUserIds.includes(u.id)}
                                                            onChange={() => {
                                                                const newIds = selectedUserIds.includes(u.id)
                                                                    ? selectedUserIds.filter(id => id !== u.id)
                                                                    : [...selectedUserIds, u.id];
                                                                setSelectedUserIds(newIds);
                                                            }}
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-sm text-gray-700 font-medium">{u.username}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Desde</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Hasta</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                                    <button
                                        onClick={() => fetchHistory(1)}
                                        className="btn btn-primary py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                        disabled={historyLoading}
                                    >
                                        <Filter className="w-4 h-4" /> Filtrar
                                    </button>
                                    <div className="flex gap-2 w-full sm:w-auto">
                                        <button
                                            onClick={() => handleExportCsv(false)}
                                            className="flex-1 sm:flex-none btn bg-green-600 hover:bg-green-700 text-white py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                            title="Exportar en CSV (bloques de 300)"
                                        >
                                            <Download className="w-4 h-4" /> CSV
                                        </button>
                                        <button
                                            onClick={() => handleExportExcel(false)}
                                            className="flex-1 sm:flex-none btn bg-blue-600 hover:bg-blue-700 text-white py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                        >
                                            <FileSpreadsheet className="w-4 h-4" /> Excel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {historyLoading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                            </div>
                        ) : actionHistory.length > 0 ? (
                            <div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                        <History className="w-5 h-5 text-gray-500" />
                                        Historial {startDate || endDate ? 'Filtrado' : 'Reciente'}
                                    </h3>
                                    {actionHistory.length > 0 && (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2 justify-end">
                                                <button
                                                    onClick={handleSelectAllHistory}
                                                    className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors"
                                                    disabled={loading}
                                                >
                                                    {isAllFilteredSelected ? (
                                                        'Deseleccionar TODO el Filtro'
                                                    ) : (
                                                        selectedHistory.length === actionHistory.length && actionHistory.length > 0
                                                        ? 'Deseleccionar Página'
                                                        : 'Seleccionar Página'
                                                    )}
                                                </button>
                                                {(selectedHistory.length > 0 || isAllFilteredSelected) && (
                                                    <button
                                                        onClick={handleBatchToLayout}
                                                        className="text-xs font-bold text-white bg-brand-blue hover:bg-brand-blue/90 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-all animate-in fade-in slide-in-from-right-2 disabled:opacity-50"
                                                        disabled={loading}
                                                    >
                                                        <ClipboardList className="w-3.5 h-3.5" /> {loading ? 'Procesando...' : `Pasar ${isAllFilteredSelected ? historyTotal : selectedHistory.length} al Layout`}
                                                    </button>
                                                )}
                                                {isAdmin && selectedHistory.length > 0 && !isAllFilteredSelected && (
                                                    <button
                                                        onClick={() => handleDeleteBulk(selectedHistory.map(i => i.id), 'Historial')}
                                                        className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-all animate-in fade-in slide-in-from-right-2 disabled:opacity-50"
                                                        title="Eliminar seleccionados permanentemente"
                                                        disabled={loading}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" /> Borrar
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {/* Banner de selección de todos los registros del filtro */}
                                            {!isAllFilteredSelected && selectedHistory.length === actionHistory.length && historyTotal > actionHistory.length && (
                                                <div className="bg-blue-50 border border-blue-200 p-2 rounded-lg text-xs text-blue-700 text-center animate-in fade-in slide-in-from-top-1 duration-300">
                                                    Has seleccionado los {actionHistory.length} registros de esta página. 
                                                    <button 
                                                        onClick={handleSelectTotalFilteredResults}
                                                        className="ml-2 font-bold underline hover:text-blue-900"
                                                    >
                                                        Seleccionar los {historyTotal} registros del historial filtrado
                                                    </button>
                                                </div>
                                            )}

                                            {isAllFilteredSelected && (
                                                <div className="bg-blue-600 border border-blue-700 p-2 rounded-lg text-xs text-white text-center font-medium animate-in zoom-in duration-300">
                                                    ✓ Los {historyTotal} registros que coinciden con el filtro están seleccionados.
                                                    <button 
                                                        onClick={() => { setIsAllFilteredSelected(false); setSelectedHistory([]); }}
                                                        className="ml-3 underline hover:text-blue-100 font-bold"
                                                    >
                                                        Deseleccionar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {actionHistory.map(item => (
                                        <div 
                                            key={item.id} 
                                            className={`bg-gray-50 border ${selectedHistory.find(i => i.id === item.id) ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200'} rounded-lg p-3 sm:p-4 text-sm flex items-center gap-3 shadow-sm hover:shadow transition-all group cursor-pointer`}
                                            onClick={() => handleToggleHistorySelection(item)}
                                        >
                                            <div className="flex-shrink-0 flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedHistory.find(i => i.id === item.id)}
                                                    onChange={(e) => {
                                                        // Ya manejamos el toggle en el onClick del padre, o aquí
                                                        // Pero evitemos que se disparen ambos.
                                                        e.stopPropagation();
                                                        handleToggleHistorySelection(item);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <p className="font-semibold text-gray-800 text-base">{item.product_description}</p>
                                                        {item.products?.barcode && (
                                                            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
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
                                        </div>
                                    ))}
                                </div>
                                {renderPagination(historyPage, historyTotalPages, historyTotal, fetchHistory, 50)}
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
                        {pendingInsertionProduct && (
                            <div className="bg-amber-100 border-2 border-amber-400 p-4 rounded-xl mb-4 flex items-center justify-between animate-pulse">
                                <div className="flex items-center gap-3">
                                    <div className="bg-amber-400 p-2 rounded-full">
                                        <Plus className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-amber-900">Modo Ubicación Activo</p>
                                        <p className="text-amber-800 text-sm">Hacé clic en los botones <strong>+</strong> del layout para insertar: <strong>{pendingInsertionProduct.description}</strong></p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setPendingInsertionProduct(null)}
                                    className="bg-white/50 hover:bg-white p-2 rounded-lg text-amber-700 transition-colors"
                                    title="Cancelar ubicación"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                        {/* Filters */}
                        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
                            <div className="flex flex-col sm:flex-row gap-3 items-end">
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Buscar Producto</label>
                                    <div className="relative layout-search-container">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={productCodeFilter}
                                            onChange={async (e) => {
                                                const val = e.target.value;
                                                setProductCodeFilter(val);
                                                if (val.length > 2) {
                                                    const results = await searchProductsLocally(val);
                                                    setLayoutSuggestions(results);
                                                    setShowLayoutSuggestions(true);
                                                } else {
                                                    setLayoutSuggestions([]);
                                                    setShowLayoutSuggestions(false);
                                                }
                                            }}
                                            placeholder="Descripción, código o barras..."
                                            className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all hover:border-blue-400"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    fetchLayout(1);
                                                    setShowLayoutSuggestions(false);
                                                }
                                            }}
                                            onFocus={() => {
                                                if (productCodeFilter.length > 2 && layoutSuggestions.length > 0) {
                                                    setShowLayoutSuggestions(true);
                                                }
                                            }}
                                        />
                                        
                                        {showLayoutSuggestions && layoutSuggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 z-[100] mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                                                {layoutSuggestions.map((prod) => (
                                                    <button
                                                        key={prod.id}
                                                        className="w-full text-left p-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 flex flex-col gap-0.5"
                                                        onClick={() => {
                                                            setProductCodeFilter(prod.description);
                                                            setShowLayoutSuggestions(false);
                                                            // Trigger search immediately
                                                            setTimeout(() => fetchLayout(1), 0);
                                                        }}
                                                    >
                                                        <span className="font-bold text-gray-800 text-sm">{prod.description}</span>
                                                        <span className="text-[10px] text-gray-500 font-mono">
                                                            {prod.code} {prod.barcode ? `• ${prod.barcode}` : ''}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setIsScanningFilter(true);
                                                setShowScanner(true);
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                            title="Escanear código de barras para filtrar"
                                        >
                                            <Camera className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="w-full sm:w-auto flex-1 relative" ref={userFilterRef}>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Usuarios</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowUserFilter(!showUserFilter)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white flex items-center justify-between gap-2 min-h-[38px] transition-all hover:border-blue-400"
                                    >
                                        <span className="truncate">
                                            {selectedUserIds.length === 0 
                                                ? 'Todos los usuarios' 
                                                : selectedUserIds.length === 1 
                                                    ? usersList.find(u => u.id === selectedUserIds[0])?.username 
                                                    : `${selectedUserIds.length} seleccionados`}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${showUserFilter ? 'rotate-180' : ''}`} />
                                    </button>

                                    {showUserFilter && (
                                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="p-2 border-b sticky top-0 bg-white flex justify-between items-center">
                                                <button 
                                                    type="button"
                                                    onClick={() => setSelectedUserIds([])}
                                                    className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                                >
                                                    Limpiar
                                                </button>
                                                <span className="text-[10px] text-gray-400 font-medium">
                                                    {selectedUserIds.length} seleccionados
                                                </span>
                                            </div>
                                            <div className="p-1">
                                                {usersList.map(u => (
                                                    <label 
                                                        key={u.id} 
                                                        className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedUserIds.includes(u.id)}
                                                            onChange={() => {
                                                                const newIds = selectedUserIds.includes(u.id)
                                                                    ? selectedUserIds.filter(id => id !== u.id)
                                                                    : [...selectedUserIds, u.id];
                                                                setSelectedUserIds(newIds);
                                                            }}
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-sm text-gray-700 font-medium">{u.username}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Desde</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha Hasta</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                                    <button
                                        onClick={() => fetchLayout(1)}
                                        className="btn btn-primary py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                        disabled={layoutLoading}
                                    >
                                        <Filter className="w-4 h-4" /> Filtrar
                                    </button>
                                    <div className="flex gap-2 w-full sm:w-auto">
                                        <button
                                            onClick={() => handleExportCsv(true)}
                                            className="flex-1 sm:flex-none btn bg-green-600 hover:bg-green-700 text-white py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                            title="Exportar en CSV (bloques de 300)"
                                        >
                                            <Download className="w-4 h-4" /> CSV
                                        </button>
                                        <button
                                            onClick={() => handleExportExcel(true)}
                                            className="flex-1 sm:flex-none btn bg-blue-600 hover:bg-blue-700 text-white py-2 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                                            disabled={layoutLoading}
                                        >
                                            <FileSpreadsheet className="w-4 h-4" /> Excel
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 px-1">
                                    <label className="relative inline-flex items-center cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer"
                                            checked={showUnique}
                                            onChange={(e) => {
                                                setShowUnique(e.target.checked);
                                                // Trigger fetch immediately when toggled
                                                setTimeout(() => fetchLayout(1), 0);
                                            }}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        <span className="ml-3 text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">Mostrar solo únicos (Sin repetidos)</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {layoutLoading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                            </div>
                        ) : layoutHistory.length > 0 ? (
                            <div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                        <ClipboardList className="w-5 h-5 text-primary-500" />
                                        Orden de Escaneo (Layout)
                                    </h3>
                                    {isAdmin && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    if (selectedLayout.length === layoutHistory.length) {
                                                        setSelectedLayout([]);
                                                    } else {
                                                        setSelectedLayout(layoutHistory.map(i => i.id));
                                                    }
                                                }}
                                                className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors"
                                            >
                                                {selectedLayout.length === layoutHistory.length ? 'Deseleccionar Página' : 'Seleccionar Página'}
                                            </button>
                                            {selectedLayout.length > 0 && (
                                                <button
                                                    onClick={() => handleDeleteBulk(selectedLayout, 'Layout')}
                                                    className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-all animate-in fade-in"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> Borrar {selectedLayout.length}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {/* Botón para insertar al principio (arriba de todo) */}
                                    {layoutHistory.length > 0 && (
                                        <div className="flex justify-center -mb-4 relative z-10 group/insert">
                                            <button
                                                onClick={() => handleOpenInsertModal(null, layoutHistory[0])}
                                                className="w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:scale-110 transition-all opacity-0 group-hover/insert:opacity-100 focus:opacity-100"
                                                title="Insertar al principio"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                    {layoutHistory.map((item, index) => (
                                        <React.Fragment key={item.id}>
                                            <div 
                                                className={`bg-white border ${item.isContext ? 'border-dashed border-gray-300 bg-gray-50/50 opacity-80' : selectedLayout.includes(item.id) ? 'border-red-300 bg-red-50/10' : 'border-gray-200'} rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm hover:border-primary-200 transition-colors ${isAdmin && !item.isContext ? 'cursor-pointer' : ''}`}
                                                onClick={() => {
                                                    if (!isAdmin || item.isContext) return;
                                                    const newSelected = selectedLayout.includes(item.id)
                                                        ? selectedLayout.filter(id => id !== item.id)
                                                        : [...selectedLayout, item.id];
                                                    setSelectedLayout(newSelected);
                                                }}
                                            >
                                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                                    {isAdmin && !item.isContext && (
                                                        <div className="flex-shrink-0 flex items-center mr-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedLayout.includes(item.id)}
                                                                onChange={() => {}} // Manejado por el onClick del contenedor
                                                                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full ${item.isContext ? (item.contextType === 'after' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600') : 'bg-primary-100 text-primary-700'} flex items-center justify-center font-bold text-xs`}>
                                                        {item.isContext ? (item.contextType === 'after' ? 'P' : 'A') : layoutTotal - ((layoutPage - 1) * 50) - index}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className={`font-bold ${item.isContext ? 'text-gray-600' : 'text-gray-900'}`}>{item.product_description}</p>
                                                            {item.isContext && (
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider border ${item.contextType === 'after' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                                    {item.contextType === 'after' ? 'POSTERIOR' : 'ANTERIOR'}
                                                                </span>
                                                            )}
                                                        </div>
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
                                                            {item.action_type !== 'SCAN' && (
                                                                <span className={`text-[10px] px-2 py-1 rounded font-medium flex items-center gap-1.5 border ${item.action_type === 'edit' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                                                                    {item.action_type === 'edit' ? <Edit className="w-3 h-3" /> : <Link className="w-3 h-3" />}
                                                                    {item.action_type === 'edit' ? 'Editado' : 'Vinculado'}: {item.details}
                                                                </span>
                                                            )}
                                                            {item.details === 'Transferencia masiva desde historial' && (
                                                                <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium flex items-center gap-1 border border-amber-100">
                                                                    <ClipboardList className="w-3 h-3" /> Transferido
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                                    <div className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        {new Date(item.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                    </div>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteBulk([item.id], 'Layout');
                                                            }}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Borrar este registro"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Botón de inserción entre filas */}
                                            <div className="flex justify-center -my-1.5 relative z-10 group/insert">
                                                <button
                                                    onClick={() => handleOpenInsertModal(item, layoutHistory[index + 1])}
                                                    className="w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:scale-110 transition-all opacity-0 group-hover/insert:opacity-100 focus:opacity-100"
                                                    title="Insertar producto aquí"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </React.Fragment>
                                    ))}
                                    {/* Botón para insertar al final (debajo de todo) */}
                                    {layoutHistory.length > 0 && (
                                        <div className="flex justify-center -mt-1.5 relative z-10 group/insert">
                                            <button
                                                onClick={() => handleOpenInsertModal(layoutHistory[layoutHistory.length - 1], null)}
                                                className="w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:scale-110 transition-all opacity-0 group-hover/insert:opacity-100 focus:opacity-100"
                                                title="Insertar al final"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {renderPagination(layoutPage, layoutTotalPages, layoutTotal, fetchLayout, 50)}
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

                {/* Missing Products Section */}
                {activeTab === 'missing' && (
                    <div className="animate-fade-in pt-2">
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-4 text-blue-800 text-sm">
                            <div className="flex gap-3">
                                <FileSpreadsheet className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                <div>
                                    <p className="font-bold mb-1">Productos faltantes en el Layout</p>
                                    <p>Esta lista proviene de las hojas <strong>DepositoConStock</strong> y <strong>DepositoSinStock</strong> del Excel Layout.xlsx. Podés vincularlos al orden del layout seleccionando uno y luego marcando dónde iría.</p>
                                </div>
                            </div>
                        </div>

                        <div className="relative mb-4 missing-search-container">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={missingSearchQuery}
                                onChange={async (e) => {
                                    const val = e.target.value;
                                    setMissingSearchQuery(val);
                                    if (val.length > 2) {
                                        const results = await searchProductsLocally(val);
                                        setMissingSuggestions(results);
                                        setShowMissingSuggestions(true);
                                    } else {
                                        setMissingSuggestions([]);
                                        setShowMissingSuggestions(false);
                                    }
                                }}
                                placeholder="Descripción, código o barras..."
                                className="w-full pl-10 pr-12 py-2.5 bg-white border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all shadow-sm"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        fetchMissingProducts(1, missingSearchQuery);
                                        setShowMissingSuggestions(false);
                                    }
                                }}
                                onFocus={() => {
                                    if (missingSearchQuery.length > 2 && missingSuggestions.length > 0) {
                                        setShowMissingSuggestions(true);
                                    }
                                }}
                            />

                            {showMissingSuggestions && missingSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-[100] mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                                    {missingSuggestions.map((prod) => (
                                        <button
                                            key={prod.id}
                                            className="w-full text-left p-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 flex flex-col gap-0.5"
                                            onClick={() => {
                                                setMissingSearchQuery(prod.description);
                                                setShowMissingSuggestions(false);
                                                fetchMissingProducts(1, prod.description);
                                            }}
                                        >
                                            <span className="font-bold text-gray-800 text-sm">{prod.description}</span>
                                            <span className="text-[10px] text-gray-500 font-mono">
                                                {prod.code} {prod.barcode ? `• ${prod.barcode}` : ''}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <button 
                                type="button"
                                onClick={() => {
                                    setIsScanningFilter(true);
                                    setShowScanner(true);
                                }}
                                className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                title="Escanear código de barras para filtrar"
                            >
                                <Camera className="w-5 h-5" />
                            </button>
                            <label className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-green-600 hover:bg-green-50 rounded-md transition-colors cursor-pointer" title="Sincronizar Excel con Base de Datos">
                                <Upload className="w-5 h-5" />
                                <input 
                                    type="file" 
                                    className="hidden" 
                                    accept=".xlsx, .xls"
                                    onChange={handleSyncMissingExcel}
                                    disabled={missingLoading}
                                />
                            </label>
                        </div>

                        {missingLoading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                            </div>
                        ) : missingProducts.length > 0 ? (
                            <div className="space-y-2">
                                {missingProducts.map((p, idx) => (
                                    <div key={`${p.code}-${idx}`} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm hover:shadow transition-all group">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-gray-800">{p.description}</h4>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${p.source === 'DepositoConStock' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {p.source === 'DepositoConStock' ? 'Con Stock' : 'Sin Stock'}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-xs">
                                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono border border-gray-100">
                                                    INT: {p.code}
                                                </span>
                                                {p.barcode && (
                                                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono border border-blue-100 flex items-center gap-1">
                                                        <Barcode className="w-3 h-3" /> {p.barcode}
                                                    </span>
                                                )}
                                                {p.brand && <span className="text-gray-400 italic">• {p.brand}</span>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handlePrepareInsertion(p)}
                                            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all text-sm flex items-center justify-center gap-2"
                                        >
                                            <Link className="w-4 h-4" /> Vincular al Layout
                                        </button>
                                    </div>
                                ))}
                                {renderPagination(missingPage, missingTotalPages, missingTotal, fetchMissingProducts, 50)}
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <CheckCircle2 className="w-12 h-12 mb-3 text-green-300 mx-auto" />
                                <p className="text-gray-500 font-medium">No se encontraron productos faltantes en el Excel.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal for Duplicate Products Selection */}
            {isDuplicateModalOpen && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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
                </div>,
                document.body
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
                <div
                    onClick={() => {
                        const newState = !isSyncBadgeExpanded;
                        setIsSyncBadgeExpanded(newState);
                        localStorage.setItem('isSyncBadgeExpanded', newState);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg text-[10px] font-bold border transition-all cursor-pointer ${isSyncing ? 'bg-blue-500 text-white border-blue-400 animate-pulse' : 'bg-white text-gray-400 border-gray-100'}`}
                >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSyncing ? 'bg-white' : 'bg-green-500'}`}></div>
                    {isSyncBadgeExpanded ? (
                        <>
                            {isSyncing ? 'SINCRONIZANDO...' : `CATÁLOGO: ${lastSync ? lastSync.toLocaleTimeString([]) : 'PENDIENTE'}`}
                            {!isSyncing && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        syncProducts(true);
                                    }}
                                    className="ml-1 hover:text-blue-500"
                                    title="Sincronizar ahora"
                                    type="button"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </button>
                            )}
                        </>
                    ) : (
                        isSyncing && <span className="ml-1">Sincronizando...</span>
                    )}
                </div>
            </div>
            {/* Modal de Escaneos Pendientes Offline */}
            {showPendingModal && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="bg-amber-500 p-4 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <RefreshCcw className="w-5 h-5 animate-spin-slow" />
                                <h3 className="text-lg font-bold">Escaneos Pendientes (Offline)</h3>
                            </div>
                            <button onClick={() => setShowPendingModal(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-4 flex-grow overflow-y-auto bg-gray-50">
                            <p className="text-sm text-gray-600 mb-4 bg-amber-50 p-3 rounded-lg border border-amber-100 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                Estos productos se han guardado en la memoria local de tu dispositivo. Se subirán al servidor automáticamente cuando recuperes la conexión.
                            </p>

                            <div className="space-y-2">
                                {pendingScans.map((scan, index) => (
                                    <div key={scan.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                                        <div className="flex-grow">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                                                    #{pendingScans.length - index}
                                                </span>
                                                <h4 className="font-semibold text-gray-800 text-sm line-clamp-1">
                                                    {scan.data.product_description}
                                                </h4>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Barcode className="w-3 h-3" /> {scan.data.details.split('Escaneo de ')[1]}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="ml-2">
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                                Puntual
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {pendingScans.length === 0 && (
                                    <div className="text-center py-10 text-gray-500">
                                        No hay escaneos pendientes
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-white border-t flex flex-col sm:flex-row gap-2">
                            <button
                                onClick={() => setShowPendingModal(false)}
                                className="btn btn-secondary flex-grow justify-center"
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={syncOfflineLayoutData}
                                disabled={!navigator.onLine}
                                className={`btn flex-grow justify-center gap-2 ${navigator.onLine ? 'bg-brand-blue hover:bg-brand-blue-dark text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                            >
                                <RefreshCcw className={`w-4 h-4 ${navigator.onLine ? '' : ''}`} />
                                {navigator.onLine ? 'Sincronizar ahora' : 'Sin conexión'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Inserción Manual */}
            {showInsertModal && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl border border-gray-100 animate-in zoom-in duration-200">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 flex items-center gap-4">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <Plus className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white uppercase tracking-tight">Insertar Producto</h2>
                                <p className="text-blue-100 text-xs">Se ubicará entre los dos productos seleccionados</p>
                            </div>
                            <button onClick={() => setShowInsertModal(false)} className="ml-auto text-white/70 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs space-y-2">
                                <div className="flex justify-between items-center opacity-60">
                                    <span className="font-semibold uppercase text-[10px]">Arriba:</span>
                                    <span className="truncate max-w-[200px] italic">{insertReference.prev?.product_description || 'Inicio de lista'}</span>
                                </div>
                                <div className="flex justify-center">
                                    <div className="h-4 border-l-2 border-dashed border-blue-300"></div>
                                </div>
                                <div className="flex justify-between items-center text-blue-600 font-bold">
                                    <span className="uppercase text-[10px]">NUEVO PRODUCTO AQUÍ</span>
                                </div>
                                <div className="flex justify-center">
                                    <div className="h-4 border-l-2 border-dashed border-blue-300"></div>
                                </div>
                                <div className="flex justify-between items-center opacity-60">
                                    <span className="font-semibold uppercase text-[10px]">Abajo:</span>
                                    <span className="truncate max-w-[200px] italic">{insertReference.next?.product_description || 'Fin de lista'}</span>
                                </div>
                            </div>

                            <form 
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleExecuteInsertSearch(insertProductSearch);
                                }}
                                className="relative"
                            >
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={insertProductSearch}
                                    onChange={(e) => {
                                        setInsertProductSearch(e.target.value);
                                        // Búsqueda en tiempo real
                                        if (e.target.value.length > 2) {
                                            handleExecuteInsertSearch(e.target.value);
                                        }
                                    }}
                                    placeholder="Buscar producto por nombre o código..."
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-sm"
                                    autoFocus
                                />
                            </form>

                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {insertLoading && (
                                    <div className="flex justify-center py-4">
                                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                                    </div>
                                )}
                                
                                {insertSearchResults.map(prod => (
                                    <button
                                        key={prod.id}
                                        onClick={() => handleConfirmInsertion(prod)}
                                        className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group flex flex-col gap-1"
                                    >
                                        <span className="font-bold text-gray-800 text-sm group-hover:text-blue-700">{prod.description}</span>
                                        <span className="text-[10px] text-gray-500 font-mono">INT: {prod.code} {prod.barcode ? `• BAR: ${prod.barcode}` : ''}</span>
                                    </button>
                                ))}

                                {!insertLoading && insertProductSearch.length > 2 && insertSearchResults.length === 0 && (
                                    <p className="text-center py-4 text-gray-400 text-xs">No se encontraron productos</p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setShowInsertModal(false)}
                                className="px-6 py-2 text-gray-500 font-bold hover:text-gray-700 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default BarcodeControl;
