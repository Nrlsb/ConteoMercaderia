import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';

import api from '../api';
import Scanner from './Scanner';
import FichajeModal from './FichajeModal';
import { useAuth } from '../context/AuthContext';
import { useProductSync } from '../hooks/useProductSync'; // Add this line
import { db } from '../db';
import { toast } from 'sonner';
import { downloadFile } from '../utils/downloadUtils';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import ReceiptScanner from './ReceiptScanner';

const EgresoDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [egreso, setEgreso] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scanInput, setScanInput] = useState('');
    const [processing, setProcessing] = useState(false);
    const [isBarcodeReaderActive, setIsBarcodeReaderActive] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [visibleItems, setVisibleItems] = useState(20);
    const [activeTab, setActiveTab] = useState('control');
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [scanStatus, setScanStatus] = useState(null);


    // Local DB Sync
    const { syncProducts, getProductByCode, searchProductsLocally, isSyncing, lastSync } = useProductSync();

    const canUseScanner = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || user?.permissions?.includes('use_scanner_egresos');
    const canClose = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || user?.permissions?.includes('close_egresos');
    const canAdminFinalize = user?.role === 'superadmin' || user?.role === 'admin';
    const canUseRapidMode = true; // Habilitado según solicitud

    // Intelligent Search State
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef(null);

    // Diff Tab Search State
    const [diffSearch, setDiffSearch] = useState('');

    // Fichaje Modal State
    const [fichajeState, setFichajeState] = useState({
        isOpen: false,
        product: null,
        existingQuantity: 0,
        expectedQuantity: null
    });

    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Multiple Matches State
    const [multipleMatches, setMultipleMatches] = useState([]);
    const [showMatchModal, setShowMatchModal] = useState(false);

    // Sync Badge Expansion State
    const [isSyncBadgeExpanded, setIsSyncBadgeExpanded] = useState(() => localStorage.getItem('isSyncBadgeExpanded') !== 'false');

    // Linking failed items state
    const [linkingState, setLinkingState] = useState({
        isOpen: false,
        index: null,
        item: null,
        searchInput: '',
        suggestions: [],
        processing: false
    });

    // Optimized map for item lookups
    const productLookupMap = React.useMemo(() => {
        const map = new Map();
        items.forEach(item => {
            if (!(Number(item.expected_quantity) > 0)) return;

            const code = (item.product_code || '').toLowerCase();
            const barcode = (item.products?.barcode || item.barcode || '').toLowerCase();

            if (code) {
                if (!map.has(code)) map.set(code, []);
                map.get(code).push(item);
            }
            if (barcode && barcode !== code) {
                if (!map.has(barcode)) map.set(barcode, []);
                map.get(barcode).push(item);
            }
        });
        return map;
    }, [items]);

    const inputRef = useRef(null);
    const productCacheRef = useRef(new Map());
    const successAudioRef = useRef(new Audio('/success-beep.mp3'));
    const fetchTimeoutRef = useRef(null);

    // Función para refrescar datos con debounce (evita re-renders masivos constantes)
    const debouncedFetch = React.useCallback(() => {
        if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = setTimeout(() => {
            fetchEgresoDetails();
        }, 5000); // Refrescar realidad del servidor cada 5 segs después del último cambio
    }, [id]);

    useEffect(() => {
        return () => {
            if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        fetchEgresoDetails();
        checkPendingSync();
        syncProducts(); // Sync catalog on mount
        window.addEventListener('online', syncOfflineData);
        return () => window.removeEventListener('online', syncOfflineData);
    }, [id]);

    const checkPendingSync = async () => {
        try {
            const count = await db.pending_syncs
                .where({ document_id: id, type: 'egreso' })
                .count();
            setPendingSyncCount(count);
        } catch (e) { console.error('Error counting pending syncs:', e); }
    };

    const syncOfflineData = async () => {
        const queue = await db.pending_syncs
            .where({ document_id: id, type: 'egreso' })
            .toArray();

        if (queue.length === 0) return;

        toast.info(`Sincronizando ${queue.length} registros offline...`, { id: 'sync' });

        try {
            const scans = queue.map(s => ({ code: s.data.code, quantity: s.data.quantity }));
            await api.post(`/api/egresos/${id}/scan/batch`, { scans });
            await db.pending_syncs.bulkDelete(queue.map(s => s.id));
            checkPendingSync();
            toast.success('Sincronización completada exitosamente', { id: 'sync' });
            fetchEgresoDetails();
        } catch (error) {
            console.error('Error syncing:', error);
            toast.error('Error al sincronizar. Se reintentará cuando haya red.', { id: 'sync' });
        }
    };

    useEffect(() => {
        if (!processing && inputRef.current && activeTab === 'control') {
            inputRef.current.focus();
        }
    }, [processing, activeTab, items]);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab]);

    useEffect(() => {
        if (scanStatus) {
            const timer = setTimeout(() => setScanStatus(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [scanStatus]);

    // Pre-warm in-memory cache from localStorage on mount
    useEffect(() => {
        const prefix = 'pbc_';
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                try {
                    const code = key.slice(prefix.length);
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data) productCacheRef.current.set(code, data);
                } catch (e) { }
            }
        }
    }, []);



    const fetchEgresoDetails = async () => {
        try {
            const response = await api.get(`/api/egresos/${id}`);
            setEgreso(response.data);
            setItems(response.data.items || []);
            setLoading(false);
            // Guardar respaldo local en IndexedDB
            await db.offline_caches.put({
                id: `egreso_${id}`,
                data: response.data,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Error fetching egreso details:', error);
            // Intentar recuperar de caché local IndexedDB
            const cache = await db.offline_caches.get(`egreso_${id}`);
            if (cache && cache.data) {
                setEgreso(cache.data);
                setItems(cache.data.items || []);
                setLoading(false);
                toast.info('Cargado desde respaldo offline local');
            } else {
                toast.error('Error al cargar los detalles');
                setLoading(false);
            }
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const response = await api.get(`/api/egresos/${id}/history`);
            setHistory(response.data);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const executeSearch = (value) => {
        if (!value || value.length < 2) {
            setShowSuggestions(false);
            setSuggestions([]);
            return;
        }

        const valueLower = value.toLowerCase().trim();
        const searchTerms = valueLower.split(/\s+/);

        // 1. Local document search (first priority)
        const localSuggestions = items.filter(i => {
            if (!(Number(i.expected_quantity) > 0)) return false;

            const desc = (i.products?.description || '').toLowerCase();
            const code = (i.product_code || '').toLowerCase();
            const barcode = (i.products?.barcode || i.barcode || '').toLowerCase();
            return searchTerms.every(term =>
                desc.includes(term) || code.includes(term) || barcode.includes(term)
            );
        }).map(i => ({
            code: i.product_code,
            description: i.products?.description || 'Producto',
            barcode: i.products?.barcode || i.barcode || '',
            inDocument: true
        }));

        const unique = Array.from(new Set(localSuggestions.map(a => a.code)))
            .map(code => localSuggestions.find(a => a.code === code));

        setSuggestions(unique);
        setShowSuggestions(unique.length > 0);
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
                }).then(result => {
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
                            const term = match.toLowerCase();
                            const found = items.some(i => {
                                const desc = (i.products?.description || '').toLowerCase();
                                const code = (i.product_code || '').toLowerCase();
                                const barcode = (i.products?.barcode || i.barcode || '').toLowerCase();
                                const searchTerms = term.toLowerCase().trim().split(/\\s+/);
                                return searchTerms.every(t => desc.includes(t) || code.includes(t) || barcode.includes(t));
                            });
                            if (found) {
                                setScanInput(match);
                                executeSearch(match);
                                return;
                            }
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

    const processProductSelection = (product) => {
        const existingItem = items.find(i => i.product_code === product.code);

        if (existingItem && Number(existingItem.expected_quantity) > 0) {
            openModal({
                code: existingItem.product_code,
                description: existingItem.products?.description || 'Producto',
                barcode: existingItem.products?.barcode || existingItem.barcode || '',
                secondary_unit: existingItem.products?.secondary_unit || null,
                primary_unit: existingItem.products?.primary_unit || null,
                conversion_factor: existingItem.products?.conversion_factor || null,
                conversion_type: existingItem.products?.conversion_type || null,
            }, existingItem.expected_quantity, existingItem.scanned_quantity);
        } else {
            toast.error(`El producto "${product.code}" no forma parte de este remito de egreso.`);
        }
    };

    const handleScan = async (e, overrideCode = null) => {
        if (e) e.preventDefault();
        if (processing) return;
        const code = (overrideCode || scanInput).trim();
        if (!code) return;

        const lowerCode = code.toLowerCase();

        // 1. Optimized search in current items Map (O(1) lookup)
        let matchingItems = productLookupMap.get(lowerCode) || [];

        // Ruta rápida: match directo sin setProcessing para evitar re-render intermedio
        if (matchingItems.length === 1) {
            setScanInput('');
            processProductSelection({
                code: matchingItems[0].product_code,
                description: matchingItems[0].products?.description || 'Producto',
                barcode: matchingItems[0].products?.barcode || matchingItems[0].barcode || '',
                secondary_unit: matchingItems[0].products?.secondary_unit || null,
                primary_unit: matchingItems[0].products?.primary_unit || null,
                conversion_factor: matchingItems[0].products?.conversion_factor || null,
                conversion_type: matchingItems[0].products?.conversion_type || null,
            });
            return;
        }

        // Ruta lenta: necesita búsqueda adicional
        setProcessing(true);

        // 2. Intelligent Search (If no exact match, search by terms - Fallback)
        if (matchingItems.length === 0) {
            const searchTerms = lowerCode.split(/\s+/);
            matchingItems = items.filter(i => {
                if (!(Number(i.expected_quantity) > 0)) return false;

                const desc = (i.products?.description || '').toLowerCase();
                const icode = (i.product_code || '').toLowerCase();
                const barcode = (i.products?.barcode || i.barcode || '').toLowerCase();
                return searchTerms.every(term =>
                    desc.includes(term) || icode.includes(term) || barcode.includes(term)
                );
            });
        }

        if (matchingItems.length === 1) {
            setScanInput('');
            processProductSelection({
                code: matchingItems[0].product_code,
                description: matchingItems[0].products?.description || 'Producto',
                barcode: matchingItems[0].products?.barcode || matchingItems[0].barcode || '',
                secondary_unit: matchingItems[0].products?.secondary_unit || null,
                primary_unit: matchingItems[0].products?.primary_unit || null,
                conversion_factor: matchingItems[0].products?.conversion_factor || null,
                conversion_type: matchingItems[0].products?.conversion_type || null,
            });
        } else if (matchingItems.length > 1) {
            setScanInput('');
            setMultipleMatches(matchingItems.map(i => ({
                id: i.id || i.product_code,
                code: i.product_code,
                description: i.products?.description || 'Producto',
                barcode: i.products?.barcode || i.barcode || '',
                secondary_unit: i.products?.secondary_unit || null,
                primary_unit: i.products?.primary_unit || null,
                conversion_factor: i.products?.conversion_factor || null,
                conversion_type: i.products?.conversion_type || null,
            })));
            setShowMatchModal(true);
        } else {
            // Fallback: Check local catalog — cache first, then smart single IndexedDB call
            const lowerFallback = code.toLowerCase();
            let localProduct = productCacheRef.current.get(lowerFallback);
            if (!localProduct) {
                localProduct = await getProductByCode(code);
                if (localProduct) productCacheRef.current.set(lowerFallback, localProduct);
            }
            if (localProduct) {
                const errorMsg = `El producto "${localProduct.description}" (${code}) no forma parte de este remito de egreso.`;
                toast.error(errorMsg, { duration: 4000 });
                setScanStatus({ type: 'error', message: errorMsg });
            } else {
                const errorMsg = `El producto "${code}" no fue encontrado como código interno ni barras.`;
                toast.error(errorMsg, { duration: 4000 });
                setScanStatus({ type: 'error', message: errorMsg });
            }
            setScanInput('');
        }
        setProcessing(false);
    };

    const handleFichajeConfirm = async (quantityToAdd) => {
        const { product } = fichajeState;
        if (!product || processing) return;

        setProcessing(true);
        const code = product.code;
        const qty = parseFloat(quantityToAdd) || 1;

        if (!navigator.onLine) {
            await db.pending_syncs.add({
                document_id: id,
                type: 'egreso',
                data: { code, quantity: qty },
                timestamp: Date.now()
            });

            setItems(prevItems => prevItems.map(item => {
                if (item.product_code === code) {
                    return { ...item, scanned_quantity: Number(item.scanned_quantity) + qty };
                }
                return item;
            }));

            toast.success(`Controlado offline: cantidad ${qty} (Se sincronizará al conectar)`, { duration: 4000 });
            setFichajeState(prev => ({ ...prev, isOpen: false }));
            checkPendingSync();
            setProcessing(false);
            return;
        }

        // Optimistic local update
        setItems(prevItems => prevItems.map(item => {
            if (item.product_code === code) {
                return { ...item, scanned_quantity: Number(item.scanned_quantity) + qty };
            }
            return item;
        }));

        // Close modal immediately
        setScanInput('');
        setFichajeState(prev => ({ ...prev, isOpen: false }));
        setProcessing(false); // Liberar para el próximo escaneo inmediatamente

        // API call + refresh in background
        try {
            await api.post(`/api/egresos/${id}/scan`, { code, quantity: qty });
            // optimistic update already applied, no re-fetch needed
        } catch (error) {
            console.error('Scan error:', error);
            
            const serverMsg = error.response?.data?.message;
            if (error.response?.status === 400 && serverMsg) {
                // Rejection from server (likely exceeded quantity)
                toast.error(serverMsg);
                // Revert optimistic update
                setItems(prevItems => prevItems.map(item => {
                    if (item.product_code === code) {
                        return { ...item, scanned_quantity: Number(item.scanned_quantity) - qty };
                    }
                    return item;
                }));
                fetchEgresoDetails(); 
            } else if (error.response?.status === 404) {
                toast.error(`Producto no encontrado: ${code}`);
                fetchEgresoDetails(); // Revert: product doesn't exist on server
            } else {
                // API failed (network/server error) — queue for later sync, keep optimistic state
                await db.pending_syncs.add({
                    document_id: id,
                    type: 'egreso',
                    data: { code, quantity: qty },
                    timestamp: Date.now()
                });
                checkPendingSync();
                toast.warning('Sin conexión. Guardado localmente, se sincronizará al reconectar.', { duration: 4000 });
            }
        }
    };

    const handleReasonChange = async (productCode, reason) => {
        try {
            // Optimistic update
            setItems(prevItems => prevItems.map(item =>
                item.product_code === productCode ? { ...item, shortage_reason: reason } : item
            ));

            await api.put(`/api/egresos/${id}/items/${productCode}/reason`, { reason });
        } catch (error) {
            console.error('Error updating reason:', error);
            toast.error('Error al guardar el motivo');
            fetchEgresoDetails(); // Revert on failure
        }
    };

    const handleBarcodeScan = (code) => {
        const mode = localStorage.getItem('scanner_mode');
        if (mode === 'rapid' && canUseRapidMode) {
            setScanInput(code);
            handleRapidScan(code);
        } else {
            // Buscar directamente sin setScanInput previo para evitar re-render intermedio
            handleScan(null, code);
        }
    };

    const handleRapidScan = async (code) => {
        if (processing) return;
        setProcessing(true);

        // Limpiar estado previo
        setScanStatus(null);

        // Find product(s) in current items
        const matchingItems = productLookupMap.get(code.toLowerCase()) || [];

        if (matchingItems.length === 1) {
            const item = matchingItems[0];
            await handleRapidConfirm(item.product_code, item.products?.description || 'Producto');
        } else if (matchingItems.length > 1) {
            setScanStatus({ type: 'error', message: 'Múltiples productos encontrados. Use modo Manual.' });
            setTimeout(() => setScanStatus(null), 3000);
            setProcessing(false);
        } else {
            // Check catalog
            try {
                const localProduct = await getProductByCode(code);
                if (localProduct) {
                    // Verificar si está en el egreso
                    const inEgreso = items.find(i => i.product_code === localProduct.code);
                    if (inEgreso) {
                        await handleRapidConfirm(localProduct.code, localProduct.description);
                    } else {
                        setScanStatus({ type: 'error', message: `Producto no forma parte de este egreso.` });
                        setTimeout(() => setScanStatus(null), 3000);
                        setProcessing(false);
                    }
                } else {
                    setScanStatus({ type: 'error', message: `Producto no encontrado: ${code}` });
                    setTimeout(() => setScanStatus(null), 3000);
                    setProcessing(false);
                }
            } catch (error) {
                setScanStatus({ type: 'error', message: 'Error al buscar producto' });
                setProcessing(false);
            }
        }
    };

    const handleRapidConfirm = async (code, description) => {
        try {
            const qty = 1;
            
            // Optimistic local update
            setItems(prevItems => prevItems.map(item => {
                if (item.product_code === code) {
                    return { ...item, scanned_quantity: Number(item.scanned_quantity) + qty };
                }
                return item;
            }));

            setScanStatus({ type: 'success', message: `Controlado: ${description}` });
            if (successAudioRef.current) {
                successAudioRef.current.currentTime = 0;
                successAudioRef.current.play().catch(() => {});
            }

            if (!navigator.onLine) {
                await db.pending_syncs.add({
                    document_id: id,
                    type: 'egreso',
                    data: { code, quantity: qty },
                    timestamp: Date.now()
                });
                checkPendingSync();
            } else {
                await api.post(`/api/egresos/${id}/scan`, { code, quantity: qty });
            }
            debouncedFetch();
        } catch (error) {
            console.error('Rapid scan error:', error);
            toast.error('Error al procesar escaneo rápido');
        } finally {
            // Artificial delay to prevent double scan and allow user to move camera
            setTimeout(() => {
                setProcessing(false);
            }, 400);
        }
    };

    const handleOpenLinkModal = (item, index) => {
        setLinkingState({
            isOpen: true,
            index: index,
            item: item,
            searchInput: item.code || '',
            suggestions: [],
            processing: false
        });
    };

    const handleLinkingSearch = async (val) => {
        setLinkingState(prev => ({ ...prev, searchInput: val }));
        if (val.length < 2) {
            setLinkingState(prev => ({ ...prev, suggestions: [] }));
            return;
        }

        // Search locally in products DB (Only internal or barcode)
        const resultsByCode = await searchProductsLocally(val, 'internal');
        const resultsByBar = await searchProductsLocally(val, 'barcode');
        const combined = Array.from(new Set([...resultsByCode, ...resultsByBar].map(p => p.code)))
            .map(code => [...resultsByCode, ...resultsByBar].find(p => p.code === code));

        setLinkingState(prev => ({ ...prev, suggestions: combined.slice(0, 10) }));
    };

    const handleResolveFailed = async (productCode) => {
        if (linkingState.processing) return;
        setLinkingState(prev => ({ ...prev, processing: true }));

        try {
            await api.post(`/api/egresos/${id}/resolve-failed`, {
                index: linkingState.index,
                productCode: productCode
            });
            toast.success('Producto vinculado correctamente');
            setLinkingState(prev => ({ ...prev, isOpen: false }));
            fetchEgresoDetails();
        } catch (error) {
            console.error('Error linking product:', error);
            toast.error(error.response?.data?.message || 'Error al vincular el producto');
        } finally {
            setLinkingState(prev => ({ ...prev, processing: false }));
        }
    };

    const handleFinalize = async () => {
        if (!window.confirm('¿Está seguro de finalizar este egreso? No se podrán realizar más cambios.')) return;

        try {
            await api.put(`/api/egresos/${id}/close`, {});
            toast.success('Egreso finalizado');
            fetchEgresoDetails();
        } catch (error) {
            console.error('Error finalizing:', error);
            toast.error('Error al finalizar');
        }
    };

    const handleAdminFinalize = async () => {
        if (!window.confirm('¿Está seguro de finalizar este egreso y completar todas las cantidades automáticamente?')) return;

        try {
            await api.put(`/api/egresos/${id}/finalize`, {});
            toast.success('Egreso finalizado y cantidades completadas');
            fetchEgresoDetails();
        } catch (error) {
            console.error('Error finalizing:', error);
            toast.error('Error al finalizar');
        }
    };

    const handleReopen = async () => {
        if (!window.confirm('¿Está seguro de reabrir este egreso?')) return;

        try {
            await api.put(`/api/egresos/${id}/reopen`, {});
            toast.success('Egreso reabierto');
            fetchEgresoDetails();
        } catch (error) {
            console.error('Error reopening:', error);
            toast.error('Error al reabrir');
        }
    };



    const handlePrintDifferences = () => {
        const hasDifferences = items.some(item => {
            const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
            return diff !== 0;
        });

        if (!hasDifferences) {
            toast.info('No hay diferencias para exportar');
            return;
        }

        api.get(`/api/egresos/${id}/export?onlyDifferences=true`, { responseType: 'blob' })
            .then(response => {
                downloadFile(new Blob([response.data]), `Diferencias_Egreso_${egreso?.reference_number}.xlsx`)
                    .catch(err => {
                        console.error('Download error:', err);
                        toast.error('Error al procesar descarga');
                    });
            })
            .catch(err => {
                console.error('Export differences error:', err);
                toast.error('Error al descargar Excel de diferencias');
            });
    };

    if (loading) return <div className="p-4 text-center">Cargando...</div>;
    if (!egreso) return <div className="p-4 text-center">No encontrado</div>;

    // Calculate progress
    const totalExpected = items.reduce((sum, item) => sum + Number(item.expected_quantity), 0);
    const totalScanned = items.reduce((sum, item) => sum + Number(item.scanned_quantity), 0);
    const progress = totalExpected > 0 ? (totalScanned / totalExpected) * 100 : 0;

    const getOperationLabel = (op) => {
        switch (op) {
            case 'PDF_IMPORT': return '📄 Importado desde PDF';
            case 'UPDATE_SCANNED': return '📦 Control actualizado';
            case 'INSERT_SCANNED': return '📦 Primer control';
            default: return op;
        }
    };

    return (
        <div className="relative w-full h-full">
            <div className={`container mx-auto p-4 max-w-lg md:max-w-5xl ${isBarcodeReaderActive ? 'hidden' : 'block'}`}>
                {/* Header */}
                <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => navigate('/egresos')} className="text-gray-400 hover:text-gray-700">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                            </button>
                            <h1 className="text-xl font-bold text-gray-900 leading-tight">Egreso: {egreso.reference_number}</h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 ml-7">
                            <span className="text-sm">
                                Estado: <span className={egreso.status === 'finalized' ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}>
                                    {egreso.status === 'finalized' ? 'FINALIZADO' : 'ABIERTO'}
                                </span>
                            </span>
                            {egreso.document_url && (
                                <div className="flex flex-wrap gap-2 ml-2">
                                    {(() => {
                                        try {
                                            const docs = JSON.parse(egreso.document_url);
                                            if (Array.isArray(docs)) {
                                                return docs.map((url, idx) => (
                                                    <a 
                                                        key={idx}
                                                        href={url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded text-xs"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                        PDF {idx + 1}
                                                    </a>
                                                ));
                                            }
                                        } catch (e) {
                                            return (
                                                <a 
                                                    href={egreso.document_url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded text-xs"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                    Ver Documento
                                                </a>
                                            );
                                        }
                                    })()}
                                </div>
                            )}
                            {egreso.is_devolucion && (
                                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 uppercase">
                                    Remito de Devolución
                                </span>
                            )}
                            {egreso.is_transferencia && (
                                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 uppercase">
                                    Remito de Transferencia
                                </span>
                            )}
                        </div>
                        {egreso.pdf_filename && (
                            <div className="text-xs text-gray-400 ml-7 mt-0.5">📄 {egreso.pdf_filename}</div>
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        {pendingSyncCount > 0 && (
                            <button
                                onClick={syncOfflineData}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-100 border border-yellow-300 rounded-lg text-sm font-bold text-yellow-800 shadow-sm transition-all animate-pulse"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                {pendingSyncCount} <span className="hidden sm:inline">pendientes</span>
                            </button>
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
                        <button
                            onClick={() => {
                                api.get(`/api/egresos/${id}/export`, { responseType: 'blob' })
                                    .then(response => {
                                        downloadFile(new Blob([response.data]), `Egreso_${egreso?.reference_number}.xlsx`)
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
                            onClick={handlePrintDifferences}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
                        >
                            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                            Dif.
                        </button>

                        {egreso.status !== 'finalized' ? (
                            <div className="flex gap-2">
                                {canAdminFinalize && (
                                    <button
                                        onClick={handleAdminFinalize}
                                        className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-700 shadow-sm transition-colors"
                                        title="Finaliza el remito y carga todas las cantidades como completas"
                                    >
                                        Finalizar y Completar
                                    </button>
                                )}
                                {canClose && (
                                    <button
                                        onClick={handleFinalize}
                                        className="bg-brand-alert text-white px-6 py-2.5 rounded-lg font-bold hover:bg-red-700 shadow-sm transition-colors"
                                    >
                                        Finalizar Egreso
                                    </button>
                                )}
                            </div>
                        ) : (
                            canClose && (
                                <button
                                    onClick={handleReopen}
                                    className="bg-amber-500 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-amber-600 shadow-sm transition-colors"
                                >
                                    Reabrir Egreso
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* Progress */}
                <div className="bg-white p-4 rounded shadow mb-4">
                    <div className="flex justify-between text-sm mb-1">
                        <span>Progreso de Control</span>
                        <span>{Math.round(progress)}% ({totalScanned} / {totalExpected})</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex flex-col sm:flex-row mb-4 bg-gray-200/50 p-1.5 rounded-xl gap-1">
                    <div className="flex flex-1 gap-1">
                        <button
                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'control' ? 'bg-white shadow-sm text-brand-blue' : 'text-gray-500'}`}
                            onClick={() => setActiveTab('control')}
                        >
                            Controlar
                        </button>
                        <button
                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'diff' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500'}`}
                            onClick={() => setActiveTab('diff')}
                        >
                            Diferencias
                            {(() => {
                                const count = items.filter(item => {
                                    const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                    return diff !== 0;
                                }).length;
                                return count > 0 ? (
                                    <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">{count}</span>
                                ) : null;
                            })()}
                        </button>
                        <button
                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'failed' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500'}`}
                            onClick={() => setActiveTab('failed')}
                            style={{ display: egreso.failed_items?.length > 0 ? 'block' : 'none' }}
                        >
                            No encontrados
                            {egreso.failed_items?.length > 0 && (
                                <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-700">{egreso.failed_items.length}</span>
                            )}
                        </button>
                        <button
                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500'}`}
                            onClick={() => setActiveTab('history')}
                        >
                            Historial
                        </button>
                    </div>
                </div>

                {/* Input Area - Control Mode */}
                {egreso.status !== 'finalized' && activeTab === 'control' && (
                    <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-gray-100">
                        <form onSubmit={handleScan} className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">
                                        Escanear Producto (Código / Barras)
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
                                                            setTimeout(() => handleScan(null, s.code), 50);
                                                        }}
                                                    >
                                                        <div className="font-bold text-gray-900">{s.description}</div>
                                                        <div className="text-xs text-gray-500">
                                                            COD: {s.code} {s.barcode ? `| BARRAS: ${s.barcode}` : ''}
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
                                        className="flex-none px-8 py-3 h-[52px] rounded-xl text-white font-bold shadow-md transition-all bg-brand-blue hover:bg-blue-700"
                                    >
                                        {processing ? '...' : 'OK'}
                                    </button>
                                </div>
                            </div>
                        </form>
                        <div className="text-[10px] text-gray-400 mt-3 text-center uppercase tracking-widest font-bold">
                            Confirma disponibilidad del producto para egreso
                        </div>
                    </div>
                )}

                {activeTab === 'failed' && egreso.failed_items?.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                        <div className="p-4 bg-amber-50 border-b border-amber-100">
                            <h2 className="text-amber-800 font-bold flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Productos no encontrados en el catálogo
                            </h2>
                            <p className="text-amber-700 text-xs mt-1">Estos productos fueron detectados en el PDF pero sus códigos no existen en la base de datos.</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Código PDF</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción PDF</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Cantidad</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {egreso.failed_items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">{item.code}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{item.description}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-gray-900">{item.quantity}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-center">
                                                <button
                                                    onClick={() => handleOpenLinkModal(item, idx)}
                                                    className="px-3 py-1 bg-brand-blue text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                                >
                                                    Vincular
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Content based on Tab */}
                {activeTab === 'diff' ? (
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
                                    const barcode = (item.products?.barcode || '').toLowerCase();
                                    return searchTerms.every(term =>
                                        desc.includes(term) || code.includes(term) || barcode.includes(term)
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
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Cód. Barras</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Esperado</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Controlado</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Diferencia</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Motivo Faltante</th>
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
                                                            <td className="px-5 py-4 text-center text-sm text-gray-600 font-mono">{item.products?.barcode || '-'}</td>
                                                            <td className="px-5 py-4 text-center text-sm text-gray-900 font-black">{item.expected_quantity}</td>
                                                            <td className="px-5 py-4 text-center text-sm text-gray-900 font-black">{item.scanned_quantity}</td>
                                                            <td className="px-5 py-4 text-center">
                                                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${badgeColor}`}>
                                                                    {label}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-4 text-center">
                                                                {diff > 0 && (
                                                                    <select
                                                                        value={item.shortage_reason || ''}
                                                                        onChange={(e) => handleReasonChange(item.product_code, e.target.value)}
                                                                        className="text-xs p-1 border rounded bg-white font-medium outline-none focus:ring-1 focus:ring-blue-400"
                                                                        disabled={egreso.status === 'finalized'}
                                                                    >
                                                                        <option value="">(Sin motivo)</option>
                                                                        <option value="no hay stock">No hay stock</option>
                                                                        <option value="producto dañado">Producto dañado</option>
                                                                        <option value="colorante de color">Colorante de color</option>
                                                                    </select>
                                                                )}
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
                                                    <h4 className="font-bold text-gray-900 text-sm mb-1">{item.products?.description || 'Sin descripción'}</h4>
                                                    <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase tracking-wider">INT: {item.product_code}</p>
                                                    {item.products?.barcode && (
                                                        <p className="text-[10px] text-blue-500 font-mono mb-3">{item.products.barcode}</p>
                                                    )}

                                                    {diff > 0 && (
                                                        <div className="mb-3">
                                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Motivo del Faltante</label>
                                                            <select
                                                                value={item.shortage_reason || ''}
                                                                onChange={(e) => handleReasonChange(item.product_code, e.target.value)}
                                                                className="w-full text-xs p-2 border rounded-lg bg-white font-medium outline-none focus:ring-1 focus:ring-blue-400"
                                                                disabled={egreso.status === 'finalized'}
                                                            >
                                                                <option value="">(Sin motivo)</option>
                                                                <option value="no hay stock">No hay stock</option>
                                                                <option value="producto dañado">Producto dañado</option>
                                                                <option value="colorante de color">Colorante de color</option>
                                                            </select>
                                                        </div>
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
                ) : activeTab === 'history' ? (
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                        <h2 className="text-lg font-bold text-gray-800 mb-4">Historial de Cambios</h2>
                        {historyLoading ? (
                            <div className="text-center py-8 text-gray-400">Cargando historial...</div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 italic">Sin cambios registrados</div>
                        ) : (
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                                {history.map((entry, idx) => (
                                    <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">{getOperationLabel(entry.operation)}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">{entry.description} ({entry.product_code})</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-gray-400">{new Date(entry.changed_at).toLocaleString()}</div>
                                                <div className="text-xs text-gray-500 font-medium">{entry.username}</div>
                                            </div>
                                        </div>
                                        {entry.old_data && entry.new_data && (
                                            <div className="mt-2 text-xs text-gray-500 flex gap-4">
                                                {entry.old_data.expected_quantity !== undefined && (
                                                    <span>Esperado: {entry.old_data.expected_quantity} → {entry.new_data.expected_quantity}</span>
                                                )}
                                                {entry.old_data.scanned_quantity !== undefined && (
                                                    <span>Controlado: {entry.old_data.scanned_quantity} → {entry.new_data.scanned_quantity}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mb-6">
                        {/* Filter: only show items that have been scanned */}
                        {(() => {
                            const scannedItems = items.filter(item => Number(item.scanned_quantity) > 0);
                            return (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden border border-gray-100">
                                        <table className="min-w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Producto</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Cód. Barras</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Esperado</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Controlado</th>
                                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {scannedItems
                                                    .sort((a, b) => {
                                                        const dateA = new Date(a.last_scanned_at || 0);
                                                        const dateB = new Date(b.last_scanned_at || 0);
                                                        return dateB - dateA;
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
                                                                        INT: {item.product_code}
                                                                    </div>
                                                                </td>
                                                                <td className="px-5 py-4 text-center text-sm text-gray-600 font-mono">
                                                                    {item.products?.barcode || '-'}
                                                                </td>
                                                                <td className="px-5 py-4 text-center text-sm text-gray-900 font-black">{item.expected_quantity}</td>
                                                                <td className="px-5 py-4 text-center text-sm text-gray-900 font-black">{item.scanned_quantity}</td>
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
                                        {scannedItems
                                            .sort((a, b) => {
                                                const dateA = new Date(a.last_scanned_at || 0);
                                                const dateB = new Date(b.last_scanned_at || 0);
                                                return dateB - dateA;
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
                                                        <p className="text-[10px] text-gray-400 font-bold mb-1 uppercase tracking-wider">
                                                            INT: {item.product_code}
                                                        </p>
                                                        {item.products?.barcode && (
                                                            <p className="text-[10px] text-blue-500 font-mono mb-3">
                                                                🔖 {item.products.barcode}
                                                            </p>
                                                        )}

                                                        <div className="flex justify-between items-center border-t border-gray-50 pt-3">
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase">Cantidad escaneada</span>
                                                                <span className="text-lg font-black text-brand-blue">{item.scanned_quantity}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>

                                    {scannedItems.length === 0 && (
                                        <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-200 text-gray-400 font-medium">
                                            No hay productos escaneados aún. Empezá a controlar escaneando productos.
                                        </div>
                                    )}

                                    {scannedItems.length > visibleItems && (
                                        <div className="mt-4 text-center">
                                            <button
                                                onClick={() => setVisibleItems(prev => prev + 20)}
                                                className="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 px-8 rounded-xl text-sm transition-colors"
                                            >
                                                Ver más ({scannedItems.length - visibleItems} productos)
                                            </button>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                )}

            </div>

            {/* FULLSCREEN TRANSPARENT NATIVE SCANNER OVERLAY */}
            {isBarcodeReaderActive && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] bg-transparent">
                    <Scanner
                        onScan={handleBarcodeScan}
                        onCancel={() => setIsBarcodeReaderActive(false)}
                        isEnabled={isBarcodeReaderActive}
                        isPaused={fichajeState.isOpen || showMatchModal || processing}
                        allowRapidMode={canUseRapidMode}
                        scanStatus={scanStatus}
                    />
                </div>,
                document.body
            )}

            {/* Fichaje Modal */}
            <FichajeModal
                isOpen={fichajeState.isOpen}
                onClose={() => setFichajeState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleFichajeConfirm}
                product={fichajeState.product}
                existingQuantity={fichajeState.existingQuantity}
                expectedQuantity={fichajeState.expectedQuantity}
                isEgreso={true}
            />

            {/* Multiple Matches Modal */}
            {showMatchModal && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-brand-blue text-white">
                            <h3 className="font-bold text-lg">Múltiples productos encontrados</h3>
                            <button
                                onClick={() => setShowMatchModal(false)}
                                className="p-1 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            <p className="text-sm text-gray-500 mb-4">
                                Se encontraron varios productos con el código <span className="font-bold text-gray-900">{scanInput}</span>. Por favor, seleccioná el correcto:
                            </p>
                            <div className="space-y-3">
                                {multipleMatches.map((match) => (
                                    <button
                                        key={match.id}
                                        onClick={() => {
                                            setShowMatchModal(false);
                                            processProductSelection(match);
                                        }}
                                        className="w-full text-left p-4 rounded-xl border-2 border-gray-100 hover:border-brand-blue hover:bg-blue-50 transition-all flex flex-col gap-1 group"
                                    >
                                        <div className="font-bold text-gray-900 group-hover:text-brand-blue transition-colors">{match.description}</div>
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>COD: {match.code}</span>
                                            {match.barcode && <span>BAR: {match.barcode}</span>}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-100">
                            <button
                                onClick={() => setShowMatchModal(false)}
                                className="w-full py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors shadow-sm"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Link Failed Item Modal */}
            {linkingState.isOpen && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-brand-blue text-white">
                            <h3 className="font-bold text-lg">Vincular Producto</h3>
                            <button
                                onClick={() => setLinkingState(prev => ({ ...prev, isOpen: false }))}
                                className="p-1 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            <div className="mb-6 p-3 bg-amber-50 rounded-lg border border-amber-100">
                                <div className="text-[10px] font-bold text-amber-500 uppercase mb-1">Item del PDF</div>
                                <div className="font-bold text-gray-800 text-sm">{linkingState.item.description}</div>
                                <div className="text-xs text-gray-500 mt-0.5">Código PDF: <span className="font-mono">{linkingState.item.code}</span> | Cantidad: {linkingState.item.quantity}</div>
                            </div>

                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2 px-1">
                                Buscar producto correcto en catálogo
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={linkingState.searchInput}
                                    onChange={(e) => handleLinkingSearch(e.target.value)}
                                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-brand-blue outline-none bg-gray-50"
                                    placeholder="Escribir descripción o código..."
                                    autoFocus
                                />
                                {linkingState.suggestions.length > 0 && (
                                    <div className="absolute z-[2100] w-full mt-1 bg-white border rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                        {linkingState.suggestions.map((s, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                className="w-full text-left p-3 hover:bg-blue-50 border-b last:border-0 transition-colors"
                                                onClick={() => handleResolveFailed(s.code)}
                                            >
                                                <div className="font-bold text-gray-900 text-sm">{s.description}</div>
                                                <div className="text-xs text-gray-500">
                                                    COD: {s.code} {s.barcode ? `| BARRAS: ${s.barcode}` : ''}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <p className="mt-4 text-[10px] text-gray-400 italic">
                                Al seleccionar un producto, este se agregará al egreso con la cantidad del PDF y se eliminará de la lista de errores.
                            </p>
                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-100">
                            <button
                                onClick={() => setLinkingState(prev => ({ ...prev, isOpen: false }))}
                                className="w-full py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors shadow-sm"
                                disabled={linkingState.processing}
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

export default EgresoDetailsPage;
