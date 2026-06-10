import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'sonner';

const Scanner = lazy(() => import('./Scanner'));
const ReportModal = lazy(() => import('./ReportModal'));
const BranchCountList = lazy(() => import('./BranchCountList'));
const GuideModal = lazy(() => import('./GuideModal'));
const InteractiveTour = lazy(() => import('./InteractiveTour'));
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import FichajeModal from './FichajeModal';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useProductSync } from '../hooks/useProductSync';
import { HelpCircle } from 'lucide-react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';


const RemitoForm = () => {
    const { user } = useAuth();
    const { countMode, setCountMode } = useSettings();
    const [items, setItems] = useState([]);
    const [manualCode, setManualCode] = useState('');
    const [remitoNumber, setRemitoNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [isListening, setIsListening] = useState(false); // Voice Search State
    const [isProcessingScan, setIsProcessingScan] = useState(false); // Scanner Pause State
    const [isSubmittingFichaje, setIsSubmittingFichaje] = useState(false); // New Submitting State
    const [pendingSyncCount, setPendingSyncCount] = useState(0); // Offline Support
    const [isForcingUnexpected, setIsForcingUnexpected] = useState(false); // New state for adding items not in pre-remito list
    const isForcingUnexpectedRef = React.useRef(false);
    const [scanStatus, setScanStatus] = useState(null);

    // Pre-remito state
    const [selectedPreRemitos, setSelectedPreRemitos] = useState([]);
    const [preRemitoList, setPreRemitoList] = useState([]);
    const [expectedItems, setExpectedItems] = useState(null); // null = no pre-remito loaded
    const [preRemitoStatus, setPreRemitoStatus] = useState(''); // 'loading', 'found', 'not_found', 'error'

    // Manual Autocomplete State
    const [manualSuggestions, setManualSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Local DB Sync
    const { syncProducts, getProductByCode, getProductsByCode, searchProductsLocally, searchProductsFuzzy, isSyncing, lastSync } = useProductSync();
    const lockingRef = React.useRef(false); // Mutex for fichaje submission
    const selectedCountRef = React.useRef(null); // Ref to track current selectedCount without stale closures
    const selectionClearedRef = React.useRef(false); // Tracks if user explicitly cleared selection (prevents poll restore)
    const productCacheRef = React.useRef(new Map()); // Client-side product cache to avoid repeated API calls
    const fetchTimeoutRef = useRef(null);

    const isSyncingRef = React.useRef(false); // Mutex for offline sync

    // Función para refrescar datos con debounce (evita re-renders masivos constantes)
    const debouncedFetch = useCallback(() => {
        if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = setTimeout(() => {
            if (selectedCountRef.current?.id) {
                restoreSession(selectedCountRef.current.id, true);
            }
        }, 1500); // Refrescar realidad del servidor cada 1.5 segs después del último cambio
    }, []);

    useEffect(() => {
        syncProducts();
    }, []);

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


    // Report State
    const [reportConfig, setReportConfig] = useState({
        isOpen: false,
        data: null,
        title: ''
    });

    // Sync Badge Expansion State
    const [isSyncBadgeExpanded, setIsSyncBadgeExpanded] = useState(() => localStorage.getItem('isSyncBadgeExpanded') !== 'false');

    // Guide Modal State
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isTourOpen, setIsTourOpen] = useState(false);
    const [showHelpChoice, setShowHelpChoice] = useState(false);

    // --- OPTIMIZED DATA STRUCTURES ---
    // Optimized lookup for expected quantities using a Map (O(1) instead of O(n))
    const expectedMap = React.useMemo(() => {
        if (!expectedItems) return new Map();
        const map = new Map();
        expectedItems.forEach(item => {
            if (item.code) map.set(item.code, item.quantity);
        });
        return map;
    }, [expectedItems]);

    const getExpectedQty = useCallback((code) => {
        if (!expectedItems) return null;
        return expectedMap.get(code) ?? null;
    }, [expectedItems, expectedMap]);

    // Fast lookup for expected items by barcode
    const expectedBarcodeMap = React.useMemo(() => {
        if (!expectedItems) return new Map();
        const map = new Map();
        expectedItems.forEach(item => {
            if (item.barcode) {
                if (!map.has(item.barcode)) map.set(item.barcode, []);
                map.get(item.barcode).push(item);
            }
            if (item.code && item.code !== item.barcode) {
                if (!map.has(item.code)) map.set(item.code, []);
                map.get(item.code).push(item);
            }
        });
        return map;
    }, [expectedItems]);

    const expectedBarcodeMapRef = React.useRef(expectedBarcodeMap);
    useEffect(() => {
        expectedBarcodeMapRef.current = expectedBarcodeMap;
    }, [expectedBarcodeMap]);

    // --- HELPER FUNCTIONS ---
    const fetchItemsByOrders = async (orderNumbers) => {
        const validOrderNumbers = orderNumbers.filter(num => {
            if (!num) return false;
            const cleanNum = num.trim();
            if (cleanNum.startsWith('STOCK-')) return true;
            if (/^\d+$/.test(cleanNum)) return true;
            if (preRemitoList && preRemitoList.length > 0) {
                return preRemitoList.some(p => p.order_number === cleanNum);
            }
            return false;
        });

        if (validOrderNumbers.length === 0) {
            return [];
        }

        const results = await Promise.all(
            validOrderNumbers.map(num => api.get(`/api/pre-remitos/${num.trim()}`))
        );

        const mergedItemsMap = {};
        results.forEach(res => {
            const { items } = res.data;
            if (items && Array.isArray(items)) {
                items.forEach(item => {
                    const code = item.code;
                    if (mergedItemsMap[code]) {
                        mergedItemsMap[code].quantity += Number(item.quantity) || 0;
                    } else {
                        mergedItemsMap[code] = {
                            ...item,
                            quantity: Number(item.quantity) || 0
                        };
                    }
                });
            }
        });
        return Object.values(mergedItemsMap);
    };

    // Unified Search Logic
    const executeSearch = async (value) => {
        if (!value || value.length < 2) {
            setShowSuggestions(false);
            setManualSuggestions([]);
            return;
        }

        const queryNormalized = value.toLowerCase().trim();
        const tokens = queryNormalized.split(/\s+/).filter(Boolean);

        let localMatches = [];
        if (expectedItems) {
            // Token-based filtering for expected items
            localMatches = expectedItems.filter(item => {
                const desc = (item.description || '').toLowerCase();
                const code = (item.code || '').toLowerCase();
                const barcode = (item.barcode || '').toLowerCase();

                // Matches all tokens in some field
                return tokens.every(token =>
                    desc.includes(token) ||
                    code.includes(token) ||
                    barcode.includes(token)
                );
            }).map(item => ({ ...item, isExpected: true }));
        }

        // Try with local DB first
        try {
            const localResults = await searchProductsLocally(value);
            const apiResults = [];

            // Supplement with API if online and local results are few
            if (navigator.onLine && localResults.length < 5) {
                try {
                    const res = await api.get(`/api/products/search?q=${encodeURIComponent(value)}`);
                    apiResults.push(...res.data);
                } catch (e) { console.error("API Search fallback failed", e); }
            }

            // Merge results
            const combined = [...localResults.map(p => ({
                ...p,
                inDocument: expectedMap.has(p.code),
                isExpected: expectedMap.has(p.code)
            }))];

            apiResults.forEach(apiItem => {
                if (!combined.some(c => c.code === apiItem.code)) {
                    combined.push({
                        ...apiItem,
                        inDocument: expectedMap.has(apiItem.code),
                        isExpected: expectedMap.has(apiItem.code)
                    });
                }
            });

            setManualSuggestions(combined.slice(0, 15));
            setShowSuggestions(combined.length > 0);
        } catch (error) {
            console.error('Error searching products:', error);
            setManualSuggestions(localMatches.slice(0, 10));
            setShowSuggestions(localMatches.length > 0);
        }
    };

    // General Count State
    const [activeCounts, setActiveCounts] = useState([]);
    const [selectedCount, setSelectedCount] = useState(null);
    const [newCountName, setNewCountName] = useState('');
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');

    const [duplicateProducts, setDuplicateProducts] = useState([]);
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

    // Branch count list tab: 'scan' | 'list'
    const [countTab, setCountTab] = useState('scan');

    // Poll for active general counts
    useEffect(() => {
        let interval;
        const fetchActiveCounts = async () => {
            try {
                const res = await api.get('/api/general-counts/active');
                const counts = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
                setActiveCounts(counts);

                if (countMode === 'products') {
                    if (user && user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'branch_admin') {
                        // Find count for user's branch
                        const myCount = counts.find(c => c.sucursal_id == user.sucursal_id);
                        if (myCount) {
                            setSelectedCount(myCount);
                        } else {
                            setSelectedCount(null);
                        }
                    }
                }

                // Restore selected count from localStorage regardless of mode
                const savedSelectedId = localStorage.getItem('selectedCountId');
                const currentRef = selectedCountRef.current;

                if (savedSelectedId) {
                    const saved = counts.find(c => String(c.id) === String(savedSelectedId));
                    if (saved) {
                        selectionClearedRef.current = false;
                        setSelectedCount(saved);
                    } else if (currentRef?.id && String(currentRef.id) === String(savedSelectedId)) {
                        // Count was just created/selected and may not appear in this poll yet — keep it
                        // Preserve it in activeCounts so it stays visible
                        setActiveCounts(prev => {
                            if (prev.find(c => String(c.id) === String(currentRef.id))) return prev;
                            return [currentRef, ...counts];
                        });
                    } else {
                        // Count no longer active (was closed), clear storage
                        localStorage.removeItem('selectedCountId');
                        setSelectedCount(null);
                    }
                } else if (!selectionClearedRef.current && user?.active_count_id) {
                    // Fallback to backend persistence only if user did NOT explicitly clear selection
                    const saved = counts.find(c => String(c.id) === String(user.active_count_id));
                    if (saved) {
                        setSelectedCount(saved);
                        localStorage.setItem('selectedCountId', saved.id);
                    }
                } else if (!selectionClearedRef.current && currentRef) {
                    const current = counts.find(c => c.id === currentRef.id);
                    if (current) {
                        setSelectedCount(current);
                    }
                }
            } catch (error) {
                console.error('Error fetching active counts:', error);
            }
        };

        fetchActiveCounts();
        interval = setInterval(fetchActiveCounts, 10000); // Poll every 10 seconds

        return () => clearInterval(interval);
    }, [countMode, user]);

    // --- OFFLINE SUPPORT ---
    const checkPendingSync = () => {
        if (!selectedCount) {
            setPendingSyncCount(0);
            return;
        }
        const pendingKey = `pending_inventory_scans_${selectedCount.id}`;
        const queue = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        setPendingSyncCount(queue.length);
    };

    useEffect(() => {
        checkPendingSync();
    }, [selectedCount]);

    const syncOfflineData = async () => {
        if (!selectedCount || isSyncingRef.current) return;
        
        const pendingKey = `pending_inventory_scans_${selectedCount.id}`;
        const queue = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        if (queue.length === 0) return;

        isSyncingRef.current = true;
        try {
            toast.info('Sincronizando conteos offline...', { duration: 2000, id: 'offline-sync' });
            
            // Move queue to a temporary variable and CLEAR it from localStorage immediately
            // This prevents concurrent calls from processing the same data.
            const itemsToSync = [...queue];
            localStorage.removeItem(pendingKey);
            setPendingSyncCount(0);

            // Separar incrementales de totales
            const incrementals = itemsToSync.filter(q => q.type === 'incremental').map(q => ({ code: q.code, quantity: q.quantity }));
            const totals = itemsToSync.filter(q => q.type === 'total').map(q => ({ code: q.code, quantity: q.quantity }));

            if (incrementals.length > 0) {
                await api.post('/api/inventory/scan-incremental', {
                    orderNumber: selectedCount.id,
                    items: incrementals
                });
            }

            if (totals.length > 0) {
                await api.post('/api/inventory/scan', {
                    orderNumber: selectedCount.id,
                    items: totals
                });
            }

            toast.success('Sincronización offline completada', { id: 'offline-sync' });
        } catch (error) {
            console.error('Error sincronizando scans offline:', error);
            if (error.response?.status === 403) {
                const serverMsg = error.response.data?.message || 'Algunos de tus escaneos offline fueron rechazados por reglas de re-control.';
                triggerModal('Sincronización Rechazada', serverMsg, 'error');
                // Al ser 403, descartamos la cola que causó el error para evitar bucles infinitos de intentos fallidos
                restoreSession(selectedCount.id, true);
            } else {
                toast.error('Error al sincronizar algunos datos offline. Se reintentará luego.', { id: 'offline-sync' });
                // En caso de otros errores (red, servidor temporal), devolvemos a la cola
                const currentQueue = JSON.parse(localStorage.getItem(pendingKey) || '[]');
                localStorage.setItem(pendingKey, JSON.stringify([...queue, ...currentQueue]));
            }
            checkPendingSync();
        } finally {
            isSyncingRef.current = false;
        }
    };

    useEffect(() => {
        const handleOnline = () => {
            toast.success('Conexión restaurada. Sincronizando...', { duration: 3000 });
            syncOfflineData();
        };
        const handleOffline = () => {
            toast.error('Sin conexión a internet. Modo Offline activado.', { duration: 5000 });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Intentar sincronizar al montar si hay pendientes
        if (pendingSyncCount > 0) {
            syncOfflineData();
        }

        // Intervalo de reintento controlado cada 15 segundos si hay pendientes
        const intervalId = setInterval(() => {
            if (pendingSyncCount > 0) {
                syncOfflineData();
            }
        }, 15000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(intervalId);
        };
    }, [selectedCount, pendingSyncCount]);
    // ----------------------

    useEffect(() => {
        if (countMode === 'products') {
            if (selectedCount) {
                setRemitoNumber(selectedCount.id);
                setExpectedItems(null);
                localStorage.setItem('selectedCountId', selectedCount.id);
            } else if (countMode === 'products') {
                setRemitoNumber('');
            }
        }
    }, [selectedCount, countMode]);

    // Restore Session Logic
    const [lastRestoredId, setLastRestoredId] = useState(null);

    const restoreSession = async (countId, isSilent = false) => {
        try {
            const res = await api.get(`/api/inventory/${countId}`);
            // Check for 'myItems' (Rich list) or fallback to 'myScans' (Legacy map)
            // Backend now provides 'myItems'.
            const { myItems, myScans } = res.data;

            let restoredItems = [];

            if (myItems && Array.isArray(myItems)) {
                restoredItems = myItems.map(i => ({
                    code: i.code,
                    name: i.name || i.description || 'Producto Desconocido',
                    barcode: i.barcode,
                    quantity: i.quantity,
                    validationError: null
                }));
            } else if (myScans) {
                // Fallback if backend not updated yet (should not happen if deployed together)
                restoredItems = Object.entries(myScans).map(([code, quantity]) => ({
                    code,
                    name: 'Cargando...', // We don't have descriptions here easily
                    quantity,
                    validationError: null
                }));
            }

            if (restoredItems.length > 0) {
                // Combinar con escaneos pendientes localmente (Offline)
                const pendingKey = `pending_inventory_scans_${countId}`;
                const queue = JSON.parse(localStorage.getItem(pendingKey) || '[]');
                
                let mergedItems = [...restoredItems];
                if (queue.length > 0) {
                    queue.forEach(q => {
                        const idx = mergedItems.findIndex(i => i.code === q.code);
                        if (idx > -1) {
                            mergedItems[idx].quantity = Number(mergedItems[idx].quantity || 0) + Number(q.quantity);
                        } else {
                            mergedItems.push({
                                code: q.code,
                                name: 'Producto (Pendiente de subir)',
                                quantity: q.quantity,
                                isOfflinePending: true
                            });
                        }
                    });
                }

                setItems(mergedItems);
                if (!isSilent) {
                    triggerModal('Sesión Restaurada', `Se han recuperado ${mergedItems.length} productos (incluyendo escaneos locales).`, 'success');
                }
            }
        } catch (error) {
            console.error('Error restoring session:', error);
            if (error.response?.status === 404) {
                // If count not found/deleted, clear selection to avoid further errors
                setSelectedCount(null);
                localStorage.removeItem('selectedCountId');
                triggerModal('Sesión No Encontrada', 'El conteo fue cerrado o eliminado. Se ha limpiado la selección actual.', 'warning');
            }
        }
    };

    // Keep selectedCountRef in sync with selectedCount state
    useEffect(() => {
        selectedCountRef.current = selectedCount;
        // Reset tab when count changes
        if (!selectedCount?.sucursal_id) setCountTab('scan');
    }, [selectedCount]);

    useEffect(() => {
        if (selectedCount?.id && selectedCount.id !== lastRestoredId) {
            setLastRestoredId(selectedCount.id);
            // Only restore if local items are empty to avoid overwriting current work 
            // in case of transient network issues or race conditions.
            if (items.length === 0) {
                restoreSession(selectedCount.id);
            }
        }
    }, [selectedCount?.id]); // Only depend on ID change

    // Supabase Realtime Subscription
    useEffect(() => {
        if (!selectedCount?.id) return;

        const countId = selectedCount.id;

        const channelId = `inventory_scans_${countId}-${Math.random().toString(36).substring(2, 9)}`;
        const channel = supabase.channel(channelId)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'inventory_scans',
                filter: `order_number=eq.${countId}`
            }, (payload) => {
                console.log('⚡ Cambio detectado en inventory_scans por Realtime:', payload);
                debouncedFetch();
            })
            .on('presence', { event: 'sync' }, () => {
            })
            .subscribe(async (status, err) => {
                if (err) {
                    console.error('[REALTIME] Error en la suscripción de RemitoForm:', err);
                } else {
                    console.log(`[REALTIME] RemitoForm suscrito con estado: ${status}`);
                }
                if (status === 'SUBSCRIBED') {
                    await channel.track({ device: navigator.userAgent, user: user?.username });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedCount?.id, debouncedFetch, user?.username]);

    // Auto-load expected items (pre-remitos) when a count is active and items are null
    useEffect(() => {
        const autoLoadExpected = async () => {
            if (selectedCount && countMode === 'pre_remito' && !expectedItems && preRemitoStatus !== 'loading') {
                // Determine if this count name looks like order numbers (Remito Mode)
                // In this app, counts created from remitos have the order numbers as name
                const cleanName = selectedCount.name.replace(/^re-control:\s*/i, '');
                const orderNumbers = cleanName.split(',').map(n => n.trim());
                
                const validOrderNumbers = orderNumbers.filter(num => {
                    if (!num) return false;
                    const cleanNum = num.trim();
                    if (cleanNum.startsWith('STOCK-')) return true;
                    if (/^\d+$/.test(cleanNum)) return true;
                    if (preRemitoList && preRemitoList.length > 0) {
                        return preRemitoList.some(p => p.order_number === cleanNum);
                    }
                    return false;
                });

                if (validOrderNumbers.length > 0) {
                    try {
                        setPreRemitoStatus('loading');
                        const mergedItems = await fetchItemsByOrders(validOrderNumbers);
                        
                        let finalItems = mergedItems;
                        if (selectedCount.product_codes && Array.isArray(selectedCount.product_codes)) {
                            finalItems = mergedItems.filter(item => selectedCount.product_codes.includes(item.code));
                        }
                        setExpectedItems(finalItems);
                        setPreRemitoStatus('found');
                        setRemitoNumber(validOrderNumbers.join(', '));
                    } catch (e) {
                        console.error('Failed to auto-load expected items:', e);
                        setPreRemitoStatus('error');
                    }
                }
            }
        };
        autoLoadExpected();
    }, [selectedCount, countMode, expectedItems, preRemitoStatus, preRemitoList]);

    const handleVoiceSearch = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const { available } = await SpeechRecognition.available();
                if (!available) {
                    triggerModal('Error', 'El reconocimiento de voz no está disponible en este dispositivo.', 'error');
                    return;
                }

                const { speechRecognition } = await SpeechRecognition.checkPermissions();
                if (speechRecognition !== 'granted') {
                    const { speechRecognition: newPermission } = await SpeechRecognition.requestPermissions();
                    if (newPermission !== 'granted') {
                        triggerModal('Permiso Denegado', 'Se requiere permiso de micrófono para la búsqueda por voz.', 'warning');
                        return;
                    }
                }

                setIsListening(true);

                SpeechRecognition.start({
                    language: 'es-AR',
                    maxResults: 10,
                    prompt: 'Diga el código o nombre del producto',
                    partialResults: false,
                    popup: true
                }).then(async result => {
                    if (result && result.matches && result.matches.length > 0) {
                        // Expandir candidatos: también probar versión sin espacios (ej: "ter suave" → "tersuave")
                        const rawCandidates = [];
                        for (const match of result.matches) {
                            rawCandidates.push(match);
                            const compressed = match.replace(/\s+/g, '');
                            if (compressed !== match) rawCandidates.push(compressed);
                        }

                        const trySearch = async (term) => {
                            if (!term || term.trim().length < 2) return false;
                            try {
                                const localResults = await searchProductsLocally(term);
                                if (localResults && localResults.length > 0) {
                                    setManualCode(term);
                                    executeSearch(term);
                                    return true;
                                }
                                if (navigator.onLine) {
                                    const res = await api.get(`/api/products/search?q=${encodeURIComponent(term)}`);
                                    if (res.data && res.data.length > 0) {
                                        setManualCode(term);
                                        executeSearch(term);
                                        return true;
                                    }
                                }
                            } catch (e) { /* probar siguiente */ }
                            return false;
                        };

                        // Paso 1: búsqueda exacta con todos los candidatos
                        for (const candidate of rawCandidates) {
                            if (await trySearch(candidate)) return;
                        }

                        // Paso 2: búsqueda fuzzy fonética con el primer candidato
                        const firstMatch = result.matches[0];
                        if (firstMatch && firstMatch.trim().length >= 2) {
                            try {
                                const fuzzyResults = await searchProductsFuzzy(firstMatch);
                                if (fuzzyResults && fuzzyResults.length > 0) {
                                    setManualCode(firstMatch);
                                    executeSearch(firstMatch);
                                    return;
                                }
                            } catch (e) { /* continuar */ }
                        }

                        // Paso 3: probar cada palabra individual del primer candidato
                        if (firstMatch) {
                            const words = firstMatch.trim().split(/\s+/).filter(w => w.length >= 3);
                            for (const word of words) {
                                if (await trySearch(word)) return;
                            }
                        }

                        // Sin resultados: usar primer candidato de todas formas
                        setManualCode(firstMatch);
                        executeSearch(firstMatch);
                    }
                }).catch(error => {
                    console.error('Native speech start error:', error);
                    const errorDetails = error.message || String(error);

                    if (errorDetails.includes('not implemented')) {
                        triggerModal('Error: Plugin no vinculado', 'El plugin nativo no fue detectado en esta compilación.', 'error');
                    } else if (!errorDetails.includes('No match')) {
                        triggerModal('Error de Reconocimiento', `Detalle técnico: ${errorDetails}`, 'error');
                    }
                }).finally(() => {
                    setIsListening(false);
                });

            } catch (error) {
                console.error('Core Native speech error:', error);
                setIsListening(false);
            }
            return;
        }

        // Web Fallback
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            triggerModal('Error', 'Tu navegador no soporta búsqueda por voz.', 'error');
            return;
        }

        const SpeechRecognitionWeb = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognitionWeb();

        recognition.lang = 'es-AR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 5;

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = async (event) => {
            setIsListening(false);
            const alternatives = [];
            for (let i = 0; i < event.results[0].length; i++) {
                alternatives.push(event.results[0][i].transcript);
            }
            const first = alternatives[0];

            const trySearch = async (term) => {
                if (!term || term.trim().length < 2) return false;
                try {
                    const localResults = await searchProductsLocally(term);
                    if (localResults && localResults.length > 0) {
                        setManualCode(term);
                        executeSearch(term);
                        return true;
                    }
                } catch (e) { /* continuar */ }
                return false;
            };

            // Paso 1: candidatos exactos
            for (const alt of alternatives) {
                if (await trySearch(alt)) return;
                const compressed = alt.replace(/\s+/g, '');
                if (compressed !== alt && await trySearch(compressed)) return;
            }

            // Paso 2: fuzzy fonético
            try {
                const fuzzyResults = await searchProductsFuzzy(first);
                if (fuzzyResults && fuzzyResults.length > 0) {
                    setManualCode(first);
                    executeSearch(first);
                    return;
                }
            } catch (e) { /* continuar */ }

            // Paso 3: palabras individuales
            const words = first.trim().split(/\s+/).filter(w => w.length >= 3);
            for (const word of words) {
                if (await trySearch(word)) return;
            }

            // Sin resultados: usar transcript de todas formas
            setManualCode(first);
            executeSearch(first);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
    };


    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onConfirm: null,
        confirmText: null
    });

    const [isLoadingXml, setIsLoadingXml] = useState(false);
    const [xmlSelectedBranch, setXmlSelectedBranch] = useState('');

    const [showConfirmCreate, setShowConfirmCreate] = useState(false);
    const [isCargarConteoCollapsed, setIsCargarConteoCollapsed] = useState(false);

    // Clarification State
    const [showClarificationModal, setShowClarificationModal] = useState(false);
    const [clarificationText, setClarificationText] = useState('');
    const [missingReasons, setMissingReasons] = useState({}); // { code: 'damaged' | 'no_stock' }
    const [missingExpanded, setMissingExpanded] = useState(false);
    const [pendingDiscrepancies, setPendingDiscrepancies] = useState(null);

    // Fichaje Modal State
    const [fichajeState, setFichajeState] = useState({
        isOpen: false,
        product: null,
        existingQuantity: 0,
        expectedQuantity: null
    });

    const triggerModal = (title, message, type = 'info', onConfirm = null, confirmText = null) => {
        setModalConfig({
            isOpen: true,
            title,
            message,
            type,
            onConfirm,
            confirmText
        });
    };

    const closeModal = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
    };

    // Refs to keep track of latest state without triggering re-renders in callbacks
    const itemsRef = React.useRef(items);
    const expectedItemsRef = React.useRef(expectedItems);

    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    useEffect(() => {
        expectedItemsRef.current = expectedItems;
    }, [expectedItems]);

    // Fetch pre-remitos list on mount and branches
    useEffect(() => {
        const fetchPreRemitos = async () => {
            try {
                const response = await api.get('/api/pre-remitos');
                if (Array.isArray(response.data)) {
                    setPreRemitoList(response.data);
                } else {
                    console.error('Invalid pre-remitos data format:', response.data);
                    setPreRemitoList([]);
                }
            } catch (error) {
                console.error('Error fetching pre-remitos list:', error);
                setPreRemitoList([]);
            }
        };

        const fetchBranches = async () => {
            try {
                const res = await api.get('/api/sucursales');
                setBranches(res.data);
                // Auto-assign branch for branch_admin users
                if (user?.role === 'branch_admin' && user?.sucursal_id) {
                    const myBranch = res.data.find(b => b.id === user.sucursal_id);
                    if (myBranch) {
                        setXmlSelectedBranch(myBranch.name);
                    }
                }
            } catch (error) {
                console.error('Error fetching branches:', error);
            }
        };

        fetchPreRemitos();
        fetchBranches();
    }, []);


    const handleResumeActiveCount = async (count, orderNumbers) => {
        try {
            const cleanOrderNumbers = orderNumbers.map(num => num.replace(/^re-control:\s*/i, ''));
            const validOrderNumbers = cleanOrderNumbers.filter(num => {
                if (!num) return false;
                const cleanNum = num.trim();
                if (cleanNum.startsWith('STOCK-')) return true;
                if (/^\d+$/.test(cleanNum)) return true;
                if (preRemitoList && preRemitoList.length > 0) {
                    return preRemitoList.some(p => p.order_number === cleanNum);
                }
                return false;
            });

            if (validOrderNumbers.length > 0) {
                setPreRemitoStatus('loading');
                const mergedItems = await fetchItemsByOrders(validOrderNumbers);
                
                let finalItems = mergedItems;
                if (count.product_codes && Array.isArray(count.product_codes)) {
                    finalItems = mergedItems.filter(item => count.product_codes.includes(item.code));
                }
                setExpectedItems(finalItems);
                setPreRemitoStatus('found');
                // Auto-set remito number from order numbers when resuming
                setRemitoNumber(validOrderNumbers.join(', '));
            } else {
                setExpectedItems(null);
                setPreRemitoStatus('');
                setRemitoNumber('');
            }

            // Set the selected count to trigger the display of the active count
            selectionClearedRef.current = false;
            setSelectedCount(count);
            localStorage.setItem('selectedCountId', count.id);

            // Sync to backend for cross-device persistence
            try {
                await api.put('/api/auth/active-count', { countId: count.id });
            } catch (e) {
                console.error('Error syncing resumed count to backend:', e);
            }
        } catch (error) {
            console.error('Error resuming active count:', error);
            triggerModal('Error', 'No se pudo cargar el conteo activo. Intente nuevamente.', 'error');
            setPreRemitoStatus('not_found');
            setExpectedItems(null);
        }
    };

    const handleLoadPreRemito = async () => {
        if (selectedPreRemitos.length === 0) return;
        setPreRemitoStatus('loading');
        try {
            const mergedItems = await fetchItemsByOrders(selectedPreRemitos);
            setExpectedItems(mergedItems);
            setPreRemitoStatus('found');
            setRemitoNumber(selectedPreRemitos.join(', '));
        } catch (error) {
            console.error('Error loading pre-remitos:', error);
            setPreRemitoStatus('not_found');
            setExpectedItems(null);
        }
    };

    const handleDeletePreRemito = async (id, orderNumber) => {
        if (!window.confirm(`¿Está seguro que desea eliminar permanentemente el conteo ${orderNumber}?`)) return;

        try {
            await api.delete(`/api/pre-remitos/${id}`);
            triggerModal('Éxito', 'Conteo eliminado correctamente.', 'success');

            // Remove from selected list if it's there
            setSelectedPreRemitos(prev => prev.filter(num => num !== orderNumber));

            // Refresh the list
            const response = await api.get('/api/pre-remitos');
            if (Array.isArray(response.data)) {
                setPreRemitoList(response.data);
            }
        } catch (error) {
            console.error('Error deleting pre-remito:', error);
            triggerModal('Error', 'No se pudo eliminar el conteo. Verifique sus permisos.', 'error');
        }
    };

    const handleXmlUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        if (!xmlSelectedBranch) {
            triggerModal('Atención', 'Debe seleccionar una sucursal antes de importar el stock.', 'warning');
            e.target.value = '';
            return;
        }

        setIsLoadingXml(true);
        let lastOrderNumber = null;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const formData = new FormData();
                formData.append('file', file);
                if (xmlSelectedBranch) {
                    formData.append('sucursal', xmlSelectedBranch);
                }

                const response = await api.post('/api/pre-remitos/import-xml', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                lastOrderNumber = response.data.orderNumber;
            }

            if (files.length > 1) {
                triggerModal('Éxito', `${files.length} archivos importados correctamente.`, 'success');
            } else if (lastOrderNumber) {
                triggerModal('Éxito', `Stock importado correctamente. Conteo: ${lastOrderNumber}`, 'success');
            }

            // Refresh pre-remitos list
            const refreshRes = await api.get('/api/pre-remitos');
            if (Array.isArray(refreshRes.data)) {
                setPreRemitoList(refreshRes.data);
            }

            // Auto-select and load the LAST pre-remito if only one was uploaded, 
            // otherwise just let the user pick from the updated list.
            if (files.length === 1 && lastOrderNumber) {
                setSelectedPreRemitos([lastOrderNumber]);
                setTimeout(async () => {
                    setPreRemitoStatus('loading');
                    try {
                        const detailRes = await api.get(`/api/pre-remitos/${lastOrderNumber}`);
                        setExpectedItems(detailRes.data.items);
                        setPreRemitoStatus('found');
                        setRemitoNumber(lastOrderNumber);
                    } catch (err) {
                        console.error('Error auto-loading new XML remito:', err);
                    }
                }, 500);
            }

        } catch (error) {
            console.error('Error uploading XML:', error);
            triggerModal('Error', 'Error al importar el archivo de stock.', 'error');
        } finally {
            setIsLoadingXml(false);
            // Reset input
            e.target.value = '';
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setPreRemitoStatus('loading');
        try {
            const response = await api.post('/api/remitos/upload-pdf', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            // Mapped items from PDF upload (which might not have barcodes yet, unless backend updated)
            // But we ensure structure is consistent
            const mappedItems = response.data.items.map(item => ({
                code: item.code,
                barcode: item.barcode || item.code, // Fallback if no barcode
                quantity: item.quantity,
                description: item.description
            }));

            setExpectedItems(mappedItems);
            setPreRemitoStatus('found');
        } catch (error) {
            console.error('Error uploading PDF:', error);
            triggerModal('Error', 'Error al procesar el PDF', 'error');
        }
    };

    const handleRemoveItem = (code) => {
        setItems(items.filter(item => item.code !== code));
        // Sincronizar eliminación con el servidor (cantidad 0)
        syncTotalToInventory(code, 0);
    };

    const handleQuantityChange = (code, newQuantity) => {
        const qty = parseFloat(newQuantity);
        if (isNaN(qty) || qty <= 0) return;

        setItems(prevItems => {
            const item = prevItems.find(i => i.code === code);
            if (!item) return prevItems;
            
            const updatedItem = { ...item, quantity: qty, validationError: null };
            // Move updated item to the beginning of the list (Native Latest First)
            return [updatedItem, ...prevItems.filter(i => i.code !== code)];
        });

        // Sincronizar nueva cantidad absoluta con el servidor
        syncTotalToInventory(code, qty);
    };

    const handleSubmitRemito = async () => {
        // Calculate Discrepancies
        let discrepancies = { missing: [], extra: [] };

        if (expectedItems) {
            // Find Missing Items (Expected but not in scanned items or quantity mismatch)
            expectedItems.forEach(expected => {
                const scanned = items.find(i => i.code === expected.code);
                const scannedQty = scanned ? scanned.quantity : 0;

                if (scannedQty < expected.quantity) {
                    discrepancies.missing.push({
                        code: expected.code,
                        description: expected.description,
                        expected: expected.quantity,
                        scanned: scannedQty
                    });
                }
            });

            // Find Extra Items (Scanned but not in expected items OR quantity exceeds expected)
            items.forEach(scanned => {
                const expectedQty = expectedMap.get(scanned.code);

                if (expectedQty === undefined) {
                    // Completely unexpected item
                    discrepancies.extra.push({
                        code: scanned.code,
                        description: scanned.name,
                        expected: 0, // Explicitly set 0 for reports
                        scanned: scanned.quantity
                    });
                } else if (scanned.quantity > expectedQty) {
                    // Expected item but with excess quantity
                    discrepancies.extra.push({
                        code: scanned.code,
                        description: scanned.name,
                        expected: expectedQty,
                        scanned: scanned.quantity
                    });
                }
            });
        }

        // Check if there are discrepancies
        if (discrepancies.missing.length > 0 || discrepancies.extra.length > 0) {
            setPendingDiscrepancies(discrepancies);
            setShowClarificationModal(true);
            return;
        }

        // No discrepancies, submit directly
        await submitRemitoData(discrepancies, null);
    };

    const handleConfirmClarification = async () => {
        // Validation: Ensure all missing items have a reason
        if (pendingDiscrepancies?.missing?.length > 0) {
            const missingCodes = pendingDiscrepancies.missing.map(i => i.code);
            const allHaveReason = missingCodes.every(code => missingReasons[code]);

            if (!allHaveReason) {
                triggerModal('Atención', 'Debe seleccionar un motivo para cada producto faltante.', 'warning');
                return;
            }
        }

        // Enrich discrepancies with reasons
        const enrichedDiscrepancies = {
            ...pendingDiscrepancies,
            missing: pendingDiscrepancies.missing.map(item => ({
                ...item,
                reason: missingReasons[item.code]
            }))
        };

        await submitRemitoData(enrichedDiscrepancies, clarificationText);
        setShowClarificationModal(false);
        setClarificationText('');
        setMissingReasons({});
        setMissingExpanded(false);
        setPendingDiscrepancies(null);
    };

    const submitRemitoData = async (discrepancies, clarification) => {
        try {
            const response = await api.post('/api/remitos', {
                remitoNumber,
                items,
                discrepancies,
                clarification
            });

            console.log('Remito submitted:', response.data);
            triggerModal('Éxito', 'Conteo guardado con éxito', 'success');

            // Reset form
            setItems([]);
            setRemitoNumber('');
            setExpectedItems(null);
            setSelectedPreRemitos([]);
            setPreRemitoStatus('');
        } catch (error) {
            console.error('Error submitting remito:', error);
            triggerModal('Error', 'Error al guardar el remito', 'error');
        }
    };

    // Sound effect helper
    const playBeep = () => {
        try {
            const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbqWEyM2CfutSqYzM0YZ661KxjMzRhnbjUrGMzNGGct9SsYzM0YZu21KxjMzRhmrXUrGMzNGGYtNSsYzM0YZez1KxjMzRhlrLUrGMzNGGVsdSsYzM0YZSw1KxjMzRhk6/UrGMzNGGTrtSsYzM0YZKtdGEzNGGTrHRhMzRhkqt0YTM0YZKqdGEzNGGSqnRhMzRhkql0YTM0YZKpdGEzNGGSqHRhMzRhkqd0YTM0YZKmdGEzNGGSqHRhMzRhkqZ0YTM0YZKldGEzNGGSpHRhMzRhkqR0YTM0YZKjdGEzNGGSo3RhMzRhkqJ0YTM0YZKidGEzNGGSoXRhMzRhkqF0YTM0YZKgdGEzNGGSoHRhMzRhkp90YTM0YZKfdGEzNGGSnXRhMzRhkp10YTM0YZKcdGEzNGGSm3RhMzRhkpt0YTM0YZKadGEzNGGSmXRhMzRhkpl0YTM0YZKYdGEzNGGSmHRhMzRhkpd0YTM0YZKWdGEzNGGSlXRhMzRhkpV0YTM0YZKUdGEzNGGSlHRhMzRhkpN0YTM0YZKTdGEzNGGSkXRhMzRhkpJ0YTM0YZKRdGEzNGGSkXRhMzRhkpB0YTM0YZKQdGEzNGGSkHRhMzRhk490YTM0YZOPdGEzNGGTj3RhMzRhk450YTM0YZOOdGEzNGGTjnRhMzRhk410YTM0YZONdGEzNGGTjXRhMzRhk4x0YTM0YZOMdGEzNGGTjHRhMzRhk4t0YTM0YZOLdGEzNGGTi3RhMzRhk4p0YTM0YZOKdGEzNGGTinRhMzRhk4l0YTM0YZOJdGEzNGGTiXRhMzRhk4h0YTM0YZOIdGEzNGGTiHRhMzRhk4d0YTM0YZOHdGEzNGGTg3RhMzRh");
            audio.volume = 0.5;
            audio.play().catch(e => console.warn("Audio play failed", e));
        } catch (e) {
            console.warn("Audio init failed", e);
        }
    };

    // Persistent product cache (localStorage) — allows offline lookup of previously scanned products
    // Per-key storage (O(1) r/w) instead of single blob (O(n))
    const LS_PRODUCT_CACHE_PREFIX = 'pbc_';
    const saveProductToLocalStorage = (code, productData) => {
        try {
            localStorage.setItem(LS_PRODUCT_CACHE_PREFIX + code, JSON.stringify(productData));
        } catch (e) { }
    };
    const getProductFromLocalStorage = (code) => {
        try {
            const raw = localStorage.getItem(LS_PRODUCT_CACHE_PREFIX + code);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    };

    // Open the fichaje modal for a given product (component-level so JSX can call it)
    const openFichajeModal = (product, expQty) => {
        const existingItem = itemsRef.current.find(i => i.code === product.code);
        const currentQty = existingItem ? existingItem.quantity : 0;

        playBeep();

        setFichajeState({
            isOpen: true,
            product: product,
            existingQuantity: currentQty,
            expectedQuantity: expQty
        });
    };

    // Handle barcode scan (from camera or physical scanner)
    const handleScan = React.useCallback(async (rawCode) => {
        const inputCode = rawCode.trim(); // Trim whitespace/newlines
        // setIsScanning(false); // REMOVED: Keep camera open after scan

        if (!selectedCountRef.current) {
            triggerModal('Atención', 'Debe seleccionar o iniciar un conteo antes de escanear productos.', 'warning');
            return;
        }

        const currentItems = itemsRef.current;
        const currentExpectedItems = expectedItemsRef.current;

        // 1. Resolve Product Details (from Expected or API)
        let resolvedProducts = [];
        let expectedQty = null;

        // Check in expected items first
        if (currentExpectedItems) {
            // Try to find by barcode OR code using optimized Map
            const matchedExpectedItems = expectedBarcodeMapRef.current.get(inputCode) || [];

            if (matchedExpectedItems.length === 0) {
                // If force adding, don't block
                if (isForcingUnexpectedRef.current) {
                    isForcingUnexpectedRef.current = false; // Reset Ref
                    setIsForcingUnexpected(false); // Reset State for UI
                    // Fall through to general lookup below
                } else {
                    // STRICT MODE: Instead of blocking, ask for confirmation
                    triggerModal(
                        'Producto no en conteo',
                        `El producto "${inputCode}" no pertenece al conteo cargado. ¿Desea agregarlo de todas formas como un item extra?`,
                        'warning',
                        () => {
                            isForcingUnexpectedRef.current = true;
                            setIsForcingUnexpected(true);
                            closeModal();
                            // Re-ejecutar el scan ahora que tenemos el permiso
                            setTimeout(() => handleScan(inputCode), 100);
                        },
                        'Agregar de todas formas'
                    );
                    return;
                }
            } else if (matchedExpectedItems.length === 1) {
                const expectedItem = matchedExpectedItems[0];
                resolvedProducts = [{
                    code: expectedItem.code,
                    name: expectedItem.description,
                    description: expectedItem.description,
                    barcode: expectedItem.barcode,
                    barcode_secondary: expectedItem.barcode_secondary || '',
                    brand: expectedItem.brand,
                    primary_unit: expectedItem.primary_unit,
                    secondary_unit: expectedItem.secondary_unit,
                    conversion_factor: expectedItem.conversion_factor,
                    conversion_type: expectedItem.conversion_type
                }];
                expectedQty = expectedItem.quantity;
            } else {
                // Multiple local matches
                resolvedProducts = matchedExpectedItems.map(ei => ({
                    code: ei.code,
                    name: ei.description,
                    description: ei.description,
                    barcode: ei.barcode,
                    barcode_secondary: ei.barcode_secondary || '',
                    brand: ei.brand,
                    primary_unit: ei.primary_unit,
                    secondary_unit: ei.secondary_unit,
                    conversion_factor: ei.conversion_factor,
                    conversion_type: ei.conversion_type
                }));
            }
        }

        if (resolvedProducts.length === 1) {
            openFichajeModal(resolvedProducts[0], expectedQty);
        } else if (resolvedProducts.length > 1) {
            setDuplicateProducts(resolvedProducts);
            setIsDuplicateModalOpen(true);
        } else {
            // Not in expected list (or no expected list). Check in-memory cache first, then fetch from API.
            const cached = productCacheRef.current.get(inputCode);
            if (cached) {
                if (Array.isArray(cached)) {
                    setDuplicateProducts(cached);
                    setIsDuplicateModalOpen(true);
                } else {
                    openFichajeModal(cached, null);
                }
                return;
            }

            // Offline: check persistent localStorage cache before failing
            if (!navigator.onLine) {
                const localCached = getProductFromLocalStorage(inputCode);
                if (localCached) {
                    productCacheRef.current.set(inputCode, localCached); // warm in-memory cache too
                    if (Array.isArray(localCached)) {
                        setDuplicateProducts(localCached);
                        setIsDuplicateModalOpen(true);
                    } else {
                        openFichajeModal(localCached, null);
                    }
                } else {
                    triggerModal('Sin conexión', 'Este producto no fue escaneado previamente. Conectate a internet para buscarlo.', 'warning');
                }
                return;
            }

            setIsProcessingScan(true);
            try {
                // 1. Try Local DB first (much faster + offline)
                const localProducts = await getProductsByCode(inputCode);

                if (localProducts && localProducts.length > 0) {
                    if (localProducts.length === 1) {
                        const localProduct = localProducts[0];
                        const product = {
                            code: localProduct.code || inputCode,
                            name: localProduct.description || 'Producto Desconocido',
                            description: localProduct.description,
                            barcode: localProduct.barcode || inputCode,
                            barcode_secondary: localProduct.barcode_secondary || '',
                            brand: localProduct.brand,
                            primary_unit: localProduct.primary_unit,
                            secondary_unit: localProduct.secondary_unit,
                            conversion_factor: localProduct.conversion_factor,
                            conversion_type: localProduct.conversion_type
                        };
                        productCacheRef.current.set(inputCode, product);
                        saveProductToLocalStorage(inputCode, product);
                        openFichajeModal(product, null);
                    } else {
                        const duplicates = localProducts.map(lp => ({
                            code: lp.code || inputCode,
                            name: lp.description || 'Producto Desconocido',
                            description: lp.description,
                            barcode: lp.barcode || inputCode,
                            barcode_secondary: lp.barcode_secondary || '',
                            brand: lp.brand,
                            primary_unit: lp.primary_unit,
                            secondary_unit: lp.secondary_unit,
                            conversion_factor: lp.conversion_factor,
                            conversion_type: lp.conversion_type
                        }));
                        productCacheRef.current.set(inputCode, duplicates);
                        saveProductToLocalStorage(inputCode, duplicates);
                        setDuplicateProducts(duplicates);
                        setIsDuplicateModalOpen(true);
                    }
                    setIsProcessingScan(false);
                    return;
                }

                // 2. Fallback to API if not found or online
                if (!navigator.onLine) {
                    triggerModal('Sin conexión', 'Este producto no está en el catálogo local. Conéctate para buscarlo.', 'warning');
                    setIsProcessingScan(false);
                    return;
                }

                const response = await api.get(`/api/products/${inputCode}`);
                const data = response.data;

                if (Array.isArray(data)) {
                    if (data.length === 1) {
                        const productData = data[0];
                        const product = {
                            code: productData.code || inputCode,
                            name: productData.description || 'Producto Desconocido',
                            description: productData.description,
                            barcode: inputCode,
                            barcode_secondary: productData.barcode_secondary || '',
                            brand: productData.brand,
                            primary_unit: productData.primary_unit,
                            secondary_unit: productData.secondary_unit,
                            conversion_factor: productData.conversion_factor,
                            conversion_type: productData.conversion_type
                        };
                        productCacheRef.current.set(inputCode, product);
                        saveProductToLocalStorage(inputCode, product);
                        openFichajeModal(product, null);
                    } else if (data.length > 1) {
                        const duplicates = data.map(pd => ({
                            code: pd.code || inputCode,
                            name: pd.description || 'Producto Desconocido',
                            description: pd.description,
                            barcode: inputCode,
                            barcode_secondary: pd.barcode_secondary || '',
                            brand: pd.brand,
                            primary_unit: pd.primary_unit,
                            secondary_unit: pd.secondary_unit,
                            conversion_factor: pd.conversion_factor,
                            conversion_type: pd.conversion_type
                        }));
                        productCacheRef.current.set(inputCode, duplicates);
                        saveProductToLocalStorage(inputCode, duplicates);
                        setDuplicateProducts(duplicates);
                        setIsDuplicateModalOpen(true);
                    } else {
                        triggerModal('Atención', 'Producto no encontrado en la base de datos.', 'warning');
                    }
                } else if (data) {
                    const product = {
                        code: data.code || inputCode,
                        name: data.description || 'Producto Desconocido',
                        description: data.description,
                        barcode: inputCode,
                        barcode_secondary: data.barcode_secondary || '',
                        brand: data.brand,
                        primary_unit: data.primary_unit,
                        secondary_unit: data.secondary_unit,
                        conversion_factor: data.conversion_factor,
                        conversion_type: data.conversion_type
                    };
                    productCacheRef.current.set(inputCode, product);
                    saveProductToLocalStorage(inputCode, product);
                    openFichajeModal(product, null);
                }
            } catch (error) {
                console.error('Error fetching product:', error);
                triggerModal('Atención', 'Producto no encontrado en la base de datos.', 'warning');
            } finally {
                setIsProcessingScan(false);
            }
        }
    }, []); // Empty dependency array as we use refs/setters

    const handleFichajeConfirm = async (quantityToAdd) => {
        const { product } = fichajeState;
        if (!product || isSubmittingFichaje || lockingRef.current) return;

        lockingRef.current = true;
        setIsSubmittingFichaje(true);

        try {
            setItems(prevItems => {
                const existingItem = prevItems.find(i => i.code === product.code);
                const newTotal = (existingItem ? existingItem.quantity : 0) + quantityToAdd;

                const updatedItem = existingItem 
                    ? { ...existingItem, quantity: newTotal, validationError: null }
                    : {
                        code: product.code,
                        name: product.name,
                        quantity: quantityToAdd,
                        validationError: null
                    };

                // Prepend updated or new item to the list (Latest First)
                return [updatedItem, ...prevItems.filter(i => i.code !== product.code)];
            });

            // Sync to backend
            if (selectedCount) {
                await syncToInventoryScans(product.code, quantityToAdd);
            }
            
            // Close modal only after successful sync/queue
            setFichajeState(prev => ({ ...prev, isOpen: false, product: null }));
        } catch (error) {
            console.error('[ERROR] Fichaje confirmation failed:', error);
            // The syncToInventoryScans already handles offline queueing and toasts
        } finally {
            setIsSubmittingFichaje(false);
            lockingRef.current = false;
        }
    };


    // Sync total quantity to inventory_scans (handles updates and "deletes")
    const syncTotalToInventory = async (code, totalQuantity) => {
        if (!selectedCount) return;

        try {
            await api.post('/api/inventory/scan', {
                orderNumber: selectedCount.id,
                items: [{
                    code: code,
                    quantity: totalQuantity
                }]
            });

            debouncedFetch();
        } catch (error) {
            console.error('Error in syncTotalToInventory:', error);
            if (error.response?.status === 401) {
                triggerModal('Error de Sincronización', 'No se pudo guardar el escaneo. Sesión expirada.', 'error');
            } else if (error.response?.status === 403) {
                const serverMsg = error.response.data?.message || 'Acción denegada por reglas de re-control.';
                triggerModal('Acción Bloqueada', serverMsg, 'error');
                // Restauramos la sesión para revertir el cambio local
                restoreSession(selectedCount.id, true);
            } else {
                // API failed (network/server error) — queue for later sync
                const pendingKey = `pending_inventory_scans_${selectedCount.id}`;
                const queue = JSON.parse(localStorage.getItem(pendingKey) || '[]');
                const filteredQueue = queue.filter(q => !(q.type === 'total' && q.code === code));
                filteredQueue.push({ type: 'total', code, quantity: totalQuantity });
                localStorage.setItem(pendingKey, JSON.stringify(filteredQueue));
                checkPendingSync();
                toast.warning('Guardado localmente (Offline). Se sincronizará al reconectar.', { duration: 4000 });
            }
        }
    };

    // Sync to inventory_scans for general count mode (incremental)
    const syncToInventoryScans = async (code, quantityToAdd) => {
        if (!selectedCount) return;

        try {
            // Use new incremental endpoint - sends DELTA, not total.
            const response = await api.post('/api/inventory/scan-incremental', {
                orderNumber: selectedCount.id,
                items: [{
                    code: code,
                    quantity: quantityToAdd
                }]
            });

            debouncedFetch();
        } catch (error) {
            console.error('[DEBUG_FRONTEND] Error syncing to inventory_scans:', error);
            if (error.response?.status === 401) {
                triggerModal('Error de Sincronización', 'No se pudo guardar el escaneo. Sesión expirada.', 'error');
            } else if (error.response?.status === 403) {
                const serverMsg = error.response.data?.message || 'Acción denegada por reglas de re-control.';
                triggerModal('Acción Bloqueada', serverMsg, 'error');
                // Restauramos la sesión para revertir el cambio local
                restoreSession(selectedCount.id, true);
            } else {
                // API failed (network/server error) — queue for later sync, keep optimistic state
                const pendingKey = `pending_inventory_scans_${selectedCount.id}`;
                const queue = JSON.parse(localStorage.getItem(pendingKey) || '[]');
                queue.push({ type: 'incremental', code, quantity: quantityToAdd });
                localStorage.setItem(pendingKey, JSON.stringify(queue));
                checkPendingSync();
                toast.warning('Guardado localmente (Offline). Se sincronizará al reconectar.', { duration: 4000 });
            }
        }
    };

    // Effect to listen for scan errors to show modal (workaround for useCallback dependency)
    useEffect(() => {
        const handleScanError = (e) => {
            triggerModal('Atención', e.detail, 'warning');
        };
        window.addEventListener('scan-error', handleScanError);
        return () => window.removeEventListener('scan-error', handleScanError);
    }, []);


    const handleManualChange = (e) => {
        const value = e.target.value;
        setManualCode(value);

        if (value.length < 2) {
            setShowSuggestions(false);
            setManualSuggestions([]);
            return;
        }

        if (expectedItems) {
            // Filter expected items by description or code
            const matches = expectedItems.filter(item =>
                (item.description && item.description.toLowerCase().includes(value.toLowerCase())) ||
                (item.code && item.code.toLowerCase().includes(value.toLowerCase()))
            );
            setManualSuggestions(matches.slice(0, 5));
            setShowSuggestions(matches.length > 0);
        } else {
            // General Mode: Search via API with debounce
            const handler = setTimeout(async () => {
                try {
                    const res = await api.get(`/api/products/search?q=${encodeURIComponent(value)}`);
                    setManualSuggestions(res.data);
                    setShowSuggestions(res.data.length > 0);
                } catch (error) {
                    console.error('Error searching products:', error);
                }
            }, 300);

            // Cleanup previous timeout works because React re-renders component?
            // Wait, this is inside render logic loop if not careful. 
            // Better to wrap in useEffect or use a ref for timeout.
            // Simplified inline approach usually has issues without cleanup refs.
            // Let's use a simple approach: Trigger it but clear previous timeout stored in a ref.

            return () => clearTimeout(handler); // This won't work in event handler directly.
        }
    };

    // Ref for debounce
    const searchTimeoutRef = React.useRef(null);


    const handleManualChangeDebounced = (e) => {
        const value = e.target.value;
        setManualCode(value);

        if (value.length < 2) {
            setShowSuggestions(false);
            setManualSuggestions([]);
            return;
        }

        // Clear previous timeout
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(() => {
            executeSearch(value);
        }, 300);
    };

    const handleSelectSuggestion = (product) => {
        setManualCode(product.code); // Fill with code so "Agregar" works as expected
        setShowSuggestions(false);
        // Optional: auto-submit or just focus button? Let's just fill for now to be safe.
        // If user wants speed, we can auto-trigger handleScan(product.code) here.
    };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        // If one suggestion is visible and exactly matches input or user just hits enter on a filtered list?
        // Standard behavior: submit what's in the box.
        if (manualCode) {
            handleScan(manualCode);
            setManualCode('');
            setShowSuggestions(false);
        }
    };

    const handleSelectCount = async (count) => {
        selectionClearedRef.current = !count;
        setSelectedCount(count);
        if (count) {
            localStorage.setItem('selectedCountId', count.id);
            // Sync to backend for cross-device persistence
            try {
                await api.put('/api/auth/active-count', { countId: count.id });
            } catch (e) {
                console.error('Error syncing count to backend:', e);
            }
        } else {
            localStorage.removeItem('selectedCountId');
            // Sync to backend to clear
            try {
                await api.put('/api/auth/active-count', { countId: null });
            } catch (e) {
                console.error('Error clearing count from backend:', e);
            }
        }
        setItems([]); // Clear local items to prepare for restore
    };

    const handleStartGeneralCount = async () => {
        if (!newCountName.trim()) return triggerModal('Error', 'Ingrese un nombre para el conteo', 'warning');
        setShowConfirmCreate(true);
    };

    const handleActualCreateCount = async () => {
        setShowConfirmCreate(false);
        try {
            const res = await api.post('/api/general-counts', {
                name: newCountName,
                sucursal_id: selectedBranch || null
            });
            // Update actives and select it
            const newCount = res.data;
            selectionClearedRef.current = false;
            setActiveCounts(prev => [newCount, ...prev]);
            setSelectedCount(newCount);
            localStorage.setItem('selectedCountId', newCount.id);

            // Sync to backend for cross-device persistence
            try {
                await api.put('/api/auth/active-count', { countId: newCount.id });
            } catch (e) {
                console.error('Error syncing new count to backend:', e);
            }

            setNewCountName('');
            setSelectedBranch('');
            triggerModal('Éxito', 'Conteo General iniciado', 'success');
        } catch (error) {
            triggerModal('Error', error.response?.data?.message || 'Error al iniciar conteo', 'error');
        }
    };

    const handleStopGeneralCount = async () => {
        if (!selectedCount) return;
        if (!window.confirm(`¿Seguro que desea finalizar "${selectedCount.name}"? Nadie podrá seguir escaneando en él.`)) return;

        try {
            const response = await api.put(`/api/general-counts/${selectedCount.id}/close`);

            // const reportData = response.data.report;

            // if (reportData && reportData.length > 0) {
            //     setReportConfig({
            //         isOpen: true,
            //         data: reportData,
            //         title: `Reporte de Conteo: ${selectedCount.name}`
            //     });
            // }

            // Remove from active list
            setActiveCounts(prev => prev.filter(c => c.id !== selectedCount.id));
            setSelectedCount(null);
            localStorage.removeItem('selectedCountId');

            // Clear from backend
            try {
                await api.put('/api/auth/active-count', { countId: null });
            } catch (e) {
                console.error('Error clearing count from backend on close:', e);
            }

            setItems([]);
            setRemitoNumber('');
            triggerModal('Éxito', 'Conteo finalizado. Puede consultar el reporte en el Historial.', 'success');
        } catch (error) {
            console.error('Error al finalizar conteo:', error);
            triggerModal('Error', 'Error al finalizar conteo', 'error');
        }
    };


    // (Optimization: getExpectedQty is now moved to the top of the component)
    
    // Calculate total quantity of items scanned
    const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    // Pasos de la guía interactiva dinámicos según el estado del conteo
    const tourSteps = !selectedCount ? (
        !['admin', 'superadmin', 'branch_admin'].includes(user?.role) ? [
            {
                target: null,
                title: "¡Bienvenido a la Guía de Inicio!",
                content: "Te enseñaremos cómo unirte a un conteo de mercadería de tu sucursal para que puedas comenzar a trabajar.",
                placement: "center"
            },
            {
                target: "#tour-cargar-conteo",
                title: "Unirse a un Conteo Activo",
                content: "Si tu administrador ya inició un conteo para tu sucursal, aparecerá listado aquí en 'Conteos en Curso'. Solo debes hacer clic en 'Continuar' para unirte. Si no hay ninguno, deberás esperar a que el administrador lo cree.",
                placement: "bottom"
            },
            {
                target: null,
                title: "¡Siguiente Paso!",
                content: "Una vez te unas al conteo activo, se habilitará la pantalla de escaneo. En ese momento, podrás reiniciar esta guía para aprender a registrar y controlar los productos.",
                placement: "center"
            }
        ] : [
            {
                target: null,
                title: "¡Bienvenido a la Guía de Inicio (Administrador)!",
                content: "Te enseñaremos cómo iniciar o retomar un conteo de mercadería paso a paso utilizando remitos precargados o importaciones.",
                placement: "center"
            },
            {
                target: "#tour-cargar-conteo",
                title: "Retomar o Iniciar desde Pendientes",
                content: "En este panel puedes: 1. Retomar un conteo que ya esté activo en 'Conteos en Curso'. 2. Iniciar un nuevo conteo seleccionando uno o varios remitos de la lista de 'Conteos Pendientes' y haciendo clic en 'Cargar Conteos'.",
                placement: "bottom"
            },
            {
                target: "#tour-importar-xml-seccion",
                title: "Importar Stock Inicial (XML / Excel)",
                content: "Si deseas realizar un conteo desde un stock del ERP, selecciona la sucursal de destino y haz clic en '+ Subir DocConteo (XML / XLSX / XLS)' para cargar el archivo. El sistema procesará los productos y los dejará listos para el conteo.",
                placement: "top"
            },
            ...(preRemitoStatus === 'found' ? [
                {
                    target: "#tour-iniciar-conteo-remito",
                    title: "Asignar Nombre e Iniciar Conteo",
                    content: "¡Los productos se han consolidado correctamente! Ahora puedes ingresar un nombre personalizado para el conteo (ej: 'Pasillo Lacteos A' o 'Carga Semanal') en el campo de texto. Luego, presiona 'Iniciar Conteo' para que el equipo pueda unirse y comenzar a escanear.",
                    placement: "bottom"
                }
            ] : []),
            {
                target: null,
                title: "¡Siguiente Paso!",
                content: "Una vez que inicies o selecciones un conteo, se habilitará la interfaz de escaneo y tus operadores podrán unirse en tiempo real desde sus dispositivos.",
                placement: "center"
            }
        ]
    ) : [
        {
            target: null,
            title: "¡Guía de Conteo Activo!",
            content: "Ya tienes un conteo cargado. Te mostraremos cómo usar las herramientas de registro y control de productos.",
            placement: "center"
        },
        {
            target: "#tour-active-count-header",
            title: "Información del Conteo",
            content: "Aquí ves el nombre del conteo actual y su sucursal. Los administradores también verán botones para cambiar de conteo o finalizarlo definitivamente.",
            placement: "bottom"
        },
        {
            target: "#tour-tab-selector",
            title: "Pestañas de Trabajo",
            content: "Puedes navegar entre tres vistas principales: 'Escanear' (para el ingreso de productos), 'Historial' (para verificar y editar) y 'Lista de Conteo' (para el consolidado general).",
            placement: "bottom"
        },
        {
            target: "#tour-agregar-productos",
            title: "Formulario de Ingreso",
            content: "Esta sección es el panel de carga. Puedes agregar productos buscando de forma manual, usando la voz o la cámara.",
            placement: "right",
            onEnter: () => setCountTab('scan')
        },
        {
            target: "#tour-manual-input",
            title: "Ingreso Manual / Autocompletado",
            content: "Escribe el código o nombre del producto aquí. Verás sugerencias en tiempo real y podrás hacer clic para agregarlo.",
            placement: "bottom",
            onEnter: () => setCountTab('scan')
        },
        {
            target: "#tour-voz-search-btn",
            title: "Búsqueda por Voz",
            content: "Toca el micrófono y di el nombre del producto en voz alta para buscarlo rápidamente sin tener que escribir.",
            placement: "top",
            onEnter: () => setCountTab('scan')
        },
        {
            target: "#tour-usar-camara-btn",
            title: "Escáner por Cámara",
            content: "Abre la cámara del dispositivo para escanear de forma consecutiva los códigos de barras. Es la forma más rápida de ingresar mercadería.",
            placement: "top",
            onEnter: () => setCountTab('scan')
        },
        {
            target: "#tour-items-escaneados",
            title: "Historial de Escaneos",
            content: "Hemos cambiado a la pestaña 'Historial'. Aquí verás la lista de productos que ya registraste en este dispositivo. Podrás ajustar sus cantidades con los botones + y - o eliminar los que cargaste por error.",
            placement: "left",
            onEnter: () => setCountTab('history')
        },
        {
            target: "#tour-branch-count-list",
            title: "Lista de Conteo (Avance General)",
            content: "Hemos cambiado a la pestaña 'Lista de Conteo'. Aquí puedes observar todo lo que ha escaneado el equipo completo para esta sucursal en tiempo real. Es ideal para validar y hacer cierres.",
            placement: "bottom",
            onEnter: () => setCountTab('list')
        },
        ...(['admin', 'superadmin', 'branch_admin'].includes(user?.role) ? [
            {
                target: "#tour-finalizar-conteo-btn",
                title: "Finalizar y Cerrar Conteo",
                content: "Al completar el control, como administrador puedes cerrar el conteo desde aquí. Si hay diferencias con lo esperado (en modo Remito/Pedido), se te pedirá detallar los motivos (sin stock, dañado, etc.) y se generará el reporte final.",
                placement: "bottom",
                onEnter: () => setCountTab('scan')
            }
        ] : []),
        {
            target: null,
            title: "¡Guía Completada!",
            content: "¡Listo! Ya conoces todas las herramientas. Recuerda que la app funciona offline: tus escaneos se guardan en el celular y se subirán al servidor automáticamente al volver la conexión. ¡Buen trabajo!",
            placement: "center"
        }
    ];

    return (
        <div className="relative w-full h-full">
            <Modal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                onConfirm={modalConfig.onConfirm}
                confirmText={modalConfig.confirmText}
            />

            <ConfirmModal
                isOpen={showConfirmCreate}
                onClose={() => setShowConfirmCreate(false)}
                onConfirm={handleActualCreateCount}
                title="Confirmar Inicio de Conteo"
                message="¿Actualizaste los saldos?"
            />

            <FichajeModal
                isOpen={fichajeState.isOpen}
                onClose={() => setFichajeState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleFichajeConfirm}
                product={fichajeState.product}
                existingQuantity={fichajeState.existingQuantity}
                expectedQuantity={fichajeState.expectedQuantity}
                isSubmitting={isSubmittingFichaje}
            />


            <Suspense fallback={null}>
                <ReportModal
                    isOpen={reportConfig.isOpen}
                    onClose={() => setReportConfig(prev => ({ ...prev, isOpen: false }))}
                    title={reportConfig.title}
                    reportData={reportConfig.data}
                />
            </Suspense>

            <Suspense fallback={null}>
                <GuideModal
                    isOpen={isGuideOpen}
                    onClose={() => setIsGuideOpen(false)}
                />
            </Suspense>

            <Suspense fallback={null}>
                <InteractiveTour
                    isOpen={isTourOpen}
                    onClose={() => setIsTourOpen(false)}
                    steps={tourSteps}
                />
            </Suspense>

            {showHelpChoice && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <HelpCircle className="w-6 h-6 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Guía de Ayuda</h3>
                            <p className="text-sm text-gray-500 mt-1">¿Cómo deseas aprender a usar esta pestaña?</p>
                        </div>
                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setShowHelpChoice(false);
                                    setIsTourOpen(true);
                                }}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left group"
                            >
                                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors animate-pulse">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-sm">Guía Interactiva (Recomendado)</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">Un tour guiado paso a paso señalando cada parte de la pantalla.</p>
                                </div>
                            </button>
                            <button
                                onClick={() => {
                                    setShowHelpChoice(false);
                                    setIsGuideOpen(true);
                                }}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left group"
                            >
                                <div className="p-3 bg-gray-100 text-gray-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-sm">Manual de Usuario</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">Ver instrucciones detalladas en formato de lectura.</p>
                                </div>
                            </button>
                        </div>
                        <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setShowHelpChoice(false)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clarification Modal */}
            {showClarificationModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b bg-yellow-50 border-yellow-100 flex-shrink-0">
                            <h3 className="text-lg font-bold text-yellow-800 flex items-center">
                                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Diferencias Encontradas
                            </h3>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            <p className="text-gray-700 mb-4">
                                Se han detectado diferencias entre el conteo y lo escaneado. Por favor, ingrese una aclaración para continuar.
                            </p>

                            {pendingDiscrepancies && (
                                <div className="mb-6 bg-gray-50 p-4 rounded-lg text-sm border border-gray-100">
                                    {pendingDiscrepancies.missing.length > 0 && (
                                        <div className="mb-4">
                                            <button
                                                onClick={() => setMissingExpanded(!missingExpanded)}
                                                className="w-full flex items-center justify-between mb-3 hover:bg-gray-100 p-2 rounded transition"
                                            >
                                                <span className="font-bold text-red-700 flex items-center text-base">
                                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                                    Faltantes ({pendingDiscrepancies.missing.length})
                                                </span>
                                                <svg className={`w-5 h-5 text-gray-500 transform transition-transform ${missingExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                            </button>

                                            {missingExpanded && (
                                                <div className="space-y-3 max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                                                    {pendingDiscrepancies.missing.map(item => (
                                                        <div key={item.code} className="bg-white p-3 rounded border border-gray-200 shadow-sm">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div>
                                                                    <p className="font-semibold text-gray-800">{item.description}</p>
                                                                    <p className="text-xs text-gray-500">{item.code}</p>
                                                                </div>
                                                                <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded">
                                                                    Faltan: {item.expected - item.scanned}
                                                                </span>
                                                            </div>

                                                            <div className="mt-2 flex gap-4">
                                                                <label className="flex items-center cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        name={`reason-${item.code}`}
                                                                        value="no_stock"
                                                                        checked={missingReasons[item.code] === 'no_stock'}
                                                                        onChange={() => setMissingReasons(prev => ({ ...prev, [item.code]: 'no_stock' }))}
                                                                        className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue"
                                                                    />
                                                                    <span className="ml-2 text-sm text-gray-700">Sin Stock</span>
                                                                </label>
                                                                <label className="flex items-center cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        name={`reason-${item.code}`}
                                                                        value="damaged"
                                                                        checked={missingReasons[item.code] === 'damaged'}
                                                                        onChange={() => setMissingReasons(prev => ({ ...prev, [item.code]: 'damaged' }))}
                                                                        className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue"
                                                                    />
                                                                    <span className="ml-2 text-sm text-gray-700">Producto Dañado</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {pendingDiscrepancies.extra.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-gray-200">
                                            <span className="font-bold text-orange-600 block mb-2">Sobrantes ({pendingDiscrepancies.extra.length}) items</span>
                                            <p className="text-xs text-gray-500">Estos items se agregarán al remito como extra.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Aclaración / Motivo
                            </label>
                            <textarea
                                value={clarificationText}
                                onChange={(e) => setClarificationText(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 min-h-[100px]"
                                placeholder="Ej: Mercadería no llegó, error en remito, etc."
                            />
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowClarificationModal(false);
                                    setClarificationText('');
                                    setMissingReasons({});
                                    setMissingExpanded(false);
                                    setPendingDiscrepancies(null);
                                }}
                                className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-100 rounded-lg transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmClarification}
                                className="px-4 py-2 bg-yellow-600 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-700 transition"
                            >
                                Confirmar y Finalizar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-5xl mx-auto bg-white md:p-8 p-4 rounded-xl shadow-none md:shadow-xl my-0 md:my-8 border-none md:border border-gray-200 relative min-h-screen md:min-h-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 border-b border-gray-100 pb-4 gap-2">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl md:text-3xl font-bold text-brand-dark tracking-tight">Nuevo Conteo</h2>
                        <button
                            onClick={() => setShowHelpChoice(true)}
                            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-full transition-all duration-200 group relative"
                            title="Guía de uso"
                        >
                            <HelpCircle className="w-6 h-6 md:w-7 md:h-7" />
                            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-medium shadow-xl border border-gray-700">
                                ¿Cómo usar?
                            </span>
                        </button>
                    </div>
                    <div className="text-sm text-brand-gray">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                </div>

                {/* General Count Manager - Visible when counts are active or in products mode */}
                {(countMode === 'products' || selectedCount) && (
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
                        {pendingSyncCount > 0 && selectedCount && (
                            <div className="bg-yellow-100 p-3 rounded-lg text-yellow-800 font-bold text-sm w-full mb-4 flex justify-between items-center animate-pulse border border-yellow-300">
                                <span>⚠️ {pendingSyncCount} escaneos pausados sin internet.</span>
                                <button onClick={syncOfflineData} className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-xs hover:bg-yellow-600 transition-colors">Intentar Sincronizar</button>
                            </div>
                        )}
                        {!selectedCount ? (
                            /* Selection Mode: List of Open Counts */
                            !['admin', 'superadmin', 'branch_admin'].includes(user?.role) ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-blue mb-4"></div>
                                    <h3 className="text-lg font-semibold text-gray-700">Esperando inicio de conteo...</h3>
                                    <p className="text-sm text-gray-500 mt-2 max-w-md">
                                        El administrador debe iniciar un conteo para tu sucursal ({branches.find(b => b.id === user?.sucursal_id)?.name || 'Asignada'}).
                                        <br />
                                        El sistema lo detectará automáticamente.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4" id="tour-crear-conteo">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                        <h3 className="text-lg font-bold text-gray-800">Seleccionar Conteo Activo</h3>
                                        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                                            <input
                                                type="text"
                                                placeholder="Nuevo Conteo (ej: Depósito)"
                                                value={newCountName}
                                                onChange={(e) => setNewCountName(e.target.value)}
                                                className="px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm w-full sm:w-48"
                                            />
                                            <select
                                                value={selectedBranch}
                                                onChange={(e) => setSelectedBranch(e.target.value)}
                                                className="px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm w-full sm:w-auto"
                                            >
                                                <option value="">Deposito</option>
                                                {branches.filter(b => b.name !== 'Deposito').map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={handleStartGeneralCount}
                                                className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 text-sm whitespace-nowrap w-full sm:w-auto"
                                            >
                                                + Crear
                                            </button>
                                        </div>
                                    </div>

                                    {activeCounts.length === 0 ? (
                                        <p className="text-gray-500 italic p-4 text-center bg-white rounded-lg border border-dashed border-gray-300">
                                            No hay conteos activos. Crea uno para comenzar.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {activeCounts.map(count => {
                                                const parts = count.name.split(',').map(p => p.trim());
                                                const isCustom = !parts[0].startsWith('STOCK-') && !parts[0].toUpperCase().startsWith('RE-CONTROL:');
                                                const displayName = isCustom ? parts[0] : parts.join(', ');
                                                
                                                return (
                                                     <button
                                                         key={count.id}
                                                         onClick={() => handleSelectCount(count)}
                                                         className={`p-4 bg-white hover:bg-blue-50 border rounded-lg text-left transition shadow-sm hover:shadow relative overflow-hidden ${count.parent_count_id ? 'border-orange-200' : 'border-gray-200 hover:border-blue-300'}`}
                                                     >
                                                         {count.parent_count_id && (
                                                             <div className="absolute top-0 right-0">
                                                                 <div className="bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-tighter">
                                                                     Re-control
                                                                 </div>
                                                             </div>
                                                         )}
                                                         <div className="font-bold text-gray-800 mb-1 line-clamp-1">{displayName}</div>
                                                         {isCustom && parts.length > 1 && (
                                                             <div className="text-[10px] text-gray-400 mb-2 truncate">
                                                                 Ref: {parts.slice(1).join(', ')}
                                                             </div>
                                                         )}
                                                         <div className="text-xs text-gray-500 flex justify-between">
                                                             <span>{count.sucursal_name || 'Global'}</span>
                                                             <span>{new Date(count.created_at).toLocaleDateString()}</span>
                                                         </div>
                                                     </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            /* Active Mode: Working on a Conteo */
                            <div className="flex flex-col md:flex-row justify-between items-center gap-4" id="tour-active-count-header">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-green-100 text-green-600">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                                    </div>
                                    <div>
                                         <h3 className="text-lg font-bold text-gray-800 max-h-32 overflow-y-auto break-all custom-scrollbar pr-2 leading-tight flex items-center gap-2">
                                             Conteo: {
                                                 (() => {
                                                     const parts = selectedCount.name.split(',').map(p => p.trim());
                                                     const isCustom = !parts[0].startsWith('STOCK-') && !parts[0].toUpperCase().startsWith('RE-CONTROL:');
                                                     return isCustom ? parts[0] : parts.join(', ');
                                                 })()
                                             }
                                             {selectedCount.parent_count_id && (
                                                 <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                                     Modo Re-control
                                                 </span>
                                             )}
                                         </h3>
                                         {(() => {
                                             const parts = selectedCount.name.split(',').map(p => p.trim());
                                             const isCustom = !parts[0].startsWith('STOCK-') && !parts[0].toUpperCase().startsWith('RE-CONTROL:');
                                             if (isCustom && parts.length > 1) {
                                                 return (
                                                     <p className="text-xs text-gray-500 mt-0.5 font-medium">
                                                         Referencias: {parts.slice(1).join(', ')}
                                                     </p>
                                                 );
                                             }
                                             return null;
                                         })()}
                                         <p className="text-sm text-gray-600 mt-0.5">
                                             {selectedCount.sucursal_name ? `Sucursal: ${selectedCount.sucursal_name}` : 'Depósito'}
                                         </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {user?.role === 'admin' && (
                                        <button
                                            onClick={async () => {
                                                selectionClearedRef.current = true;
                                                setSelectedCount(null);
                                                localStorage.removeItem('selectedCountId');
                                                try {
                                                    await api.put('/api/auth/active-count', { countId: null });
                                                } catch (e) {
                                                    console.error('Error clearing count from backend on change:', e);
                                                }
                                            }}
                                            className="px-4 py-2 text-blue-600 font-medium hover:bg-blue-100 rounded-lg transition"
                                        >
                                            Cambiar Conteo
                                        </button>
                                    )}
                                    {(user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'branch_admin') && (
                                        <button
                                            id="tour-finalizar-conteo-btn"
                                            onClick={handleStopGeneralCount}
                                            className="px-4 py-2 bg-red-100 text-red-700 font-medium rounded-lg hover:bg-red-200 border border-red-200"
                                        >
                                            Finalizar Conteo
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Pre-Remito Section - Only Visible if countMode is 'pre_remito' */}
                {countMode === 'pre_remito' && (
                    <div id="tour-cargar-conteo" className="mb-8 p-4 md:p-6 bg-brand-bg rounded-xl border border-gray-200 shadow-sm transition-all duration-300">
                        <div
                            className="flex items-center justify-between cursor-pointer group"
                            onClick={() => setIsCargarConteoCollapsed(!isCargarConteoCollapsed)}
                        >
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                <h3 className="text-lg font-semibold text-brand-dark">Cargar Conteo</h3>
                            </div>
                            <div className="flex items-center gap-2 text-brand-gray group-hover:text-brand-blue transition-colors">
                                <span className="text-xs font-medium uppercase tracking-wider">{isCargarConteoCollapsed ? 'Expandir' : 'Contraer'}</span>
                                <svg
                                    className={`w-5 h-5 transform transition-transform duration-300 ${isCargarConteoCollapsed ? '' : 'rotate-180'}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </div>
                        </div>

                        {!isCargarConteoCollapsed && (
                            <div className="mt-6 animate-fadeIn">
                                <div className="grid grid-cols-1 gap-6">
                                    {activeCounts.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-medium text-brand-gray mb-2">Conteos en Curso ({activeCounts.length})</label>
                                            <div className="space-y-3">
                                                {activeCounts.map(count => (
                                                    <div key={count.id} className="flex items-center p-3 rounded-lg border border-blue-200 bg-blue-50 shadow-sm">
                                                        <div className="flex-1 flex justify-between items-center">
                                                            <div>
                                                                <div className="text-sm font-bold text-blue-900 max-h-24 overflow-y-auto break-all custom-scrollbar pr-2">
                                                                    {count.name.toUpperCase().startsWith('RE-CONTROL:') ? 'Re-control: ' : 'Conteo Activo: '}
                                                                    {count.name.split(',').map(n => n.trim()).map(num => {
                                                                        const cleanNum = num.replace(/^re-control:\s*/i, '');
                                                                        const pre = preRemitoList.find(p => p.order_number === cleanNum);
                                                                        if (pre) {
                                                                            if (pre.order_number.startsWith('STOCK-') && pre.id_inventory) {
                                                                                return `Stock Inicial - ${pre.id_inventory}`;
                                                                            } else if (pre.numero_pv) {
                                                                                return `PV: ${pre.numero_pv}`;
                                                                            }
                                                                        }
                                                                        return cleanNum;
                                                                    }).join(', ')}
                                                                </div>
                                                                <div className="text-xs text-blue-700 flex gap-2 mt-0.5">
                                                                    <span>{count.sucursal_name || 'Sin Sucursal'}</span>
                                                                    <span>•</span>
                                                                    <span>{new Date(count.created_at).toLocaleDateString()}</span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    const orderNumbers = count.name.split(',').map(n => n.trim());
                                                                    handleResumeActiveCount(count, orderNumbers);
                                                                }}
                                                                className="text-sm bg-brand-blue hover:bg-blue-800 text-white px-4 py-2 rounded-lg shadow whitespace-nowrap font-medium transition"
                                                            >
                                                                Continuar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {['admin', 'superadmin', 'branch_admin'].includes(user?.role) && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-brand-gray mb-2">Seleccionar Conteos ({selectedPreRemitos.length})</label>
                                                <div className="space-y-3">
                                                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white space-y-1 custom-scrollbar">
                                                        {Array.isArray(preRemitoList) && preRemitoList.length > 0 ? (
                                                            preRemitoList.map((pre) => {
                                                                const isSelected = selectedPreRemitos.includes(pre.order_number);
                                                                const activeCountMatched = activeCounts.find(c => c.name && c.name.includes(pre.order_number));
                                                                const isActiveCount = !!activeCountMatched;

                                                                return (
                                                                    <label
                                                                        key={pre.id}
                                                                        className={`flex items-center p-3 rounded-lg border transition ${isActiveCount
                                                                            ? 'bg-gray-50 border-gray-200'
                                                                            : isSelected
                                                                                ? 'border-brand-blue bg-blue-50/50 ring-1 ring-brand-blue cursor-pointer hover:bg-blue-50'
                                                                                : 'border-gray-100 bg-gray-50/30 cursor-pointer hover:bg-blue-50'
                                                                            }`}
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            disabled={isActiveCount}
                                                                            onChange={() => {
                                                                                if (isActiveCount) return;
                                                                                if (isSelected) {
                                                                                    setSelectedPreRemitos(selectedPreRemitos.filter(num => num !== pre.order_number));
                                                                                } else {
                                                                                    setSelectedPreRemitos([...selectedPreRemitos, pre.order_number]);
                                                                                }
                                                                            }}
                                                                            className="w-5 h-5 text-brand-blue border-gray-300 rounded focus:ring-brand-blue disabled:opacity-50"
                                                                        />
                                                                        <div className="ml-3 flex-1 flex justify-between items-center">
                                                                            <div>
                                                                                <div className="text-sm font-bold text-gray-800">
                                                                                    {
                                                                                        pre.order_number.startsWith('STOCK-')
                                                                                            ? (pre.id_inventory ? `Stock Inicial - ${pre.id_inventory} (${new Date(pre.created_at).toLocaleDateString()})` : `Stock Inicial (${new Date(pre.created_at).toLocaleDateString()})`)
                                                                                            : (pre.numero_pv ? `PV: ${pre.numero_pv}` : `Conteo #${pre.order_number.slice(-8)}`)
                                                                                    }
                                                                                </div>
                                                                                <div className="text-xs text-brand-gray flex gap-2 mt-0.5">
                                                                                    <span>{pre.sucursal || 'Sin Sucursal'}</span>
                                                                                    <span>•</span>
                                                                                    <span>{new Date(pre.created_at).toLocaleDateString()}</span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center">
                                                                                {isActiveCount && (
                                                                                    <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full whitespace-nowrap ml-2">
                                                                                        En Curso
                                                                                    </span>
                                                                                )}
                                                                                {(user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'branch_admin') && !isActiveCount && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            handleDeletePreRemito(pre.id, pre.order_number);
                                                                                        }}
                                                                                        className="ml-2 text-gray-400 hover:text-red-500 transition p-1.5 rounded-md hover:bg-red-50 focus:outline-none"
                                                                                        title="Eliminar Conteo"
                                                                                    >
                                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </label>
                                                                );
                                                            })
                                                        ) : (
                                                            <div className="p-4 text-center text-gray-500 text-sm italic">
                                                                No hay conteos pendientes disponibles
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        onClick={handleLoadPreRemito}
                                                        disabled={selectedPreRemitos.length === 0 || preRemitoStatus === 'loading'}
                                                        className={`h-12 w-full rounded-lg transition font-medium shadow-sm flex items-center justify-center ${selectedPreRemitos.length === 0 || preRemitoStatus === 'loading'
                                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                            : 'bg-brand-blue text-white hover:bg-blue-800'
                                                            }`}
                                                    >
                                                        {preRemitoStatus === 'loading' ? (
                                                            <>
                                                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                Cargando...
                                                            </>
                                                        ) : (
                                                            `Cargar ${selectedPreRemitos.length > 0 ? `${selectedPreRemitos.length} Conteos` : 'Conteos'}`
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            <div id="tour-importar-xml-seccion" className="border-t border-gray-200 pt-6 mt-2">
                                                <label className="block text-sm font-medium text-brand-gray mb-2">O Importar Stock Inicial (XML)</label>
                                                
                                                {/* Branch Selector for XML Upload */}
                                                <div className="mb-4">
                                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 tracking-wider">Sucursal para este Stock</label>
                                                    <select
                                                        value={xmlSelectedBranch}
                                                        onChange={(e) => setXmlSelectedBranch(e.target.value)}
                                                        disabled={user?.role === 'branch_admin'}
                                                        className={`w-full h-11 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition shadow-sm ${user?.role === 'branch_admin' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                                                    >
                                                        <option value="">Seleccionar Sucursal</option>
                                                        <option value="Global">Deposito</option>
                                                        {branches.filter(b => b.name !== 'Deposito').map((b) => (
                                                            <option key={b.id} value={b.name}>{b.name}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <label className={`flex-1 flex items-center justify-center h-12 px-4 border-2 border-dashed rounded-lg cursor-pointer transition ${isLoadingXml ? 'bg-gray-100 border-gray-300 cursor-not-allowed' : 'border-green-300 hover:border-green-500 bg-green-50/30'}`}>
                                                        <input
                                                            type="file"
                                                            accept=".xml, .xlsx, .xls"
                                                            multiple
                                                            className="hidden"
                                                            onChange={handleXmlUpload}
                                                            disabled={isLoadingXml}
                                                        />
                                                        {isLoadingXml ? (
                                                            <div className="flex items-center text-gray-500">
                                                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                Procesando archivo...
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center text-green-700">
                                                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                                                <span className="font-medium text-sm">Subir DocConteo (XML / XLSX / XLS)</span>
                                                            </div>
                                                        )}
                                                    </label>
                                                </div>
                                                <p className="mt-2 text-xs text-gray-500">Sube el archivo XML, XLSX o XLS del ERP para crear una nueva lista de conteo automáticamente.</p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {['admin', 'superadmin', 'branch_admin'].includes(user?.role) && preRemitoStatus === 'found' && (
                                    <div id="tour-iniciar-conteo-remito" className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                                        <div className="flex items-center mb-2">
                                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                            <span className="font-bold text-lg">Conteos cargados con éxito</span>
                                            <span className="ml-3 bg-green-200 text-green-900 text-xs font-bold px-2 py-0.5 rounded-full">{expectedItems.length} items consolidados</span>
                                        </div>
                                        {/* Show summary of IDs if multiple */}
                                        {selectedPreRemitos.length > 1 && (
                                            <div className="ml-7 text-xs text-green-700 mt-1 mb-3">
                                                Consolidando: {selectedPreRemitos.map(num => {
                                                    const pre = preRemitoList.find(p => p.order_number === num);
                                                    if (pre && pre.order_number.startsWith('STOCK-') && pre.id_inventory) {
                                                        return pre.id_inventory;
                                                    }
                                                    return `#${num.slice(-6)}`;
                                                }).join(', ')}
                                            </div>
                                        )}

                                        {/* Campo para cambiar el nombre personalizado del conteo */}
                                        <div className="mb-4 mt-3">
                                            <label className="block text-xs font-bold text-green-700 uppercase mb-1.5 tracking-wider">
                                                Nombre del Conteo (Personalizable)
                                            </label>
                                            <input
                                                type="text"
                                                value={remitoNumber}
                                                onChange={(e) => setRemitoNumber(e.target.value)}
                                                className="w-full h-11 px-3 border border-green-300 rounded-lg text-sm bg-white text-green-950 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition shadow-sm font-medium"
                                                placeholder="Ej: Pasillo Central - Carga del Remito"
                                            />
                                            <p className="text-[11px] text-green-600 mt-1">
                                                Puedes asignar un nombre personalizado. Los identificadores técnicos se mantendrán internamente.
                                            </p>
                                        </div>

                                        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                                            {selectedCount ? (
                                                <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-bold shadow-sm flex items-center border border-blue-200 text-sm max-h-24 overflow-y-auto break-all custom-scrollbar">
                                                    <svg className="w-4 h-4 mr-2 flex-shrink-0 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                                    <span>Conteo en Curso: {
                                                        (() => {
                                                            const parts = selectedCount.name.split(',').map(p => p.trim());
                                                            const isCustom = !parts[0].startsWith('STOCK-') && !parts[0].toUpperCase().startsWith('RE-CONTROL:');
                                                            return isCustom ? parts[0] : parts.join(', ');
                                                        })()
                                                    }</span>
                                                </div>
                                            ) : <div />}
                                            <div className="flex gap-2 flex-wrap justify-end flex-grow">
                                                {selectedCount && (
                                                    <button
                                                        onClick={async () => {
                                                            if (selectedPreRemitos.length === 0) {
                                                                triggerModal('Atención', 'Seleccione al menos un conteo pendiente para vincular.', 'warning');
                                                                return;
                                                            }
                                                            const confirmLink = window.confirm(
                                                                `¿Está seguro que desea vincular ${selectedPreRemitos.length} conteo(s) al conteo activo actual?\n\n` +
                                                                `Esto agregará los productos esperados de los Excel seleccionados al control actual.`
                                                            );
                                                            if (!confirmLink) return;

                                                            try {
                                                                await api.post(`/api/general-counts/${selectedCount.id}/link-pre-remitos`, {
                                                                    preRemitoOrderNumbers: selectedPreRemitos
                                                                });
                                                                
                                                                // Refresh active counts and selection
                                                                const activeRes = await api.get('/api/general-counts/active');
                                                                if (activeRes.data) {
                                                                    const updatedCurrent = activeRes.data.find(c => c.id === selectedCount.id);
                                                                    if (updatedCurrent) {
                                                                        setSelectedCount(updatedCurrent);
                                                                        localStorage.setItem('selectedCountId', updatedCurrent.id);
                                                                        // Force reload of expected items in frontend
                                                                        setExpectedItems(null);
                                                                        setPreRemitoStatus('idle');
                                                                    }
                                                                }
                                                                
                                                                // Refresh pre-remitos list
                                                                const refreshRes = await api.get('/api/pre-remitos');
                                                                if (Array.isArray(refreshRes.data)) {
                                                                    setPreRemitoList(refreshRes.data);
                                                                }
                                                                
                                                                setSelectedPreRemitos([]);
                                                                triggerModal('Éxito', 'Los conteos han sido vinculados correctamente al conteo activo.', 'success');
                                                            } catch (err) {
                                                                console.error('Error linking pre-remitos:', err);
                                                                triggerModal('Error', err.response?.data?.message || 'Error al vincular los conteos.', 'error');
                                                            }
                                                        }}
                                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 transition flex items-center"
                                                    >
                                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                        </svg>
                                                        Vincular al Conteo Activo
                                                    </button>
                                                )}

                                                <button
                                                    onClick={async () => {
                                                        if (!remitoNumber || !remitoNumber.trim()) {
                                                            triggerModal('Atención', 'Debe ingresar un nombre para el conteo.', 'warning');
                                                            return;
                                                        }
                                                        try {
                                                            let countSucursalId = user?.sucursal_id || null;

                                                            if (!countSucursalId && selectedPreRemitos.length > 0) {
                                                                const firstPre = preRemitoList.find(p => p.order_number === selectedPreRemitos[0]);
                                                                if (firstPre && firstPre.sucursal) {
                                                                    const matchedBranch = branches.find(b => b.name.toLowerCase() === firstPre.sucursal.toLowerCase());
                                                                    if (matchedBranch) {
                                                                        countSucursalId = matchedBranch.id;
                                                                    }
                                                                }
                                                            }

                                                            const productCodes = Array.isArray(expectedItems)
                                                                ? expectedItems.map(i => i.code).filter(Boolean)
                                                                : [];

                                                            // Combinamos de forma segura el nombre ingresado por el usuario con las referencias técnicas necesarias para el backend
                                                            const originalRefsName = selectedPreRemitos.join(', ');
                                                            let finalCountName = remitoNumber.trim();
                                                            const containsAllRefs = selectedPreRemitos.every(ref => finalCountName.includes(ref));
                                                            if (!containsAllRefs) {
                                                                finalCountName = `${finalCountName}, ${originalRefsName}`;
                                                            }

                                                            const res = await api.post('/api/general-counts', {
                                                                name: finalCountName,
                                                                sucursal_id: countSucursalId,
                                                                product_codes: productCodes.length > 0 ? productCodes : undefined
                                                            });

                                                            selectionClearedRef.current = false;
                                                            setActiveCounts(prev => [res.data, ...prev]);
                                                            setSelectedCount(res.data);
                                                            localStorage.setItem('selectedCountId', res.data.id);

                                                            try {
                                                                await api.put('/api/auth/active-count', { countId: res.data.id });
                                                            } catch (e) {
                                                                console.error('Error syncing pre-remito count to backend:', e);
                                                            }

                                                            triggerModal('Éxito', 'Conteo iniciado. Puede comenzar a escanear.', 'success');
                                                        } catch (error) {
                                                            console.error('Error creating count from pre-remito:', error);
                                                            triggerModal('Error', error.response?.data?.message || 'No se pudo crear el conteo automático. Intente crear uno manual.', 'error');
                                                        }
                                                    }}
                                                    className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-green-700 transition flex items-center"
                                                >
                                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                    {selectedCount ? 'Iniciar Nuevo Conteo' : 'Iniciar Conteo'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Tab switcher: shown when any count is active */}
                {selectedCount && (
                    <div className="flex border-b border-gray-200 mb-0 mt-4 overflow-x-auto no-scrollbar" id="tour-tab-selector">
                        <button
                            onClick={() => setCountTab('scan')}
                            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${countTab === 'scan'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16a1 1 0 01-1 1h-1M4 16v-.5M4 19.5V20a1 1 0 001 1h1m0-5H5a1 1 0 00-1 1v.5" />
                                </svg>
                                Escanear
                            </span>
                        </button>
                        <button
                            onClick={() => setCountTab('history')}
                            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${countTab === 'history'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                                Historial <span className="ml-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-[10px]">{items.length} prod | {totalQuantity} u.</span>
                            </span>
                        </button>
                        <button
                            onClick={() => setCountTab('list')}
                            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${countTab === 'list'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                                Lista de Conteo
                            </span>
                        </button>
                    </div>
                )}

                {/* Branch count list tab content */}
                {selectedCount && countTab === 'list' && (
                    <div id="tour-branch-count-list" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-0" style={{ minHeight: '600px' }}>
                        <Suspense fallback={
                            <div className="flex items-center justify-center py-16 text-gray-400">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
                                Cargando...
                            </div>
                        }>
                            <BranchCountList countId={selectedCount.id} countName={selectedCount.name} />
                        </Suspense>
                    </div>
                )}

                {(!selectedCount || countTab === 'scan') && (
                    <div className={`flex flex-col lg:grid ${selectedCount && countTab === 'scan' ? 'lg:grid-cols-1 max-w-2xl mx-auto' : 'lg:grid-cols-3'} gap-6 md:gap-8 mt-8`}>
                    {/* Left Column: Inputs */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Remito Number Input Removed - Auto-assigned from Order */}
                        <div className="hidden">
                            <label className="block text-sm font-medium text-brand-dark mb-2">Número de Remito (Final)</label>
                            <input
                                type="text"
                                value={remitoNumber}
                                readOnly
                                className="w-full h-12 p-3 border border-gray-200 bg-gray-50 rounded-lg text-gray-500"
                            />
                        </div>

                        <div id="tour-agregar-productos" className="bg-white p-4 md:p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="text-lg font-semibold mb-4 text-brand-dark">Agregar Productos</h3>

                            {/* Manual Input */}
                            <form onSubmit={handleManualSubmit} className="mb-0 relative">
                                <label className="block text-xs font-medium text-brand-gray mb-1 uppercase tracking-wide">Ingreso Manual</label>
                                <div className="flex flex-col gap-3 relative">
                                    <input
                                        id="tour-manual-input"
                                        type="text"
                                        value={manualCode}
                                        onChange={handleManualChangeDebounced}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click on suggestion
                                        onFocus={() => manualCode.length >= 2 && setShowSuggestions(true)}
                                        className="w-full h-12 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition text-base"
                                        placeholder="Código o Descripción"
                                        autoFocus
                                        autoComplete="off"
                                    />

                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center mb-16">
                                        <button
                                            id="tour-voz-search-btn"
                                            type="button" // Prevent form submit
                                            onClick={handleVoiceSearch}
                                            className={`p-1.5 rounded-full transition-colors focus:outline-none z-10 ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                                }`}
                                            title="Ingresar por voz"
                                        >
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                                            </svg>
                                        </button>
                                    </div>

                                    {showSuggestions && manualSuggestions.length > 0 && manualCode.trim() !== '' && (
                                        <ul className="absolute bottom-full left-0 min-w-full w-auto max-w-[90vw] sm:max-w-xl bg-white border border-gray-200 rounded-lg shadow-lg mb-1 max-h-60 overflow-y-auto z-50">
                                            {manualSuggestions.map((item, idx) => (
                                                <li
                                                    key={idx}
                                                    onClick={() => handleSelectSuggestion(item)}
                                                    className={`px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 flex justify-between items-center ${item.isExpected ? 'bg-green-50/30' : ''}`}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="block text-sm font-medium text-gray-800 whitespace-normal break-words">{item.description || item.name}</span>
                                                            <div className="flex gap-2">
                                                                {item.inDocument ? (
                                                                    <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">EN DOCUMENTO</span>
                                                                ) : (
                                                                    <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">CATÁLOGO</span>
                                                                )}
                                                                {item.isExpected && (
                                                                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Esperado</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="block text-xs text-gray-500">{item.code}</span>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    <div className="flex gap-2">
                                        <button type="submit" className="h-12 flex-1 bg-brand-blue text-white border border-transparent rounded-lg hover:bg-blue-800 transition shadow-sm flex items-center justify-center font-medium">
                                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                            Agregar
                                        </button>
                                        {expectedItems && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newValue = !isForcingUnexpected;
                                                    setIsForcingUnexpected(newValue);
                                                    isForcingUnexpectedRef.current = newValue;

                                                    if (newValue) {
                                                        const input = document.querySelector('input[placeholder="Código o Descripción"]');
                                                        if (input) input.focus();
                                                        toast.info('Modo: Agregar producto fuera de lista activado');
                                                    }
                                                }}
                                                className={`h-12 px-3 rounded-lg border-2 transition font-medium text-xs flex flex-col items-center justify-center ${isForcingUnexpected ? 'bg-orange-100 border-orange-500 text-orange-700' : 'bg-white border-gray-200 text-gray-500 hover:border-orange-300'}`}
                                                title="Agregar producto que no figura en la lista original"
                                            >
                                                <svg className="w-4 h-4 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                <span>Fuera Lista</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </form>

                            <div className="relative mt-6">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-gray-200"></div>
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="px-2 bg-white text-sm text-gray-400">O escanear</span>
                                </div>
                            </div>

                            {/* Camera Scanner Toggle */}
                            <div className="mt-6">
                                {!isScanning && (
                                    <button
                                        id="tour-usar-camara-btn"
                                        onClick={() => setIsScanning(true)}
                                        className="w-full flex items-center justify-center px-4 py-3 rounded-lg border-2 border-brand-blue text-brand-blue hover:bg-blue-50 transition font-medium"
                                    >
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                        Usar Cámara
                                    </button>
                                )}

                                {isScanning && ReactDOM.createPortal(
                                    <div className="fixed inset-0 z-[2000] bg-transparent">
                                        <Suspense fallback={null}>
                                            <Scanner
                                                onScan={handleScan}
                                                onCancel={() => setIsScanning(false)}
                                                isEnabled={isScanning}
                                                isPaused={fichajeState.isOpen || modalConfig.isOpen || showClarificationModal || isDuplicateModalOpen || isProcessingScan}
                                                scanStatus={scanStatus}
                                            />
                                        </Suspense>
                                    </div>,
                                    document.body
                                )}
                            </div>

                            {/* Recent Scans Preview (only when a count is active and in scan tab) */}
                            {selectedCount && countTab === 'scan' && items.length > 0 && (
                                <div className="mt-8 pt-8 border-t border-gray-100 animate-fadeIn">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Últimos Escaneos</h4>
                                        <button
                                            onClick={() => setCountTab('history')}
                                            className="text-xs text-blue-600 font-bold hover:text-blue-800 transition px-2 py-1 bg-blue-50 rounded"
                                        >
                                            VER HISTORIAL COMPLETO
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {items.slice(0, 3).map((item) => (
                                            <div key={item.code} className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm transition hover:shadow-md">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-800 truncate">{item.name}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono">{item.code}</p>
                                                </div>
                                                <div className="flex items-center gap-3 ml-4">
                                                    <span className="bg-brand-blue/10 text-brand-blue text-sm font-black px-2.5 py-1 rounded-lg">x{item.quantity}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Item List (Hidden in scan mode when a count is active to improve performance) */}
                    <div className={`lg:col-span-2 flex flex-col h-full ${selectedCount && countTab === 'scan' ? 'hidden' : ''}`}>
                        <div id="tour-items-escaneados" className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                <h3 className="font-semibold text-brand-dark flex items-center">
                                    <svg className="w-5 h-5 mr-2 text-brand-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                                    Items Escaneados
                                </h3>
                                <span className="bg-brand-blue text-white text-xs font-bold px-2.5 py-1 rounded-full">{items.length} prod | {totalQuantity} u.</span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 min-h-[400px]">
                                {items.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                        <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                                        <p className="text-lg font-medium">Lista vacía</p>
                                        <p className="text-sm">Escanea productos para comenzar</p>
                                    </div>
                                ) : (
                                    items.map((item, index) => {
                                        const expectedQty = getExpectedQty(item.code);
                                        const isUnexpected = expectedItems && expectedQty === null;
                                        const isOverQty = false;
                                        const hasError = isUnexpected;

                                        return (
                                            <div key={item.code} className={`group flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-lg shadow-sm border transition hover:shadow-md gap-4 ${hasError ? 'border-l-4 border-l-brand-alert border-y-gray-100 border-r-gray-100' : 'border-l-4 border-l-brand-success border-y-gray-100 border-r-gray-100'}`}>
                                                <div className="flex-1 w-full">
                                                    <div className="flex items-center justify-between sm:justify-start">
                                                        <p className="font-semibold text-brand-dark text-lg">{item.name}</p>
                                                        {hasError && <span className="ml-2 text-brand-alert"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></span>}
                                                    </div>
                                                    <p className="text-sm text-brand-gray font-mono tracking-wide">{item.code}</p>
                                                    {isUnexpected && <p className="text-xs text-brand-alert font-bold mt-1">⚠️ No solicitado</p>}

                                                </div>

                                                <div className="flex items-center justify-between w-full sm:w-auto gap-6">
                                                    <div className="flex flex-col items-end">
                                                        <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                                            <button
                                                                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm rounded transition text-lg"
                                                                onClick={() => handleQuantityChange(item.code, Number((item.quantity - 1).toFixed(4)))}
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                min="0.001"
                                                                value={item.quantity}
                                                                onChange={(e) => handleQuantityChange(item.code, e.target.value)}
                                                                className="w-14 p-0 bg-transparent border-0 text-center font-bold text-brand-dark focus:ring-0 text-lg"
                                                            />
                                                            <button
                                                                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm rounded transition text-lg"
                                                                onClick={() => handleQuantityChange(item.code, Number((item.quantity + 1).toFixed(4)))}
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveItem(item.code)}
                                                        className="text-gray-400 hover:text-brand-alert p-2 rounded-full hover:bg-red-50 transition"
                                                        title="Eliminar item"
                                                    >
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>



                            {/* Mensaje informativo en modo general */}
                            {countMode === 'products' && selectedCount && (
                                <div className="p-4 bg-blue-50 border-t border-blue-200">
                                    <div className="flex items-center text-sm text-blue-800">
                                        <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        <span className="font-medium">Los productos se sincronizan automáticamente. El administrador cerrará el conteo cuando todos terminen.</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}

                {/* History Tab (Full width version of the Item List) */}
                {selectedCount && countTab === 'history' && (
                    <div className="flex flex-col h-full mt-8 animate-fadeIn">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden min-h-[600px]">
                            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                <h3 className="font-semibold text-brand-dark flex items-center">
                                    <svg className="w-5 h-5 mr-2 text-brand-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                                    Historial de Escaneo
                                </h3>
                                <span className="bg-brand-blue text-white text-xs font-bold px-2.5 py-1 rounded-full">{items.length} prod | {totalQuantity} unidades</span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                                {items.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-20">
                                        <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                                        <p className="text-lg font-medium">No hay productos escaneados aún</p>
                                        <p className="text-sm">Vuelve a la pestaña "Escanear" para agregar productos</p>
                                    </div>
                                ) : (
                                    items.map((item) => {
                                        const expectedQty = getExpectedQty(item.code);
                                        const isUnexpected = expectedItems && expectedQty === null;
                                        const hasError = isUnexpected;

                                        return (
                                            <div key={item.code} className={`group flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-lg shadow-sm border transition hover:shadow-md gap-4 ${hasError ? 'border-l-4 border-l-brand-alert border-y-gray-100 border-r-gray-100' : 'border-l-4 border-l-brand-success border-y-gray-100 border-r-gray-100'}`}>
                                                <div className="flex-1 w-full">
                                                    <div className="flex items-center justify-between sm:justify-start">
                                                        <p className="font-semibold text-brand-dark text-lg">{item.name}</p>
                                                        {hasError && <span className="ml-2 text-brand-alert"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></span>}
                                                    </div>
                                                    <p className="text-sm text-brand-gray font-mono tracking-wide">{item.code}</p>
                                                    {isUnexpected && <p className="text-xs text-brand-alert font-bold mt-1">⚠️ No solicitado</p>}
                                                </div>

                                                <div className="flex items-center justify-between w-full sm:w-auto gap-6">
                                                    <div className="flex flex-col items-end">
                                                        <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                                            <button
                                                                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm rounded transition text-lg"
                                                                onClick={() => handleQuantityChange(item.code, Number((item.quantity - 1).toFixed(4)))}
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                min="0.001"
                                                                value={item.quantity}
                                                                onChange={(e) => handleQuantityChange(item.code, e.target.value)}
                                                                className="w-14 p-0 bg-transparent border-0 text-center font-bold text-brand-dark focus:ring-0 text-lg"
                                                            />
                                                            <button
                                                                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm rounded transition text-lg"
                                                                onClick={() => handleQuantityChange(item.code, Number((item.quantity + 1).toFixed(4)))}
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveItem(item.code)}
                                                        className="text-gray-400 hover:text-brand-alert p-2 rounded-full hover:bg-red-50 transition"
                                                        title="Eliminar item"
                                                    >
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal for Duplicate Products Selection */}
            {isDuplicateModalOpen && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in shadow-2xl">
                    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl transition-all scale-100 border border-gray-100">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 flex items-center justify-between shadow-lg">
                            <div className="flex items-center gap-4 text-white">
                                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black leading-tight uppercase tracking-wide">Detectamos Duplicados</h2>
                                    <p className="text-amber-50 text-sm font-medium opacity-90">Selecciona el producto correcto para continuar</p>
                                </div>
                            </div>
                        </div>

                        {/* List Area */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto bg-gray-50/50 space-y-3">
                            {duplicateProducts.map((product) => (
                                <button
                                    key={product.code}
                                    onClick={() => {
                                        setIsDuplicateModalOpen(false);
                                        openFichajeModal(product, getExpectedQty(product.code));
                                    }}
                                    className="w-full text-left group transition-all duration-300 transform active:scale-[0.98]"
                                >
                                    <div className="bg-white border-2 border-transparent group-hover:border-amber-400 p-5 rounded-2xl shadow-sm group-hover:shadow-md group-hover:bg-amber-50/30 flex items-center gap-5 relative overflow-hidden">
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-200 group-hover:bg-amber-500 transition-colors"></div>

                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-gray-900 text-lg leading-tight mb-1 group-hover:text-amber-900 uppercase">
                                                {product.name || product.description}
                                            </h4>
                                            <div className="flex flex-wrap gap-2 items-center">
                                                <span className="inline-flex items-center bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono group-hover:bg-amber-100 group-hover:text-amber-700">
                                                    INT: {product.code}
                                                </span>
                                                {product.barcode && (
                                                    <span className="inline-flex items-center bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
                                                        BAR: {product.barcode}
                                                    </span>
                                                )}
                                                {product.brand && (
                                                    <span className="text-xs text-gray-400 font-semibold italic group-hover:text-amber-600/70">
                                                        • {product.brand}
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

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-100 bg-white flex justify-end px-6 py-4">
                            <button
                                onClick={() => setIsDuplicateModalOpen(false)}
                                className="px-5 py-2.5 text-gray-500 font-bold hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all active:scale-95"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
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
        </div>
    );
};

export default RemitoForm;

