
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';

import api from '../api';
import ReceiptScanner from './ReceiptScanner';
import Scanner from './Scanner';
import { downloadFile } from '../utils/downloadUtils';
import FichajeModal from './FichajeModal';
import { useAuth } from '../context/AuthContext';
import { useProductSync } from '../hooks/useProductSync'; // Add this line
import { db } from '../db';
import { toast } from 'sonner';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import ReceiptHistory from './ReceiptHistory';
import { normalizeText } from '../utils/textUtils';

const QuickSuggestions = ({ description, onSelect }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const { searchProductsLocally } = useProductSync();

    useEffect(() => {
        if (!description) return;
        const fetch = async () => {
            setLoading(true);
            try {
                // Buscamos productos que coincidan con la descripción extraída
                const results = await searchProductsLocally(description);
                setSuggestions(results.slice(0, 3)); // Solo mostramos los 3 mejores
            } catch (err) {
                console.error('Error fetching quick suggestions:', err);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [description]);

    if (loading) return <div className="text-[10px] text-blue-400 animate-pulse">Buscando sugerencias...</div>;
    if (suggestions.length === 0) return null;

    return (
        <div className="flex flex-col gap-1 mt-1">
            {suggestions.map((s, idx) => (
                <button
                    key={idx}
                    onClick={() => onSelect(s)}
                    className="text-left px-2 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-all flex justify-between items-center group"
                >
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-blue-900 truncate">{s.description}</div>
                        <div className="text-[9px] text-blue-500 font-mono">INT: {s.code}</div>
                    </div>
                    <svg className="w-3 h-3 text-blue-400 group-hover:text-blue-600 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                </button>
            ))}
        </div>
    );
};

const ReceiptDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth(); // token no se usa y no existe en AuthContext
    const [receipt, setReceipt] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('control'); // 'load' or 'control'
    const [scanInput, setScanInput] = useState('');
    const [quantityInput, setQuantityInput] = useState(1);
    const [processing, setProcessing] = useState(false);
    const [showScanner, setShowScanner] = useState(false); // For Receipt OCR
    const [isListening, setIsListening] = useState(false); // For Voice Search
    const [isBarcodeReaderActive, setIsBarcodeReaderActive] = useState(false); // For Barcode Scanner
    const [visibleItems, setVisibleItems] = useState(20);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [diffSearch, setDiffSearch] = useState('');
    const [scanStatus, setScanStatus] = useState(null);

    // Local DB Sync
    const { syncProducts, getProductByCode, searchProductsLocally, isSyncing, lastSync } = useProductSync();

    // Bulk Import State (OCR)
    const [isBulkImporting, setIsBulkImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const [importFailedItems, setImportFailedItems] = useState([]);
    const [linkingItem, setLinkingItem] = useState(null); // Item from importFailedItems being linked
    const [linkingSuggestions, setLinkingSuggestions] = useState([]);
    const [isLinkingSearching, setIsLinkingSearching] = useState(false);
    const [searchType, setSearchType] = useState('any'); // 'any', 'barcode', 'provider', 'internal'

    const hasBranchPermission = Array.isArray(user?.permissions) && user.permissions.includes('tab_ingreso_sucursal');

    const canUseScanner = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || (Array.isArray(user?.permissions) && user.permissions.includes('use_scanner_ingresos')) || hasBranchPermission;
    const canClose = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || (Array.isArray(user?.permissions) && user.permissions.includes('close_ingresos')) || hasBranchPermission;
    const canUpload = (user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || (Array.isArray(user?.permissions) && user.permissions.includes('upload_ingresos'))) && !hasBranchPermission;

    const isSuperAdmin = user?.role === 'superadmin';

    // Pestañas disponibles según permisos
    const availableTabs = useMemo(() => {
        const tabs = [
            { id: 'load', name: '1. Cargar', permission: 'view_ingresos_tab_cargar', colorClass: 'text-brand-blue', showIfOpen: true },
            { id: 'control', name: '2. Controlar', permission: 'view_ingresos_tab_controlar', colorClass: 'text-brand-success', showIfOpen: true },
            { 
                id: 'unlinked', 
                name: `No Encontrados ${importFailedItems.length > 0 ? `(${importFailedItems.length})` : ''}`, 
                permission: 'view_ingresos_tab_unlinked', 
                colorClass: 'text-orange-600', 
                showIfOpen: true 
            },
            { id: 'diff', name: 'Diferencias', permission: 'view_ingresos_tab_diferencias', colorClass: 'text-red-600', showIfOpen: false },
            { id: 'history', name: 'Historial', permission: 'view_ingresos_tab_historial', colorClass: 'text-purple-600', showIfOpen: false },
        ];

        return tabs.filter(tab => {
            if (isSuperAdmin) return true;
            if (tab.showIfOpen && receipt?.status === 'finalized') return false;

            // Branch users can see control, diff and history by default
            if (hasBranchPermission && ['control', 'diff', 'history', 'unlinked'].includes(tab.id)) return true;

            return Array.isArray(user?.permissions) && user.permissions.includes(tab.permission);
        });
    }, [isSuperAdmin, receipt?.status, hasBranchPermission, user?.permissions, importFailedItems.length]);

    // Asegurar que activeTab sea válida
    useEffect(() => {
        if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
            setActiveTab(availableTabs[0].id);
        }
    }, [availableTabs, activeTab]);

    // Intelligent Search State
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef(null);
    const productCacheRef = useRef(new Map()); // Client-side product cache

    // Fichaje Modal State
    const [fichajeState, setFichajeState] = useState({
        isOpen: false,
        product: null,
        existingQuantity: 0,
        expectedQuantity: null
    });

    // Duplicate product selection state
    const [duplicateProducts, setDuplicateProducts] = useState([]);
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

    // Export to another receipt state
    const [showExportToModal, setShowExportToModal] = useState(false);
    const [exportReceiptList, setExportReceiptList] = useState([]);

    // Sync Badge Expansion State
    const [isSyncBadgeExpanded, setIsSyncBadgeExpanded] = useState(() => localStorage.getItem('isSyncBadgeExpanded') !== 'false');
    const [exportReceiptSearch, setExportReceiptSearch] = useState('');
    const [loadingExportList, setLoadingExportList] = useState(false);
    const [exportingTo, setExportingTo] = useState(false);

    // Focus management
    const inputRef = useRef(null);

    // Surplus correction state
    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
    const [correctingItem, setCorrectingItem] = useState(null);
    const [correctionQuantity, setCorrectionQuantity] = useState('');

    // Optimized map for item lookups
    const productLookupMap = React.useMemo(() => {
        const map = new Map();
        items.forEach(item => {
            const code = item.product_code;
            const provCode = item.products?.provider_code;
            const barcode = item.products?.barcode || item.barcode;

            if (code) {
                if (!map.has(code)) map.set(code, []);
                map.get(code).push(item);
            }
            if (provCode) {
                if (!map.has(provCode)) map.set(provCode, []);
                map.get(provCode).push(item);
                
                // Leading zero tolerance
                const stripped = provCode.replace(/^0+/, '');
                if (stripped && stripped !== provCode) {
                    if (!map.has(stripped)) map.set(stripped, []);
                    map.get(stripped).push(item);
                }
                const withZero = '0' + provCode;
                if (!map.has(withZero)) map.set(withZero, []);
                map.get(withZero).push(item);
            }
            if (barcode) {
                if (!map.has(barcode)) map.set(barcode, []);
                map.get(barcode).push(item);
            }
        });
        return map;
    }, [items]);

    useEffect(() => {
        fetchReceiptDetails();
        syncProducts(); // Sync catalog on mount
    }, [id]);

    useEffect(() => {
        // Keep focus on input for continuous scanning
        if (!processing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [processing, activeTab, items]);

    const checkPendingSync = async () => {
        try {
            const count = await db.pending_syncs
                .where({ document_id: id, type: 'receipt' })
                .count();
            setPendingSyncCount(count);
        } catch (e) { console.error('Error counting pending syncs:', e); }
    };

    const syncOfflineData = async () => {
        const queue = await db.pending_syncs
            .where({ document_id: id, type: 'receipt' })
            .toArray();

        if (queue.length === 0) return;

        try {
            toast.info('Sincronizando datos offline...', { duration: 2000 });
            // Sync each item
            for (const scan of queue) {
                if (scan.data.type === 'load') {
                    await api.post(`/api/receipts/${id}/items`, { code: scan.data.code, quantity: scan.data.quantity });
                } else {
                    await api.post(`/api/receipts/${id}/scan`, { code: scan.data.code, quantity: scan.data.quantity });
                }
                await db.pending_syncs.delete(scan.id);
            }
            checkPendingSync();
            toast.success('Sincronización completada');
            await fetchReceiptDetails();
        } catch (error) {
            console.error('Error sincronizando scans:', error);
            toast.error('Error al sincronizar. Se reintentará luego.');
        }
    };

    useEffect(() => {
        checkPendingSync();
        const handleOnline = () => {
            toast.success('Conexión restaurada. Sincronizando...', { duration: 3000 });
            syncOfflineData();
        };
        const handleOffline = () => {
            toast.error('Sin conexión a internet. Modo Offline activado.', { duration: 5000 });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        if (navigator.onLine && pendingSyncCount > 0) {
            syncOfflineData();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [id, pendingSyncCount]);

    const fetchReceiptDetails = async () => {
        try {
            const response = await api.get(`/api/receipts/${id}`);
            const data = response.data;
            setReceipt(data);
            setItems(data.items || []);
            setImportFailedItems(data.failed_items || []);
            
            // Default search type remains 'any' as initialized

            
            setLoading(false);
            await db.offline_caches.put({
                id: `receipt_${id}`,
                data: response.data,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Error fetching receipt details:', error);
            const cache = await db.offline_caches.get(`receipt_${id}`);
            if (cache && cache.data) {
                setReceipt(cache.data);
                setItems(cache.data.items || []);
                setLoading(false);
                toast.info('Cargado desde respaldo offline local');
            } else {
                toast.error('Error al cargar los detalles');
                setLoading(false);
            }
        }
    };

    const executeSearch = async (value) => {
        if (!value || value.length < 2) {
            setShowSuggestions(false);
            setSuggestions([]);
            return;
        }

        const normalizedValue = normalizeText(value);
        const searchTerms = normalizedValue.split(/\s+/);

        // 1. Local document items search (Priority)
        const localMatches = items.filter(i => {
            const desc = normalizeText(i.products?.description || '');
            const code = normalizeText(i.product_code || '');
            const barcode = normalizeText(i.products?.barcode || i.barcode || '');
            const provCode = normalizeText(i.products?.provider_code || '');

            return searchTerms.every(term => {
                if (searchType === 'barcode') return barcode.includes(term);
                if (searchType === 'internal') return code.includes(term);
                if (searchType === 'provider') return provCode.includes(term);

                return desc.includes(term) || code.includes(term) || barcode.includes(term) || provCode.includes(term);
            });
        }).map(i => ({
            code: i.product_code,
            description: i.products?.description || 'Producto',
            barcode: i.products?.barcode || i.barcode || '',
            provider_code: i.products?.provider_code || '',
            inDocument: true
        }));

        setSuggestions(localMatches);
        setShowSuggestions(localMatches.length > 0);

        // 2. Local DB catalog search (Fallback/Extra)
        if (localMatches.length < 20) {
            const globalMatches = await searchProductsLocally(value, searchType);
            const existingCodes = new Set(localMatches.map(m => m.code));
            const newSuggestions = globalMatches
                .filter(m => !existingCodes.has(m.code))
                .map(m => ({
                    code: m.code,
                    description: m.description,
                    barcode: m.barcode || '',
                    provider_code: m.provider_code || '',
                    inDocument: false
                }));

            if (newSuggestions.length > 0) {
                setSuggestions(prev => [...prev.slice(0, 10), ...newSuggestions.slice(0, 10)]);
                setShowSuggestions(true);
            }
        }
    };

    const handleInputChange = (e) => {
        const value = e.target.value;
        setScanInput(value);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(() => {
            executeSearch(value);
        }, 300);
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
                    prompt: 'Diga el código o nombre del producto',
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
                            if (!match || match.trim().length < 2) continue;
                            try {
                                const res = await api.get(`/api/products/search?q=${encodeURIComponent(match)}`);
                                if (res.data && res.data.length > 0) {
                                    setScanInput(match);
                                    setSuggestions(res.data);
                                    setShowSuggestions(true);
                                    return;
                                }
                            } catch (e) { /* probar siguiente alternativa */ }
                        }
                        // Ninguna alternativa encontró resultados, usar la primera
                        const first = result.matches[0];
                        setScanInput(first);
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
            setScanInput(transcript);
            setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
    };

    const openModal = (product, expQty, currentScanned) => {
        setFichajeState({
            isOpen: true,
            product: product,
            existingQuantity: currentScanned,
            expectedQuantity: expQty
        });
        setShowSuggestions(false);
    };

    const handleScan = async (e, overrideCode = null) => {
        if (e) e.preventDefault();
        const code = (overrideCode || scanInput).trim();
        if (!code) return;

        // Find product(s) in current items using optimized Map
        const matchingItems = productLookupMap.get(code) || [];


        if (matchingItems.length === 1) {
            const existingItem = matchingItems[0];
            openModal({
                code: existingItem.product_code,
                description: existingItem.products?.description || 'Producto',
                barcode: existingItem.products?.barcode || existingItem.barcode || '',
                secondary_unit: existingItem.products?.secondary_unit || null,
                primary_unit: existingItem.products?.primary_unit || null,
                conversion_factor: existingItem.products?.conversion_factor || null,
                conversion_type: existingItem.products?.conversion_type || null,
            }, existingItem.expected_quantity, existingItem.scanned_quantity);
        } else if (matchingItems.length > 1) {
            setDuplicateProducts(matchingItems.map(item => ({
                code: item.product_code,
                description: item.products?.description || 'Producto',
                barcode: item.products?.barcode || item.barcode || '',
                brand: item.products?.brand || '',
                expected_quantity: item.expected_quantity,
                scanned_quantity: item.scanned_quantity,
                secondary_unit: item.products?.secondary_unit || null,
                primary_unit: item.products?.primary_unit || null,
                conversion_factor: item.products?.conversion_factor || null,
                conversion_type: item.products?.conversion_type || null,
            })));
            setIsDuplicateModalOpen(true);
            setScanInput('');
        } else {
            // Check client cache first
            const cached = productCacheRef.current.get(code);
            if (cached) {
                if (Array.isArray(cached)) {
                    setDuplicateProducts(cached);
                    setIsDuplicateModalOpen(true);
                    setScanInput('');
                } else {
                    openModal(cached, null, 0);
                }
                return;
            }

            setProcessing(true);
            try {
                // Priority fallback: Local Database (IndexedDB)
                const localProduct = await getProductByCode(code, searchType);
                if (localProduct) {
                    const productObj = {
                        code: localProduct.code,
                        description: localProduct.description,
                        barcode: localProduct.barcode || '',
                        provider_code: localProduct.provider_code || '',
                        secondary_unit: localProduct.secondary_unit || null,
                        primary_unit: localProduct.primary_unit || null,
                        conversion_factor: localProduct.conversion_factor || null,
                        conversion_type: localProduct.conversion_type || null
                    };
                    productCacheRef.current.set(code, productObj);
                    openModal(productObj, null, 0);
                    return;
                }

                // Final fallback (Network): only if not found locally
                if (navigator.onLine) {
                    const response = await api.get(`/api/products/${code}?searchType=${searchType}`);
                    const data = response.data;
                    if (Array.isArray(data) && data.length > 1) {
                        const duplicates = data.map(p => ({
                            code: p.code,
                            description: p.description,
                            barcode: p.barcode || '',
                            brand: p.brand || '',
                            expected_quantity: null,
                            scanned_quantity: 0
                        }));
                        productCacheRef.current.set(code, duplicates);
                        setDuplicateProducts(duplicates);
                        setIsDuplicateModalOpen(true);
                        setScanInput('');
                    } else if (data) {
                        const product = Array.isArray(data) ? data[0] : data;
                        const productObj = {
                            code: product.code,
                            description: product.description,
                            barcode: product.barcode || '',
                            provider_code: product.provider_code || '',
                            secondary_unit: product.secondary_unit || null,
                            primary_unit: product.primary_unit || null,
                            conversion_factor: product.conversion_factor || null,
                            conversion_type: product.conversion_type || null
                        };
                        productCacheRef.current.set(code, productObj);
                        openModal(productObj, null, 0);
                    } else {
                        toast.error('Producto no encontrado');
                    }
                } else {
                    toast.error('Producto no encontrado (Modo Offline)');
                }
            } catch (error) {
                console.error('Error during product lookup:', error);
                toast.error('Error al buscar el producto');
            } finally {
                setProcessing(false);
            }
        }
    };

    const handleFichajeConfirm = async (quantityToAdd) => {
        const { product } = fichajeState;
        if (!product || processing) return;

        setProcessing(true);
        const code = product.code;
        const qty = parseFloat(quantityToAdd) || 1;

        if (!navigator.onLine) {
            // Guardar en cola offline IndexedDB
            await db.pending_syncs.add({
                document_id: id,
                type: 'receipt',
                data: { code, quantity: qty, type: activeTab },
                timestamp: Date.now()
            });

            // Actualización optimista local
            setItems(prevItems => {
                const newItems = [...prevItems];
                const itemIndex = newItems.findIndex(i => i.product_code === code || i.products?.provider_code === code);

                if (itemIndex > -1) {
                    if (activeTab === 'load') {
                        newItems[itemIndex] = {
                            ...newItems[itemIndex],
                            expected_quantity: Number(newItems[itemIndex].expected_quantity || 0) + Number(qty)
                        };
                    } else {
                        newItems[itemIndex] = {
                            ...newItems[itemIndex],
                            scanned_quantity: Number(newItems[itemIndex].scanned_quantity || 0) + Number(qty)
                        };
                    }
                } else if (activeTab === 'load') {
                    // Si se está cargando uno nuevo offline (simplificado para UI, backend lo resuelve real tras sync)
                    newItems.push({
                        expected_quantity: qty, scanned_quantity: 0,
                        product_code: code,
                        products: { description: product.description, provider_code: product.provider_code || '' }
                    });
                }
                return newItems;
            });
            checkPendingSync();
            toast.success('Guardado localmente (Offline)');
            setScanInput('');
            setQuantityInput(1);
            setFichajeState(prev => ({ ...prev, isOpen: false }));
            setProcessing(false);
            return;
        }

        // Optimistic local update
        setItems(prevItems => {
            const newItems = [...prevItems];
            const itemIndex = newItems.findIndex(i => i.product_code === code || i.products?.provider_code === code);
            if (itemIndex > -1) {
                const field = activeTab === 'load' ? 'expected_quantity' : 'scanned_quantity';
                newItems[itemIndex] = {
                    ...newItems[itemIndex],
                    [field]: Number(newItems[itemIndex][field] || 0) + Number(qty)
                };
            }
            return newItems;
        });

        // Close modal immediately
        setScanInput('');
        setQuantityInput(1);
        setFichajeState(prev => ({ ...prev, isOpen: false }));
        setProcessing(false);

        // API call + refresh in background
        try {
            if (activeTab === 'load') {
                await api.post(`/api/receipts/${id}/items`, { code, quantity: qty, searchType });
            } else {
                await api.post(`/api/receipts/${id}/scan`, { code, quantity: qty, searchType });
                const sound = new Audio('/success-beep.mp3');
                sound.play().catch(e => console.log('Audio error:', e));
            }
            fetchReceiptDetails();
        } catch (error) {
            console.error('Scan error:', error);
            if (error.response?.status === 404) {
                toast.error(`Producto no encontrado: ${code}`);
                fetchReceiptDetails(); // Revert: product doesn't exist on server
            } else {
                // API failed (network/server error) — queue for later sync, keep optimistic state
                await db.pending_syncs.add({
                    document_id: id,
                    type: 'receipt',
                    data: { code, quantity: qty, type: activeTab },
                    timestamp: Date.now()
                });
                checkPendingSync();
                toast.warning('Sin conexión. Guardado localmente, se sincronizará al reconectar.', { duration: 4000 });
            }
        }
    };

    const handleBarcodeScan = (code) => {
        setScanInput(code);
        
        const mode = localStorage.getItem('scanner_mode');
        if (mode === 'rapid' && hasBranchPermission) {
            handleRapidScan(code);
        } else {
            // Trigger the scan processing immediately
            handleScan(null, code);
        }
    };

    const handleRapidScan = async (code) => {
        if (processing) return;
        setProcessing(true);

        // Limpiar estado previo
        setScanStatus(null);

        // Find product(s) in current items
        const matchingItems = productLookupMap.get(code) || [];

        if (matchingItems.length === 1) {
            const item = matchingItems[0];
            await handleRapidConfirm(item.product_code, item.products?.description || 'Producto');
        } else if (matchingItems.length > 1) {
            setScanStatus({ type: 'error', message: 'Múltiples productos encontrados. Use modo Manual.' });
            setTimeout(() => setScanStatus(null), 3000);
        } else {
            // Check catalog
            setProcessing(true);
            try {
                const localProduct = await getProductByCode(code, searchType);
                if (localProduct) {
                    await handleRapidConfirm(localProduct.code, localProduct.description);
                } else if (navigator.onLine) {
                    const response = await api.get(`/api/products/${code}?searchType=${searchType}`);
                    const data = response.data;
                    if (Array.isArray(data) && data.length > 1) {
                        setScanStatus({ type: 'error', message: 'Múltiples productos encontrados en catálogo.' });
                    } else if (data) {
                        const product = Array.isArray(data) ? data[0] : data;
                        await handleRapidConfirm(product.code, product.description);
                    } else {
                        setScanStatus({ type: 'error', message: `Producto no encontrado: ${code}` });
                    }
                } else {
                    setScanStatus({ type: 'error', message: 'Producto no encontrado (Modo Offline)' });
                }
            } catch (error) {
                setScanStatus({ type: 'error', message: 'Error al buscar producto' });
            } finally {
                // No seteamos processing a false aquí, lo hará handleRapidConfirm 
                // o lo hacemos nosotros si hay error
                if (scanStatus?.type === 'error') {
                    setProcessing(false);
                    setTimeout(() => setScanStatus(null), 3000);
                }
            }
        }
    };

    const handleRapidConfirm = async (code, description) => {
        try {
            const qty = 1;
            
            // Optimistic local update
        setItems(prevItems => {
            const newItems = [...prevItems];
            const itemIndex = newItems.findIndex(i => i.product_code === code || i.products?.provider_code === code);
            if (itemIndex > -1) {
                const field = activeTab === 'load' ? 'expected_quantity' : 'scanned_quantity';
                newItems[itemIndex] = {
                    ...newItems[itemIndex],
                    [field]: Number(newItems[itemIndex][field] || 0) + Number(qty)
                };
            } else if (activeTab === 'load') {
                newItems.push({
                    expected_quantity: qty, scanned_quantity: 0,
                    product_code: code,
                    products: { description: description }
                });
            }
            return newItems;
        });

        setScanStatus({ type: 'success', message: `Cargado: ${description}` });
        const sound = new Audio('/success-beep.mp3');
        sound.play().catch(e => console.log('Audio error:', e));

        if (activeTab === 'load') {
            await api.post(`/api/receipts/${id}/items`, { code, quantity: qty, searchType });
        } else {
            await api.post(`/api/receipts/${id}/scan`, { code, quantity: qty, searchType });
        }
        fetchReceiptDetails();
        } catch (error) {
            console.error('Rapid scan error:', error);
            if (error.response?.status === 404) {
                setScanStatus({ type: 'error', message: `Error: ${code} no existe` });
                fetchReceiptDetails();
            } else {
                await db.pending_syncs.add({
                    document_id: id,
                    type: 'receipt',
                    data: { code, quantity: qty, type: activeTab },
                    timestamp: Date.now()
                });
                checkPendingSync();
            }
        } finally {
            // Artificial delay to prevent double scan and allow user to move camera
            setTimeout(() => {
                setProcessing(false);
            }, 800);
        }
    };

    const handleFinalize = async () => {
        if (!window.confirm('¿Está seguro de finalizar este ingreso? No se podrán realizar más cambios.')) return;

        try {
            await api.put(`/api/receipts/${id}/close`, {});
            toast.success('Ingreso finalizado');
            fetchReceiptDetails();
        } catch (error) {
            console.error('Error finalizing:', error);
            toast.error('Error al finalizar');
        }
    };

    const handleReopen = async () => {
        if (!window.confirm('¿Está seguro de reabrir este ingreso? Podrá realizar cambios nuevamente.')) return;

        try {
            await api.put(`/api/receipts/${id}/reopen`, {});
            toast.success('Ingreso reabierto');
            fetchReceiptDetails();
        } catch (error) {
            console.error('Error reabriendo:', error);
            toast.error('Error al reabrir');
        }
    };

    const handleOpenExportToModal = async () => {
        const scannedItems = items.filter(i => Number(i.scanned_quantity) > 0);
        if (scannedItems.length === 0) {
            toast.error('No hay productos controlados para exportar');
            return;
        }
        setExportReceiptSearch('');
        setShowExportToModal(true);
        setLoadingExportList(true);
        try {
            const { data } = await api.get('/api/receipts');
            setExportReceiptList((data || []).filter(r => r.id !== id && r.status !== 'finalized'));
        } catch {
            toast.error('Error al cargar ingresos');
        } finally {
            setLoadingExportList(false);
        }
    };

    const handleExportToReceipt = async (targetReceiptId) => {
        setExportingTo(true);
        try {
            const { data } = await api.post(`/api/receipts/${id}/export-to-receipt`, { targetReceiptId });
            toast.success(`${data.exported} productos exportados al ingreso "${data.targetRemito}"`);
            setShowExportToModal(false);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Error al exportar');
        } finally {
            setExportingTo(false);
        }
    };

    const handleConfirmCorrection = async () => {
        if (!correctingItem || processing) return;

        const newQty = parseFloat(correctionQuantity);
        if (isNaN(newQty) || newQty < 0) {
            toast.error('Cantidad inválida');
            return;
        }

        setProcessing(true);
        try {
            await api.put(`/api/receipts/${id}/items/${correctingItem.id}`, {
                expected_quantity: correctingItem.expected_quantity,
                scanned_quantity: newQty
            });

            toast.success('Cantidad corregida exitosamente');
            setIsCorrectionModalOpen(false);
            setCorrectingItem(null);
            setCorrectionQuantity('');
            await fetchReceiptDetails();
        } catch (error) {
            console.error('Error correcting item:', error);
            toast.error(error.response?.data?.message || 'Error al corregir la cantidad');
        } finally {
            setProcessing(false);
        }
    };

    const handlePrintDifferences = () => {
        const diffItems = items.filter(item => {
            const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
            return diff !== 0;
        });

        if (diffItems.length === 0) {
            toast.info('No hay diferencias para imprimir');
            return;
        }

        const printWindow = window.open('', '_blank');
        const html = `
            <html>
                <head>
                    <title>Diferencias de Ingreso - Remito ${receipt.remito_number}</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; }
                        h1 { color: #333; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                        th { background-color: #f4f4f4; }
                        .diff-falta { color: #d32f2f; font-weight: bold; }
                        .diff-sobra { color: #388e3c; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h1>Diferencias de Ingreso</h1>
                    <p><strong>Remito:</strong> ${receipt.remito_number}</p>
                    <p><strong>Fecha:</strong> ${new Date(receipt.date).toLocaleString()}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Código</th>
                                <th>Esperado</th>
                                <th>Escaneado</th>
                                <th>Diferencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${diffItems.map(item => {
            const diff = (Number(item.scanned_quantity) || 0) - (Number(item.expected_quantity) || 0);
            const label = diff > 0 ? `Sobra ${diff}` : `Falta ${Math.abs(diff)}`;
            const className = diff > 0 ? 'diff-sobra' : 'diff-falta';
            return `
                                    <tr>
                                        <td>${item.products?.description || 'Sin descripción'}</td>
                                        <td>${item.product_code}</td>
                                        <td>${item.expected_quantity}</td>
                                        <td>${item.scanned_quantity}</td>
                                        <td class="${className}">${label}</td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                    <script>
                        window.onload = () => { window.print(); window.close(); };
                    </script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleScanComplete = async (scannedItems) => {
        setIsBulkImporting(true);
        setImportProgress({ current: 0, total: scannedItems.length });
        let successCount = 0;
        let failCount = 0;
        const failedItemsLog = [];

        const isControlTab = activeTab === 'control';
        const endpoint = isControlTab ? `/api/receipts/${id}/scan` : `/api/receipts/${id}/items`;

        for (let i = 0; i < scannedItems.length; i++) {
            const item = scannedItems[i];
            
            // Si el item viene marcado como no vinculado desde el servidor, no intentamos el post normal
            if (item.is_unlinked) {
                failCount++;
                failedItemsLog.push({
                    ...item,
                    error: 'Producto no encontrado en el catálogo'
                });
                setImportProgress({ current: i + 1, total: scannedItems.length });
                continue;
            }

            try {
                // For OCR/PDF we use search type based on receipt type
                const searchTypeToUse = receipt.type === 'overstock' ? 'internal' : (receipt.type === 'normal' ? 'provider' : 'any');
                await api.post(endpoint, {
                    code: item.code,
                    quantity: item.quantity,
                    searchType: searchTypeToUse
                });
                successCount++;
            } catch (error) {
                console.error(`Error importing item ${item.code}:`, error);
                failCount++;
                failedItemsLog.push({
                    code: item.code,
                    description: item.description,
                    quantity: item.quantity,
                    fileName: item.fileName,
                    error: error.response?.data?.message || 'Error desconocido'
                });
            }
            setImportProgress({ current: i + 1, total: scannedItems.length });
        }

        if (successCount > 0) {
            const modeText = isControlTab ? 'controlados' : 'cargados como esperados';
            toast.success(`¡Listo! ${successCount} productos ${modeText}.`);
            if (isControlTab) {
                const sound = new Audio('/success-beep.mp3');
                sound.play().catch(e => console.log('Audio error:', e));
            }
        }

        if (failCount > 0) {
            toast.error(`${failCount} fallaron al importar`);
            setImportFailedItems(failedItemsLog);
        }

        await fetchReceiptDetails();
        setIsBulkImporting(false);
    };

    const handleEditFailedItemCode = (index, newCode) => {
        setImportFailedItems(prev => {
            const updated = prev.map((item, i) =>
                i === index ? { ...item, code: newCode } : item
            );

            // Si este es el item que se está vinculando, actualizar también linkingItem con la nueva copia
            if (linkingItem === prev[index]) {
                setLinkingItem(updated[index]);
            }

            return updated;
        });
    };

    const handleEditFailedItemDescription = (index, newDesc) => {
        setImportFailedItems(prev => {
            const updated = prev.map((item, i) =>
                i === index ? { ...item, description: newDesc } : item
            );

            if (linkingItem === prev[index]) {
                setLinkingItem(updated[index]);
            }

            return updated;
        });
    };

    const handleResolveFailed = async (index, productCode) => {
        if (processing) return;
        setProcessing(true);
        try {
            await api.post(`/api/receipts/${id}/resolve-failed`, {
                index,
                productCode
            });

            toast.success('Producto vinculado correctamente');
            setLinkingItem(null);
            await fetchReceiptDetails();
        } catch (error) {
            console.error('Error resolving failed item:', error);
            toast.error(error.response?.data?.message || 'Error al vincular el producto');
        } finally {
            setProcessing(false);
        }
    };

    const handleStartLinking = (item) => {
        setLinkingItem(item);
        setLinkingSuggestions([]);
    };

    const handleRetryImport = async (item, index) => {
        if (processing) return;
        
        // Si no hay código, intentamos buscar por descripción
        const searchCode = item.code || item.description;
        if (!searchCode) {
            toast.error('No hay código ni descripción para buscar');
            return;
        }

        setProcessing(true);
        try {
            await api.post(`/api/receipts/${id}/items`, {
                code: searchCode,
                quantity: item.quantity,
                searchType: receipt.type === 'overstock' ? 'internal' : (receipt.type === 'normal' ? 'provider' : 'any')
            });

            toast.success(`¡Éxito! Producto importado: ${item.description}`);

            // Remove from failed items
            setImportFailedItems(prev => prev.filter((_, i) => i !== index));
            if (linkingItem === item) setLinkingItem(null);

            await fetchReceiptDetails();
        } catch (error) {
            console.error('Error re-importing item:', error);
            handleEditFailedItemCode(index, item.code); // Force state refresh
            toast.error(error.response?.data?.message || 'Sigue fallando. Revisa el código.');
        } finally {
            setProcessing(false);
        }
    };

    const handleLinkProduct = async (product) => {
        if (!linkingItem || processing) return;

        setProcessing(true);
        try {
            // 1. Update the product's provider_code and provider_description in the backend
            const updatePayload = {};
            if (linkingItem.code) updatePayload.provider_code = linkingItem.code;
            if (linkingItem.description) updatePayload.provider_description = linkingItem.description;

            if (Object.keys(updatePayload).length > 0) {
                await api.put(`/api/products/${product.id}`, updatePayload);
                toast.info(`Datos de proveedor actualizados para: ${product.description}`, { duration: 2000 });
            }

            // 2. Re-import the item with the correct internal code
            await api.post(`/api/receipts/${id}/items`, {
                code: product.code,
                quantity: linkingItem.quantity
            });

            toast.success(`Vinculado con éxito: ${product.description}`);

            // Remove from failed items
            setImportFailedItems(prev => prev.filter(i => i !== linkingItem));
            setLinkingItem(null);

            await fetchReceiptDetails();
        } catch (error) {
            console.error('Error linking product:', error);
            toast.error(error.response?.data?.message || 'Error al vincular el producto');
        } finally {
            setProcessing(false);
        }
    };

    const handleLinkingSearch = async (e) => {
        const value = e.target.value;
        if (!value || value.length < 2) {
            setLinkingSuggestions([]);
            return;
        }

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        setIsLinkingSearching(true);
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const matches = await searchProductsLocally(value);
                setLinkingSuggestions(matches);
            } catch (error) {
                console.error('Error searching products for linking:', error);
            } finally {
                setIsLinkingSearching(false);
            }
        }, 300);
    };

    const handlePdfUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        try {
            setIsBulkImporting(true);
            let allExtractedItems = [];
            let totalFiles = files.length;

            for (let i = 0; i < totalFiles; i++) {
                const file = files[i];
                if (totalFiles > 1) {
                    toast.info(`Procesando archivo ${i + 1} de ${totalFiles}: ${file.name}`, { duration: 2000 });
                }

                const formData = new FormData();
                formData.append('file', file);
                formData.append('type', receipt.type); // Enviar tipo de remito

                try {
                    const response = await api.post('/api/remitos/upload-pdf', formData);
                    const items = response.data.items;
                    if (items && items.length > 0) {
                        const itemsWithFileName = items.map(item => ({
                            ...item,
                            fileName: file.name
                        }));
                        allExtractedItems = [...allExtractedItems, ...itemsWithFileName];
                    }
                } catch (err) {
                    console.error(`Error processing file ${file.name}:`, err);
                    toast.error(`Error al procesar ${file.name}`);
                }
            }

            if (allExtractedItems.length > 0) {
                await handleScanComplete(allExtractedItems);
            } else {
                toast.info('No se encontraron productos en los PDFs seleccionados');
                setIsBulkImporting(false);
            }
        } catch (error) {
            console.error('Error in multi-pdf upload:', error);
            toast.error('Error general al procesar PDFs');
            setIsBulkImporting(false);
        } finally {
            e.target.value = null;
        }
    };

    if (loading) return <div className="p-4 text-center">Cargando...</div>;
    if (!receipt) return <div className="p-4 text-center">No encontrado</div>;

    // Calculate progress
    const totalExpected = items.reduce((sum, item) => sum + Number(item.expected_quantity), 0);
    const totalScanned = items.reduce((sum, item) => sum + Number(item.scanned_quantity), 0);
    const progress = totalExpected > 0 ? (totalScanned / totalExpected) * 100 : 0;

    return (
        <div className="relative w-full h-full">
            {pendingSyncCount > 0 && (
                <div className="bg-yellow-100 p-2 text-center text-yellow-800 font-bold text-sm w-full sticky top-0 z-50 flex justify-between items-center animate-pulse">
                    <span>⚠️ Offline: {pendingSyncCount} escaneos pendientes.</span>
                    <button onClick={syncOfflineData} className="bg-yellow-500 text-white px-3 py-1 rounded text-xs">Sincronizar</button>
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
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg text-[10px] font-bold border transition-all cursor-pointer ${isSyncing ? 'bg-blue-500 text-white border-blue-400 animate-pulse' : 'bg-white text-gray-500 border-gray-100'}`}
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
                                    🔄
                                </button>
                            )}
                        </>
                    ) : (
                        isSyncing && <span className="ml-1">Sincronizando...</span>
                    )}
                </div>
            </div>
            <div className={`container mx-auto p-4 max-w-lg md:max-w-5xl ${isBarcodeReaderActive || showScanner ? 'hidden' : 'block'}`}>
                {/* Header */}
                <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 leading-tight">Remito: {receipt.remito_number}</h1>
                        <div className="text-sm mt-1">
                            Estado: <span className={receipt.status === 'finalized' ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}>
                                {receipt.status === 'finalized' ? 'FINALIZADO' : 'ABIERTO'}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => {
                                api.get(`/api/receipts/${id}/export`, { responseType: 'blob' })
                                    .then(response => {
                                        downloadFile(new Blob([response.data]), `Remito_${receipt?.remito_number}.xlsx`)
                                            .catch(err => {
                                                console.error('Download error:', err);
                                                toast.error('Error al procesar descarga');
                                            });
                                    })
                                    .catch(err => {
                                        console.error('Export error:', err);
                                        toast.error('Error al descargar Excel');
                                    });
                            }}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
                        >
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Excel
                        </button>
                        <button
                            onClick={() => {
                                const diffItems = items.filter(item => {
                                    const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                    return diff !== 0;
                                });

                                if (diffItems.length === 0) {
                                    toast.info('No hay diferencias para exportar');
                                    return;
                                }

                                api.get(`/api/receipts/${id}/export-differences`, { responseType: 'blob' })
                                    .then(response => {
                                        downloadFile(new Blob([response.data]), `Diferencias_Remito_${receipt?.remito_number}.xlsx`)
                                            .catch(err => {
                                                console.error('Download error:', err);
                                                toast.error('Error al procesar descarga');
                                            });
                                    })
                                    .catch(err => {
                                        console.error('Export error:', err);
                                        toast.error('Error al descargar Excel de diferencias');
                                    });
                            }}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
                        >
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Excel Dif.
                        </button>
                        <button
                            onClick={handleOpenExportToModal}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
                        >
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                            Exportar a Ingreso
                        </button>
                        {receipt.status !== 'finalized' ? (
                            canClose && (
                                <button
                                    onClick={handleFinalize}
                                    className="bg-brand-alert text-white px-6 py-2.5 rounded-lg font-bold hover:bg-red-700 shadow-sm transition-colors"
                                >
                                    Finalizar Ingreso
                                </button>
                            )
                        ) : (
                            canClose && (
                                <button
                                    onClick={handleReopen}
                                    className="bg-amber-500 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-amber-600 shadow-sm transition-colors"
                                >
                                    Reabrir Ingreso
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* Progress */}
                <div className="bg-white p-4 rounded shadow mb-4">
                    <div className="flex justify-between text-sm mb-1">
                        <span>Progreso Global</span>
                        <span>{Math.round(progress)}% ({totalScanned} / {totalExpected})</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Modes Tabs */}
                <div className="flex flex-col sm:flex-row mb-4 bg-gray-200/50 p-1.5 rounded-xl gap-1">
                    <div className="flex flex-1 gap-1">
                        {availableTabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === tab.id ? `bg-white shadow-sm ${tab.colorClass}` : 'text-gray-500'}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.name}
                                {tab.id === 'diff' && (() => {
                                    const count = items.filter(item => {
                                        const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                        return diff !== 0;
                                    }).length;
                                    return count > 0 ? (
                                        <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">{count}</span>
                                    ) : null;
                                })()}
                            </button>
                        ))}
                    </div>
                    {(activeTab === 'load' || activeTab === 'control') && receipt.status !== 'finalized' && canUpload && (
                        <div className="flex gap-2 w-full sm:w-auto">
                            <input
                                type="file"
                                accept=".pdf"
                                multiple
                                className="hidden"
                                id="pdf-upload-input"
                                onChange={handlePdfUpload}
                            />
                            <button
                                onClick={() => document.getElementById('pdf-upload-input').click()}
                                className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-blue-200 text-brand-blue rounded-lg hover:bg-blue-50 text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                            >
                                <span>📄</span> Subir PDF
                            </button>
                            <button
                                onClick={() => setShowScanner(true)}
                                className="flex-1 sm:flex-none px-4 py-2.5 bg-brand-blue text-white rounded-lg hover:bg-blue-700 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
                            >
                                <span>📷</span> OCR
                            </button>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                {receipt.status !== 'finalized' && activeTab !== 'diff' && (
                    <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-gray-100">
                        <form onSubmit={handleScan} className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex-1">
                                    <div className="flex flex-wrap gap-2 mb-3 px-1">
                                        {[
                                            { id: 'any', label: 'Cualquiera', icon: '🔍' },
                                            { id: 'barcode', label: 'Barras', icon: '🏷️' },
                                            { id: 'provider', label: 'Proveedor', icon: '🚚' },
                                            { id: 'internal', label: 'Interno', icon: '🏢' }
                                        ].map(type => (
                                            <button
                                                key={type.id}
                                                type="button"
                                                onClick={() => setSearchType(type.id)}
                                                className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-sm border ${searchType === type.id
                                                    ? 'bg-brand-blue text-white border-brand-blue ring-2 ring-blue-100'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-200 hover:bg-blue-50'
                                                    }`}
                                            >
                                                <span className="text-xs">{type.icon}</span> {type.label}
                                            </button>
                                        ))}
                                    </div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">
                                        {searchType === 'any' ? 'Buscar Producto' :
                                            searchType === 'barcode' ? 'Código de Barras' :
                                                searchType === 'provider' ? 'Código Proveedor' : 'Código Interno'}
                                    </label>
                                    <div className="relative">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={scanInput}
                                            onChange={handleInputChange}
                                            className="w-full text-lg p-3 pr-24 border rounded-xl focus:ring-2 focus:ring-brand-blue outline-none bg-gray-50"
                                            placeholder="Escanear o escribir..."
                                            disabled={processing}
                                            autoComplete="off"
                                        />
                                        {showSuggestions && suggestions.length > 0 && scanInput.trim() !== '' && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                                {suggestions.map((s, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        className="w-full text-left p-3 hover:bg-blue-50 border-b last:border-0 transition-colors"
                                                        onClick={() => {
                                                            setScanInput(s.code);
                                                            setSuggestions([]);
                                                            setShowSuggestions(false);
                                                            // Auto-scan when selected
                                                            setTimeout(() => handleScan(null, s.code), 50);
                                                        }}
                                                    >
                                                        <div className="font-bold text-gray-900">{s.description}</div>
                                                        <div className="text-xs text-gray-500">
                                                            COD: {s.code} {s.provider_code ? `| PROV: ${s.provider_code}` : ''}
                                                            {s.inDocument ? (
                                                                <span className="ml-2 text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">EN DOCUMENTO</span>
                                                            ) : (
                                                                <span className="ml-2 text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded text-[10px]">CATÁLOGO</span>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
                                            {canUseScanner && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={handleVoiceSearch}
                                                        className={`p-2 rounded-lg transition-colors focus:outline-none ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-gray-400 hover:text-brand-blue hover:bg-blue-50'}`}
                                                        title="Buscar por voz"
                                                    >
                                                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsBarcodeReaderActive(true)}
                                                        className="p-2 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-blue-50 transition-colors focus:outline-none"
                                                        title="Escanear con cámara"
                                                    >
                                                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                                        </svg>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-end">
                                    <button
                                        type="submit"
                                        disabled={processing}
                                        className={`flex-none px-8 py-3 h-[52px] rounded-xl text-white font-bold shadow-md transition-all ${activeTab === 'load' ? 'bg-brand-blue hover:bg-blue-700' : 'bg-brand-success hover:bg-green-700'}`}
                                    >
                                        {processing ? '...' : 'OK'}
                                    </button>
                                </div>
                            </div>
                        </form>
                        <div className="text-[10px] text-gray-400 mt-3 text-center uppercase tracking-widest font-bold">
                            {activeTab === 'load'
                                ? 'Agrega items esperados según remito proveedor'
                                : 'Confirma recepción de producto físico'}
                        </div>
                    </div>
                )}

                {/* Content based on Tab */}
                {activeTab === 'history' ? (
                    <ReceiptHistory receiptId={id} />
                ) : activeTab === 'unlinked' ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {importFailedItems.length === 0 ? (
                            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-gray-200 shadow-sm">
                                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h3 className="text-lg font-bold text-gray-800">¡Todo vinculado!</h3>
                                <p className="text-gray-500">No hay productos pendientes de vinculación en este remito.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {importFailedItems.map((item, idx) => (
                                    <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-orange-200 transition-all">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex-1">
                                                <input 
                                                    type="text" 
                                                    value={item.description}
                                                    onChange={(e) => handleEditFailedItemDescription(idx, e.target.value)}
                                                    className="w-full font-bold text-gray-800 border-none p-0 focus:ring-0 bg-transparent text-sm"
                                                    placeholder="Descripción del proveedor"
                                                />
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                                                        CÓD: 
                                                        <input 
                                                            type="text" 
                                                            value={item.code || ''}
                                                            onChange={(e) => handleEditFailedItemCode(idx, e.target.value)}
                                                            className="inline-block w-24 border-none p-0 focus:ring-0 bg-transparent text-[10px] font-mono ml-1"
                                                            placeholder="Sin código"
                                                        />
                                                    </span>
                                                    <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold uppercase">
                                                        CANT: {item.quantity}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                                                    NO ENCONTRADO
                                                </div>
                                            </div>
                                        </div>

                                        {linkingItem === item ? (
                                            <div className="mt-4 p-4 bg-orange-50 rounded-xl border border-orange-100 animate-in zoom-in-95 duration-200">
                                                <label className="block text-[10px] font-bold text-orange-700 uppercase mb-2 px-1">Buscar en catálogo para vincular</label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        placeholder="Escribe nombre, código o barras..."
                                                        onChange={handleLinkingSearch}
                                                        className="w-full text-sm p-3 border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none shadow-inner"
                                                    />
                                                </div>
                                                <div className="mt-3 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                                    {isLinkingSearching && (
                                                        <div className="flex items-center justify-center py-4 gap-2">
                                                            <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-600 rounded-full animate-spin"></div>
                                                            <span className="text-xs text-orange-600 font-medium">Buscando...</span>
                                                        </div>
                                                    )}
                                                    {linkingSuggestions.map((s, sIdx) => (
                                                        <button
                                                            key={sIdx}
                                                            onClick={() => handleResolveFailed(idx, s.code)}
                                                            disabled={processing}
                                                            className="w-full text-left p-3 hover:bg-white rounded-xl border border-transparent hover:border-orange-200 transition-all group flex justify-between items-center"
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-bold text-xs text-gray-900 truncate group-hover:text-orange-700">{s.description}</div>
                                                                <div className="text-[10px] text-gray-500 font-mono mt-0.5">INT: {s.code} {s.barcode ? `| BAR: ${s.barcode}` : ''}</div>
                                                            </div>
                                                            <svg className="w-4 h-4 text-orange-300 opacity-0 group-hover:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                        </button>
                                                    ))}
                                                    {!isLinkingSearching && linkingSuggestions.length === 0 && (
                                                        <div className="text-center py-6 bg-white/50 rounded-xl border border-dashed border-orange-100">
                                                            <p className="text-[10px] text-orange-400 font-medium italic">
                                                                {normalizeText(linkingItem?.description).length > 2 ? 'No se encontraron coincidencias' : 'Ingresa 2 o más caracteres para buscar'}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => setLinkingItem(null)}
                                                    className="w-full mt-4 py-2 text-xs text-orange-700 font-bold hover:bg-orange-100 rounded-lg transition-colors"
                                                >
                                                    Cancelar Búsqueda
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 mt-4">
                                                <button
                                                    onClick={() => handleRetryImport(item, idx)}
                                                    disabled={processing || (!item.code && !item.description)}
                                                    className="flex-1 bg-white border-2 border-green-500 text-green-600 py-2.5 rounded-xl text-xs font-bold hover:bg-green-50 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                                    Probar Código
                                                </button>
                                                <button
                                                    onClick={() => handleStartLinking(item)}
                                                    className="flex-1 bg-orange-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-orange-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-orange-200"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                                    Vincular Manual
                                                </button>
                                            </div>
                                        )}
                                        
                                        <div className="mt-4 pt-3 border-t border-gray-50">
                                            <p className="text-[10px] font-bold text-blue-600 uppercase mb-2 tracking-wider">Sugerencias rápidas:</p>
                                            <QuickSuggestions 
                                                description={item.description} 
                                                onSelect={(product) => handleResolveFailed(idx, product.code)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : activeTab === 'diff' ? (
                    <div className="mb-6">
                        {/* Search input for diff tab */}
                        <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-gray-100">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">
                                Buscar en diferencias
                            </label>
                            <input
                                type="text"
                                value={diffSearch}
                                onChange={e => setDiffSearch(e.target.value)}
                                className="w-full text-base p-3 border rounded-xl focus:ring-2 focus:ring-red-400 outline-none bg-gray-50"
                                placeholder="Buscar por descripción, código o barras..."
                                autoComplete="off"
                            />
                        </div>
                        {(() => {
                            const allDiffItems = items.filter(item => {
                                const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                return diff !== 0;
                            });

                            const searchTerms = diffSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
                            const diffItems = (searchTerms.length > 0
                                ? allDiffItems.filter(item => {
                                    const desc = (item.products?.description || '').toLowerCase();
                                    const code = (item.product_code || '').toLowerCase();
                                    const provCode = (item.products?.provider_code || '').toLowerCase();
                                    return searchTerms.every(term =>
                                        desc.includes(term) || code.includes(term) || provCode.includes(term)
                                    );
                                })
                                : allDiffItems
                            ).sort((a, b) => {
                                const diffA = Math.abs((Number(a.expected_quantity) || 0) - (Number(a.scanned_quantity) || 0));
                                const diffB = Math.abs((Number(b.expected_quantity) || 0) - (Number(b.scanned_quantity) || 0));
                                return diffB - diffA;
                            });

                            if (diffItems.length === 0) {
                                return (
                                    <div className={`bg-white p-12 text-center rounded-xl border border-dashed font-medium ${allDiffItems.length === 0 ? 'border-green-200 text-green-600' : 'border-gray-200 text-gray-400'}`}>
                                        {allDiffItems.length === 0
                                            ? 'Sin diferencias. Todos los productos controlados coinciden con lo esperado.'
                                            : 'No se encontraron productos con esa búsqueda.'}
                                    </div>
                                );
                            }

                            return (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden border border-gray-100">
                                        <table className="min-w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Producto</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Cód. Prov.</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Esperado</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Controlado</th>
                                                    {receipt.type === 'sucursal_transfer' && (
                                                        <th className="px-5 py-3 text-center text-xs font-bold text-red-500 uppercase tracking-widest">Faltante Origen</th>
                                                    )}
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Diferencia</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {diffItems.map((item) => {
                                                    const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                                    const isNotScanned = Number(item.scanned_quantity) === 0;
                                                    let rowColor = '';
                                                    let badgeColor = '';
                                                    let label = '';
                                                    if (isNotScanned) {
                                                        rowColor = 'bg-red-50';
                                                        badgeColor = 'bg-red-100 text-red-800';
                                                        label = `SIN CONTROLAR (${item.expected_quantity})`;
                                                    } else if (diff > 0) {
                                                        rowColor = 'bg-yellow-50';
                                                        badgeColor = 'bg-yellow-100 text-yellow-800';
                                                        label = `FALTAN ${diff}`;
                                                    } else {
                                                        rowColor = 'bg-orange-50';
                                                        badgeColor = 'bg-orange-100 text-orange-800';
                                                        label = `SOBRAN ${Math.abs(diff)}`;
                                                    }
                                                    return (
                                                        <tr key={item.id} className={`${rowColor} transition-colors`}>
                                                            <td className="px-5 py-4">
                                                                <div className="text-sm font-bold text-gray-900">{item.products?.description || 'Sin descripción'}</div>
                                                                <div className="text-xs text-gray-400 font-medium mt-1">INT: {item.product_code}</div>
                                                            </td>
                                                            <td className="px-5 py-4 text-center text-sm text-gray-600 font-mono">{item.products?.provider_code || '-'}</td>
                                                            <td className="px-5 py-4 text-center text-sm text-gray-900 font-black">{item.expected_quantity}</td>
                                                            <td className="px-5 py-4 text-center text-sm text-gray-900 font-black">{item.scanned_quantity}</td>
                                                            {receipt.type === 'sucursal_transfer' && (
                                                                <td className="px-5 py-4 text-center text-sm font-bold text-red-600">
                                                                    {Number(item.origin_expected_quantity || 0) > Number(item.expected_quantity || 0) 
                                                                        ? `-${Number(item.origin_expected_quantity) - Number(item.expected_quantity)}`
                                                                        : '-'}
                                                                    {item.origin_shortage_reason && (
                                                                        <div className="text-[10px] font-normal text-gray-400 mt-0.5">{item.origin_shortage_reason}</div>
                                                                    )}
                                                                </td>
                                                            )}
                                                            <td className="px-5 py-4 text-center">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${badgeColor}`}>
                                                                        {label}
                                                                    </span>
                                                                    {diff < 0 && (
                                                                        <button
                                                                            onClick={() => {
                                                                                setCorrectingItem(item);
                                                                                setCorrectionQuantity(String(item.scanned_quantity));
                                                                                setIsCorrectionModalOpen(true);
                                                                            }}
                                                                            className="p-1 text-orange-600 hover:bg-orange-100 rounded-md transition-colors"
                                                                            title="Corregir cantidad"
                                                                        >
                                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Cards */}
                                    <div className="md:hidden space-y-3">
                                        {diffItems.map((item) => {
                                            const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                            const isNotScanned = Number(item.scanned_quantity) === 0;
                                            let cardColor = 'border-yellow-200 bg-yellow-50';
                                            let badgeColor = 'bg-yellow-100 text-yellow-700';
                                            let label = `FALTAN ${diff}`;
                                            if (isNotScanned) {
                                                cardColor = 'border-red-200 bg-red-50';
                                                badgeColor = 'bg-red-100 text-red-700';
                                                label = `SIN CONTROLAR`;
                                            } else if (diff < 0) {
                                                cardColor = 'border-orange-200 bg-orange-50';
                                                badgeColor = 'bg-orange-100 text-orange-700';
                                                label = `SOBRAN ${Math.abs(diff)}`;
                                            }
                                            return (
                                                <div key={item.id} className={`p-4 rounded-xl border ${cardColor} shadow-sm`}>
                                                    <div className="flex justify-between items-start gap-2 mb-1">
                                                        <h4 className="font-bold text-gray-900 text-sm">{item.products?.description || 'Sin descripción'}</h4>
                                                        {diff < 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    setCorrectingItem(item);
                                                                    setCorrectionQuantity(String(item.scanned_quantity));
                                                                    setIsCorrectionModalOpen(true);
                                                                }}
                                                                className="p-1.5 bg-white text-orange-600 border border-orange-200 rounded-lg shadow-sm active:scale-95 transition-all"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase tracking-wider">INT: {item.product_code}</p>
                                                    {item.products?.provider_code && (
                                                        <p className="text-[10px] text-blue-500 font-mono mb-3">PROV: {item.products.provider_code}</p>
                                                    )}
                                                    <div className="flex justify-between items-center border-t border-white/60 pt-3">
                                                        <div className="flex gap-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase">Esperado</span>
                                                                <span className="text-lg font-black text-gray-700">{item.expected_quantity}</span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase">Controlado</span>
                                                                <span className="text-lg font-black text-brand-blue">{item.scanned_quantity}</span>
                                                            </div>
                                                            {receipt.type === 'sucursal_transfer' && Number(item.origin_expected_quantity || 0) > Number(item.expected_quantity || 0) && (
                                                                <div className="flex flex-col">
                                                                    <span className="text-[9px] font-bold text-red-400 uppercase">Faltó Origen</span>
                                                                    <span className="text-lg font-black text-red-600">
                                                                        -{Number(item.origin_expected_quantity) - Number(item.expected_quantity)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${badgeColor}`}>{label}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                ) : (
                    <div className="mb-6">
                        {/* Desktop Table */}
                        <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden border border-gray-100">
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Producto</th>
                                        <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Esperado</th>
                                        <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Escaneado</th>
                                        {receipt.type === 'sucursal_transfer' && (
                                            <th className="px-5 py-3 text-center text-xs font-bold text-red-500 uppercase tracking-widest">Faltante Origen</th>
                                        )}
                                        <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {items
                                        .sort((a, b) => {
                                            const diffA = a.expected_quantity - a.scanned_quantity;
                                            const diffB = b.expected_quantity - b.scanned_quantity;
                                            return diffB - diffA;
                                        })
                                        .slice(0, visibleItems)
                                        .map((item) => {
                                            const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                            let statusColor = 'bg-gray-100 text-gray-800';
                                            if (item.scanned_quantity === 0) statusColor = 'bg-red-100 text-red-800';
                                            else if (diff === 0) statusColor = 'bg-green-100 text-green-800';
                                            else if (diff > 0) statusColor = 'bg-yellow-100 text-yellow-800';
                                            else if (diff < 0) statusColor = 'bg-orange-100 text-orange-800';

                                            return (
                                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-5 py-4">
                                                        <div className="text-sm font-bold text-gray-900">{item.products?.description || 'Sin descripción'}</div>
                                                        <div className="text-xs text-gray-400 font-medium mt-1">
                                                            INT: {item.product_code} | PROV: {item.products?.provider_code || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-center text-sm text-gray-900 font-black">{item.expected_quantity}</td>
                                                    <td className="px-5 py-4 text-center text-sm text-gray-900 font-black">{item.scanned_quantity}</td>
                                                    {receipt.type === 'sucursal_transfer' && (
                                                        <td className="px-5 py-4 text-center text-sm font-bold text-red-600">
                                                            {Number(item.origin_expected_quantity || 0) > Number(item.expected_quantity || 0) 
                                                                ? `-${Number(item.origin_expected_quantity) - Number(item.expected_quantity)}`
                                                                : '-'}
                                                        </td>
                                                    )}
                                                    <td className="px-5 py-4 text-center">
                                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${statusColor}`}>
                                                            {diff === 0 ? 'COMPLETO' : diff > 0 ? `FALTAN ${diff}` : `SOBRAN ${Math.abs(diff)}`}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-3">
                            {items
                                .sort((a, b) => {
                                    const diffA = a.expected_quantity - a.scanned_quantity;
                                    const diffB = b.expected_quantity - b.scanned_quantity;
                                    return diffB - diffA;
                                })
                                .slice(0, visibleItems)
                                .map((item) => {
                                    const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                    let statusBadge = 'bg-gray-100 text-gray-600';
                                    if (item.scanned_quantity === 0) statusBadge = 'bg-red-50 text-brand-alert';
                                    else if (diff === 0) statusBadge = 'bg-green-50 text-brand-success';
                                    else if (diff > 0) statusBadge = 'bg-yellow-50 text-yellow-700';
                                    else if (diff < 0) statusBadge = 'bg-orange-50 text-orange-700';

                                    return (
                                        <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm active:bg-gray-50 transition-all">
                                            <h4 className="font-bold text-gray-900 text-sm mb-1">{item.products?.description || 'Sin descripción'}</h4>
                                            <p className="text-[10px] text-gray-400 font-bold mb-3 uppercase tracking-wider">
                                                INT: {item.product_code} | PROV: {item.products?.provider_code || '-'}
                                            </p>

                                            <div className="flex justify-between items-center border-t border-gray-50 pt-3">
                                                <div className="flex gap-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase">Esperado</span>
                                                        <span className="text-lg font-black text-gray-700">{item.expected_quantity}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase">Escaneado</span>
                                                        <span className="text-lg font-black text-brand-blue">{item.scanned_quantity}</span>
                                                    </div>
                                                </div>
                                                <div className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase ${statusBadge}`}>
                                                    {diff === 0 ? 'Completo' : diff > 0 ? `Faltan ${diff}` : `Sobran ${Math.abs(diff)}`}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                        {items.length === 0 && (
                            <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-200 text-gray-400 font-medium">
                                No hay productos cargados aún.
                            </div>
                        )}

                        {items.length > visibleItems && (
                            <div className="mt-4 text-center">
                                <button
                                    onClick={() => setVisibleItems(prev => prev + 20)}
                                    className="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 px-8 rounded-xl text-sm transition-colors"
                                >
                                    Ver más ({items.length - visibleItems} productos)
                                </button>
                            </div>
                        )}
                    </div>
                )}

            </div>

            {showScanner && (
                <ReceiptScanner
                    onClose={() => setShowScanner(false)}
                    onScanComplete={handleScanComplete}
                />
            )}

            {/* FULLSCREEN TRANSPARENT NATIVE SCANNER OVERLAY */}
            {isBarcodeReaderActive && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] bg-transparent">
                    <Scanner
                        onScan={handleBarcodeScan}
                        onCancel={() => setIsBarcodeReaderActive(false)}
                        isEnabled={isBarcodeReaderActive}
                        isPaused={fichajeState.isOpen || processing || isDuplicateModalOpen}
                        allowRapidMode={hasBranchPermission}
                        scanStatus={scanStatus}
                    />
                </div>,
                document.body
            )}

            {isBulkImporting && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] bg-black bg-opacity-75 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
                        <div className="w-16 h-16 border-4 border-blue-100 border-t-brand-blue rounded-full animate-spin mb-6"></div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Productos</h2>
                        <p className="text-sm text-gray-500 mb-6">
                            Por favor espera, guardando en la base de datos...<br />
                            ({importProgress.current} de {importProgress.total})
                        </p>
                        <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
                            <div
                                className="bg-brand-blue h-full rounded-full transition-all duration-300"
                                style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                        <p className="text-xs text-gray-400 mt-4 italic">
                            No podrás escanear hasta que termine el guardado.
                        </p>
                    </div>
                </div>,
                document.body
            )}

            {importFailedItems.length > 0 && !['unlinked', 'history', 'diff'].includes(activeTab) && ReactDOM.createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
                        <div className="bg-orange-600 p-4 text-white">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                    Productos no encontrados
                                </h2>
                                <button 
                                    onClick={() => setImportFailedItems([])}
                                    className="p-1 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                            <p className="text-orange-100 text-xs mt-1">
                                Hemos detectado {importFailedItems.length} productos que no están en el catálogo.
                                Puedes vincularlos ahora o hacerlo más tarde desde la nueva pestaña.
                            </p>
                        </div>
                        
                        <div className="p-4 max-h-[60vh] overflow-y-auto bg-gray-50 space-y-3">
                            {importFailedItems.slice(0, 5).map((item, idx) => (
                                <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1">
                                            <div className="font-bold text-sm text-gray-800">{item.description}</div>
                                            <div className="text-[10px] text-gray-500 font-mono">CÓDIGO: {item.code || 'N/A'} | CANT: {item.quantity}</div>
                                        </div>
                                        <button 
                                            onClick={() => { setActiveTab('unlinked'); }}
                                            className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded hover:bg-orange-100 transition-colors uppercase"
                                        >
                                            Vincular →
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {importFailedItems.length > 5 && (
                                <div className="text-center text-xs text-gray-400 py-1">
                                    Y {importFailedItems.length - 5} productos más...
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t bg-white flex flex-col gap-2">
                            <button
                                onClick={() => { setActiveTab('unlinked'); }}
                                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-100 transition-all flex items-center justify-center gap-2"
                            >
                                Ir a la pestaña de vinculación
                            </button>
                            <button
                                onClick={() => setImportFailedItems([])}
                                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-all"
                            >
                                Cerrar y continuar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

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
                                    key={prod.code}
                                    onClick={() => {
                                        setIsDuplicateModalOpen(false);
                                        setDuplicateProducts([]);
                                        openModal({
                                            code: prod.code,
                                            description: prod.description,
                                            barcode: prod.barcode,
                                            secondary_unit: prod.secondary_unit || null,
                                            primary_unit: prod.primary_unit || null,
                                            conversion_factor: prod.conversion_factor || null,
                                            conversion_type: prod.conversion_type || null,
                                        }, prod.expected_quantity, prod.scanned_quantity);
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

            <FichajeModal
                isOpen={fichajeState.isOpen}
                onClose={() => setFichajeState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleFichajeConfirm}
                product={fichajeState.product}
                existingQuantity={fichajeState.existingQuantity}
                expectedQuantity={fichajeState.expectedQuantity}
                receiptId={id}
            />

            {/* Export to another receipt modal */}
            {showExportToModal && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md flex flex-col shadow-2xl">
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 rounded-t-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3 text-white">
                                <div className="p-2 bg-white/20 rounded-xl">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold leading-tight">Exportar a otro Ingreso</h2>
                                    <p className="text-blue-100 text-xs">Seleccioná el ingreso destino</p>
                                </div>
                            </div>
                            <button onClick={() => setShowExportToModal(false)} className="text-white/70 hover:text-white transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <div className="p-4 border-b border-gray-100">
                            <p className="text-sm text-gray-500 mb-3">
                                Se exportarán <span className="font-bold text-gray-800">{items.filter(i => Number(i.scanned_quantity) > 0).length} productos controlados</span> como cantidades esperadas al ingreso seleccionado.
                            </p>
                            <input
                                type="text"
                                placeholder="Buscar ingreso..."
                                value={exportReceiptSearch}
                                onChange={e => setExportReceiptSearch(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>

                        <div className="overflow-y-auto max-h-72 p-2">
                            {loadingExportList ? (
                                <div className="p-6 text-center text-gray-400 text-sm">Cargando ingresos...</div>
                            ) : exportReceiptList.filter(r =>
                                !exportReceiptSearch || r.remito_number?.toLowerCase().includes(exportReceiptSearch.toLowerCase())
                            ).length === 0 ? (
                                <div className="p-6 text-center text-gray-400 text-sm">No hay ingresos abiertos disponibles</div>
                            ) : (
                                exportReceiptList
                                    .filter(r => !exportReceiptSearch || r.remito_number?.toLowerCase().includes(exportReceiptSearch.toLowerCase()))
                                    .map(r => (
                                        <button
                                            key={r.id}
                                            onClick={() => handleExportToReceipt(r.id)}
                                            disabled={exportingTo}
                                            className="w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-200 transition mb-1 flex items-center justify-between group disabled:opacity-50"
                                        >
                                            <div>
                                                <div className="font-semibold text-gray-800 text-sm group-hover:text-blue-700">{r.remito_number}</div>
                                                <div className="text-xs text-gray-400">{r.date ? new Date(r.date).toLocaleDateString('es-AR') : ''}</div>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                                        </button>
                                    ))
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setShowExportToModal(false)}
                                className="px-5 py-2 text-gray-500 font-medium hover:bg-gray-100 rounded-lg transition text-sm"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Correction Modal for Surplus Items */}
            {isCorrectionModalOpen && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl border border-gray-100">
                        <div className="bg-gradient-to-r from-orange-500 to-red-600 p-6 flex items-center gap-4 shadow-lg">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner text-white">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white leading-tight uppercase tracking-wide">Corregir Sobrante</h2>
                                <p className="text-orange-50 text-sm font-medium opacity-90">Ajusta la cantidad controlada</p>
                            </div>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl">
                                <h3 className="text-xs font-bold text-orange-800 uppercase tracking-widest mb-1">Producto</h3>
                                <p className="text-gray-900 font-black text-lg">{correctingItem?.products?.description}</p>
                                <p className="text-xs text-orange-600 font-bold mt-1 uppercase tracking-tighter">CÓDIGO: {correctingItem?.product_code}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Esperado</span>
                                    <span className="text-2xl font-black text-gray-700">{correctingItem?.expected_quantity}</span>
                                </div>
                                <div className="p-4 bg-brand-blue/5 rounded-2xl border border-brand-blue/10">
                                    <span className="block text-[10px] font-bold text-brand-blue uppercase mb-1">Controlado Actual</span>
                                    <span className="text-2xl font-black text-brand-blue">{correctingItem?.scanned_quantity}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Nueva Cantidad Controlada</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        autoFocus
                                        value={correctionQuantity}
                                        onChange={(e) => setCorrectionQuantity(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleConfirmCorrection()}
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-blue focus:bg-white text-3xl font-black text-gray-900 p-5 rounded-2xl outline-none transition-all placeholder-gray-200"
                                        placeholder="0"
                                    />
                                    <div className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 font-black text-xs uppercase tracking-widest pointer-events-none">
                                        Unidades
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                            <button
                                onClick={() => {
                                    setIsCorrectionModalOpen(false);
                                    setCorrectingItem(null);
                                }}
                                disabled={processing}
                                className="flex-1 px-6 py-4 bg-white hover:bg-gray-100 text-gray-500 font-black rounded-2xl border border-gray-200 shadow-sm transition-all active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmCorrection}
                                disabled={processing || !correctionQuantity}
                                className="flex-[2] px-6 py-4 bg-gradient-to-r from-brand-blue to-blue-700 hover:from-blue-700 hover:to-brand-blue text-white font-black rounded-2xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 text-sm uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {processing ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                        </svg>
                                        Guardar Cambio
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default ReceiptDetailsPage;

