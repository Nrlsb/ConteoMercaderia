import React, { useState, useEffect } from 'react';
import Scanner from './Scanner';
import Modal from './Modal';
import FichajeModal from './FichajeModal';
import api from '../api';

const RemitoForm = () => {
    const [items, setItems] = useState([]);
    const [manualCode, setManualCode] = useState('');
    const [remitoNumber, setRemitoNumber] = useState('');
    const [isScanning, setIsScanning] = useState(false);

    // Pre-remito state
    const [preRemitoNumber, setPreRemitoNumber] = useState('');
    const [preRemitoList, setPreRemitoList] = useState([]);
    const [expectedItems, setExpectedItems] = useState(null); // null = no pre-remito loaded
    const [preRemitoStatus, setPreRemitoStatus] = useState(''); // 'loading', 'found', 'not_found', 'error'

    // Manual Autocomplete State
    const [manualSuggestions, setManualSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

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

    const triggerModal = (title, message, type = 'info') => {
        setModalConfig({
            isOpen: true,
            title,
            message,
            type
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

    // Fetch pre-remitos list on mount
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
        fetchPreRemitos();
    }, []);

    const handleLoadPreRemito = async () => {
        if (!preRemitoNumber) return;
        setPreRemitoStatus('loading');
        try {
            const response = await api.get(`/api/pre-remitos/${preRemitoNumber}`);
            setExpectedItems(response.data.items); // items now contain { code, barcode, quantity, description } from DB
            setPreRemitoStatus('found');
            // Auto-fill remito number with the order number
            setRemitoNumber(preRemitoNumber);
        } catch (error) {
            console.error('Error loading pre-remito:', error);
            setPreRemitoStatus('not_found');
            setExpectedItems(null);
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
    };

    const handleQuantityChange = (code, newQuantity) => {
        const qty = parseInt(newQuantity, 10);
        if (isNaN(qty) || qty < 1) return;

        setItems(prevItems => prevItems.map(item => {
            if (item.code === code) {
                // Re-validate
                let validationMessage = null;
                const expectedQty = getExpectedQty(code);
                if (expectedItems && expectedQty !== null) {
                    if (qty > expectedQty) {
                        validationMessage = 'Excede cantidad solicitada';
                    }
                }
                return { ...item, quantity: qty, validationError: validationMessage };
            }
            return item;
        }));
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
                const expected = expectedItems.find(i => i.code === scanned.code);

                if (!expected) {
                    // Completely unexpected item
                    discrepancies.extra.push({
                        code: scanned.code,
                        description: scanned.name,
                        quantity: scanned.quantity
                    });
                } else if (scanned.quantity > expected.quantity) {
                    // Expected item but with excess quantity
                    discrepancies.extra.push({
                        code: scanned.code,
                        description: scanned.name,
                        quantity: scanned.quantity - expected.quantity
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
            triggerModal('Éxito', 'Remito guardado correctamente', 'success');

            // Reset form
            setItems([]);
            setRemitoNumber('');
            setExpectedItems(null);
            setPreRemitoNumber('');
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

    // Handle barcode scan (from camera or physical scanner)
    const handleScan = React.useCallback((rawCode) => {
        const inputCode = rawCode.trim(); // Trim whitespace/newlines
        const currentItems = itemsRef.current;
        const currentExpectedItems = expectedItemsRef.current;

        // 1. Resolve Product Details (from Expected or API)
        let resolvedProduct = null;
        let expectedQty = null;

        // Check in expected items first
        if (currentExpectedItems) {
            // Try to find by barcode OR code
            const expectedItem = currentExpectedItems.find(item => item.barcode === inputCode || item.code === inputCode);

            if (!expectedItem) {
                // STRICT MODE: Block unexpected items
                triggerModal('Error', 'Este producto no pertenece al pedido cargado.', 'error');
                return;
            } else {
                resolvedProduct = {
                    code: expectedItem.code,
                    name: expectedItem.description,
                    barcode: expectedItem.barcode
                };
                expectedQty = expectedItem.quantity;
            }
        }

        const openFichajeModal = (product, expQty) => {
            const existingItem = currentItems.find(i => i.code === product.code);
            const currentQty = existingItem ? existingItem.quantity : 0;

            playBeep();

            setFichajeState({
                isOpen: true,
                product: product,
                existingQuantity: currentQty,
                expectedQuantity: expQty
            });
        };

        if (resolvedProduct) {
            openFichajeModal(resolvedProduct, expectedQty);
        } else {
            // Not in expected list (or no expected list). Fetch from API.
            api.get(`/api/products/${inputCode}`)
                .then(response => {
                    const productData = response.data;
                    const product = {
                        code: productData.code || inputCode,
                        name: productData.description || 'Producto Desconocido',
                        barcode: inputCode
                    };
                    openFichajeModal(product, null); // No expected qty for unexpected items
                })
                .catch(error => {
                    console.error('Error fetching product:', error);
                    // Fallback for completely unknown item
                    const product = {
                        code: inputCode,
                        name: 'Producto Desconocido',
                        barcode: inputCode
                    };
                    openFichajeModal(product, null);
                });
        }
    }, []); // Empty dependency array as we use refs/setters

    const handleFichajeConfirm = (quantityToAdd) => {
        const { product, expectedQuantity } = fichajeState;
        if (!product) return;

        setItems(prevItems => {
            const existingItem = prevItems.find(i => i.code === product.code);
            let newItemState;

            // Validate against expected
            let validationMessage = null;
            const newTotal = (existingItem ? existingItem.quantity : 0) + quantityToAdd;

            if (expectedQuantity !== null && newTotal > expectedQuantity) {
                validationMessage = 'Excede cantidad solicitada';
                // We show a toast/notification? Standard logic adds it with red border.
            }

            if (existingItem) {
                return prevItems.map(item =>
                    item.code === product.code
                        ? { ...item, quantity: newTotal, validationError: validationMessage }
                        : item
                );
            } else {
                return [...prevItems, {
                    code: product.code,
                    name: product.name,
                    quantity: quantityToAdd,
                    validationError: validationMessage
                }];
            }
        });

        // Close modal
        setFichajeState(prev => ({ ...prev, isOpen: false, product: null }));

        // Optional: Trigger success sound or visual feedback
        if (expectedQuantity !== null && expectedQuantity !== undefined) {
            const currentQty = (items.find(i => i.code === product.code)?.quantity || 0);
            if (currentQty + quantityToAdd > expectedQuantity) {
                triggerModal('Advertencia', `Se ha superado la cantidad solicitada para ${product.name}`, 'warning');
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

        if (!expectedItems || value.length < 2) {
            setShowSuggestions(false);
            return;
        }

        // Filter expected items by description or code
        const matches = expectedItems.filter(item =>
            (item.description && item.description.toLowerCase().includes(value.toLowerCase())) ||
            (item.code && item.code.toLowerCase().includes(value.toLowerCase()))
        );

        setManualSuggestions(matches.slice(0, 5)); // Limit to 5 suggestions
        setShowSuggestions(matches.length > 0);
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

    // Helper to get expected quantity
    const getExpectedQty = (code) => {
        if (!expectedItems) return null;
        // Match by code (internal)
        const item = expectedItems.find(i => i.code === code);
        return item ? item.quantity : null; // Return null if not found
    };

    return (
        <div className="max-w-5xl mx-auto bg-white md:p-8 p-4 rounded-xl shadow-none md:shadow-xl my-0 md:my-8 border-none md:border border-gray-200 relative min-h-screen md:min-h-0">
            <Modal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
            />

            <FichajeModal
                isOpen={fichajeState.isOpen}
                onClose={() => setFichajeState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleFichajeConfirm}
                product={fichajeState.product}
                existingQuantity={fichajeState.existingQuantity}
                expectedQuantity={fichajeState.expectedQuantity}
            />

            {/* Clarification Modal */}
            {showClarificationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b bg-yellow-50 border-yellow-100 flex-shrink-0">
                            <h3 className="text-lg font-bold text-yellow-800 flex items-center">
                                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Diferencias Encontradas
                            </h3>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            <p className="text-gray-700 mb-4">
                                Se han detectado diferencias entre el pedido y lo escaneado. Por favor, ingrese una aclaración para continuar.
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

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 border-b border-gray-100 pb-4 gap-2">
                <h2 className="text-2xl md:text-3xl font-bold text-brand-dark tracking-tight">Nuevo Pedido de Venta</h2>
                <div className="text-sm text-brand-gray">
                    {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>

            {/* Pre-Remito Section */}
            <div className="mb-8 p-4 md:p-6 bg-brand-bg rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <svg className="w-5 h-5 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <h3 className="text-lg font-semibold text-brand-dark">Cargar Pedido (Pre-Remito)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-brand-gray mb-2">Seleccionar Pedido</label>
                        <div className="flex flex-col md:flex-row gap-3">
                            <select
                                value={preRemitoNumber}
                                onChange={(e) => setPreRemitoNumber(e.target.value)}
                                className="flex-1 h-12 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition shadow-sm text-base bg-white"
                            >
                                <option value="">Seleccione un pedido...</option>
                                {Array.isArray(preRemitoList) && preRemitoList.map((pre) => (
                                    <option key={pre.id} value={pre.order_number}>
                                        {pre.numero_pv
                                            ? `PV: ${pre.numero_pv} - Suc: ${pre.sucursal}`
                                            : `Pre-Remito #${pre.order_number} (${new Date(pre.created_at).toLocaleDateString()})`}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleLoadPreRemito}
                                disabled={!preRemitoNumber}
                                className={`h-12 w-full md:w-auto px-6 rounded-lg transition font-medium shadow-sm flex items-center justify-center ${!preRemitoNumber
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-brand-blue text-white hover:bg-blue-800'
                                    }`}
                            >
                                Cargar
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-brand-gray mb-2">O subir PDF de Remito</label>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={handleFileUpload}
                            className="block w-full text-sm text-brand-gray
                                file:mr-4 file:py-3 file:px-4
                                file:rounded-lg file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-brand-blue
                                hover:file:bg-blue-100 transition cursor-pointer h-12 pt-1.5"
                        />
                    </div>
                </div>

                {preRemitoStatus === 'found' && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                        <div className="flex items-center mb-2">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            <span className="font-bold text-lg">Pedido cargado con éxito</span>
                            <span className="ml-3 bg-green-200 text-green-900 text-xs font-bold px-2 py-0.5 rounded-full">{expectedItems.length} items esperados</span>
                        </div>
                        {/* Show extra info if available */}
                        {(() => {
                            const selectedPre = preRemitoList.find(p => p.order_number === preRemitoNumber);
                            if (selectedPre && selectedPre.numero_pv) {
                                return (
                                    <div className="ml-7 text-sm grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="font-semibold text-green-700">Pedido de Venta (PV):</span>
                                            <span className="ml-1">{selectedPre.numero_pv}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-green-700">Sucursal:</span>
                                            <span className="ml-1">{selectedPre.sucursal}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-green-700">Pre-Remito:</span>
                                            <span className="ml-1">{selectedPre.order_number}</span>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>
                )}
                {preRemitoStatus === 'not_found' && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        <span className="font-medium">Pedido no encontrado.</span>
                    </div>
                )}
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 md:gap-8">
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

                    <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold mb-4 text-brand-dark">Agregar Productos</h3>

                        {/* Manual Input */}
                        <form onSubmit={handleManualSubmit} className="mb-0 relative">
                            <label className="block text-xs font-medium text-brand-gray mb-1 uppercase tracking-wide">Ingreso Manual</label>
                            <div className="flex flex-col gap-3 relative">
                                <input
                                    type="text"
                                    value={manualCode}
                                    onChange={handleManualChange}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click on suggestion
                                    onFocus={() => manualCode.length >= 2 && setShowSuggestions(true)}
                                    className="w-full h-12 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition text-base"
                                    placeholder="Código o Descripción"
                                    autoFocus
                                    autoComplete="off"
                                />

                                {showSuggestions && manualSuggestions.length > 0 && (
                                    <ul className="absolute bottom-full left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg mb-1 max-h-60 overflow-y-auto z-50">
                                        {manualSuggestions.map((item, idx) => (
                                            <li
                                                key={idx}
                                                onClick={() => handleSelectSuggestion(item)}
                                                className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 flex justify-between items-center"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <span className="block text-sm font-medium text-gray-800">{item.description}</span>
                                                    <span className="block text-xs text-gray-500">{item.code}</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <button type="submit" className="h-12 w-full bg-brand-blue text-white border border-transparent rounded-lg hover:bg-blue-800 transition shadow-sm flex items-center justify-center font-medium">
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                    Agregar
                                </button>
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
                            <button
                                onClick={() => setIsScanning(!isScanning)}
                                className={`w-full flex items-center justify-center px-4 py-3 rounded-lg border-2 transition font-medium ${isScanning
                                    ? 'border-red-100 text-red-600 hover:bg-red-50'
                                    : 'border-brand-blue text-brand-blue hover:bg-blue-50'
                                    }`}
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                {isScanning ? 'Detener Cámara' : 'Usar Cámara'}
                            </button>

                            {isScanning && (
                                <div className="mt-4 rounded-lg overflow-hidden shadow-inner border border-gray-200">
                                    <Scanner onScan={handleScan} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Item List */}
                <div className="lg:col-span-2 flex flex-col h-full">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-semibold text-brand-dark flex items-center">
                                <svg className="w-5 h-5 mr-2 text-brand-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                                Items Escaneados
                            </h3>
                            <span className="bg-brand-blue text-white text-xs font-bold px-2.5 py-1 rounded-full">{items.length}</span>
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
                                    const isOverQty = expectedItems && expectedQty !== null && item.quantity > expectedQty;
                                    const hasError = isUnexpected || isOverQty;

                                    return (
                                        <div key={index} className={`group flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-lg shadow-sm border transition hover:shadow-md gap-4 ${hasError ? 'border-l-4 border-l-brand-alert border-y-gray-100 border-r-gray-100' : 'border-l-4 border-l-brand-success border-y-gray-100 border-r-gray-100'}`}>
                                            <div className="flex-1 w-full">
                                                <div className="flex items-center justify-between sm:justify-start">
                                                    <p className="font-semibold text-brand-dark text-lg">{item.name}</p>
                                                    {hasError && <span className="ml-2 text-brand-alert"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></span>}
                                                </div>
                                                <p className="text-sm text-brand-gray font-mono tracking-wide">{item.code}</p>
                                                {isUnexpected && <p className="text-xs text-brand-alert font-bold mt-1">⚠️ No solicitado</p>}
                                                {isOverQty && <p className="text-xs text-brand-alert font-bold mt-1">⚠️ Excede cantidad</p>}
                                            </div>

                                            <div className="flex items-center justify-between w-full sm:w-auto gap-6">
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                                        <button
                                                            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm rounded transition text-lg"
                                                            onClick={() => handleQuantityChange(item.code, Math.max(1, item.quantity - 1))}
                                                        >
                                                            -
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={item.quantity}
                                                            onChange={(e) => handleQuantityChange(item.code, e.target.value)}
                                                            className="w-14 p-0 bg-transparent border-0 text-center font-bold text-brand-dark focus:ring-0 text-lg"
                                                        />
                                                        <button
                                                            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm rounded transition text-lg"
                                                            onClick={() => handleQuantityChange(item.code, item.quantity + 1)}
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

                        <div className="p-4 bg-white border-t border-gray-200">
                            <button
                                onClick={handleSubmitRemito}
                                disabled={items.length === 0 || !remitoNumber}
                                className={`w-full py-4 rounded-xl font-bold text-lg transition flex items-center justify-center shadow-lg ${items.length > 0 && remitoNumber
                                    ? 'bg-brand-success text-white hover:bg-green-600 hover:shadow-xl transform hover:-translate-y-0.5'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                    }`}
                            >
                                {items.length > 0 && remitoNumber ? (
                                    <>
                                        <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                        Finalizar Remito
                                    </>
                                ) : (
                                    'Finalizar Remito'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RemitoForm;

