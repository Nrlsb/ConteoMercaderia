import React, { useState, useEffect, useRef } from 'react';
import Scanner from './Scanner';
import Modal from './Modal';
import FichajeModal from './FichajeModal';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Toaster, toast } from 'sonner';

const InventoryPage = () => {
    const { user } = useAuth();

    // Core State
    const [selectedOrder, setSelectedOrder] = useState('');
    const [orderList, setOrderList] = useState([]);

    // Inventory Data
    const [expectedItems, setExpectedItems] = useState([]); // From Pre-Remito
    const [scannedItems, setScannedItems] = useState({}); // { code: total_qty } (Global)
    const [myScans, setMyScans] = useState({}); // { code: my_qty } (Local session)
    const [localQueue, setLocalQueue] = useState([]); // Items scanned but not yet synced

    // UI State
    const [isLoading, setIsLoading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [manualCode, setManualCode] = useState('');
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'brands'
    const [expandedBrands, setExpandedBrands] = useState({}); // { brandName: boolean }

    // Modal State
    const [fichajeState, setFichajeState] = useState({
        isOpen: false,
        product: null,
        existingQuantity: 0,
        expectedQuantity: null
    });

    // Load available orders
    useEffect(() => {
        api.get('/api/pre-remitos')
            .then(res => setOrderList(res.data))
            .catch(err => console.error(err));
    }, []);

    // Polling for updates (every 5 seconds)
    useEffect(() => {
        if (!selectedOrder) return;

        const fetchState = async () => {
            // Don't fetch if currently syncing to avoid race conditions visually
            if (isSyncing) return;

            try {
                const res = await api.get(`/api/inventory/${selectedOrder}`);
                setExpectedItems(res.data.expected);
                setScannedItems(res.data.scanned); // Global total
                setMyScans(res.data.myScans); // Hydrate local session state from server
                // We assume server MyScans is correct for historical data, 
                // but local changes will be added visually
            } catch (error) {
                console.error("Error polling inventory:", error);
            }
        };

        fetchState(); // Initial fetch
        const interval = setInterval(fetchState, 5000); // 5s poll
        return () => clearInterval(interval);
    }, [selectedOrder, isSyncing]);

    const handleOrderSelect = (e) => {
        setSelectedOrder(e.target.value);
        setMyScans({});
        setScannedItems({});
        setLocalQueue([]);
        setExpectedItems([]);
        setViewMode('list'); // Reset view to list
        setExpandedBrands({});
    };

    const handleScan = (code) => {
        const trimmedCode = code.trim();

        // Find product details
        const expected = expectedItems.find(i => i.code === trimmedCode || i.barcode === trimmedCode);

        if (!expected) {
            toast.error('Producto no encontrado en el pedido (Modo Estricto)');
            return;
        }

        // Calculate current quantities for validation
        // Total Scanned = Global (from server) + My Local Queue
        const currentGlobalQty = (scannedItems[expected.code] || 0) +
            (localQueue.filter(i => i.code === expected.code).reduce((a, b) => a + b.quantity, 0));

        const myCurrentQty = (myScans[expected.code] || 0) +
            (localQueue.filter(i => i.code === expected.code).reduce((a, b) => a + b.quantity, 0));

        // Open Fichaje Modal
        setFichajeState({
            isOpen: true,
            product: {
                code: expected.code,
                name: expected.description,
                barcode: expected.barcode
            },
            existingQuantity: myCurrentQty, // Show MY count so far
            expectedQuantity: expected.quantity, // Show Total Expected
        });
    };

    const handleFichajeConfirm = (quantityToAdd) => {
        if (quantityToAdd <= 0) return;

        const product = fichajeState.product;

        // Add to local queue
        const newEntry = {
            code: product.code,
            quantity: quantityToAdd,
            timestamp: new Date().toISOString()
        };

        setLocalQueue(prev => [...prev, newEntry]);

        // Update local "My Scans" visually immediately
        // Update local "My Scans" visually immediately
        // REMOVED: setMyScans causes double counting because render logic adds localQueue to myScans.
        // myScans should strictly represent Server State.
        // setMyScans(prev => ({
        //     ...prev,
        //     [product.code]: (prev[product.code] || 0) + quantityToAdd
        // }));

        setFichajeState(prev => ({ ...prev, isOpen: false }));
        toast.success(`Agregado: +${quantityToAdd} ${product.name}`);
    };

    const handleSync = async () => {
        if (localQueue.length === 0) return;

        setIsSyncing(true);
        try {
            // Compress queue: merge same items
            const compressedDeltas = localQueue.reduce((acc, item) => {
                if (!acc[item.code]) acc[item.code] = 0;
                acc[item.code] += item.quantity;
                return acc;
            }, {});

            // Prepare Absolute Items to Send (Server State + Delta)
            // Backend performs Upsert, so we must send Total Quantity.
            const itemsToSend = Object.keys(compressedDeltas).map(code => {
                const serverQty = myScans[code] || 0;
                const delta = compressedDeltas[code];
                return {
                    code: code,
                    quantity: serverQty + delta
                };
            });

            await api.post('/api/inventory/scan', {
                orderNumber: selectedOrder,
                items: itemsToSend
            });

            toast.success('Sincronizado correctamente');
            setLocalQueue([]); // Clear queue
            setLastSyncTime(new Date());

            // Force refresh of state
            const res = await api.get(`/api/inventory/${selectedOrder}`);
            setScannedItems(res.data.scanned);
            setMyScans(res.data.myScans); // Confirmed backend state

        } catch (error) {
            console.error(error);
            toast.error('Error al sincronizar. Intente nuevamente.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Warn before leaving if unsynced
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (localQueue.length > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [localQueue]);

    // Manual Input
    const handleManualSubmit = (e) => {
        e.preventDefault();
        if (manualCode) {
            handleScan(manualCode);
            setManualCode('');
        }
    };

    // Helper: Toggle brand expansion
    const toggleBrand = (brandName) => {
        setExpandedBrands(prev => ({
            ...prev,
            [brandName]: !prev[brandName]
        }));
    };

    // Derived: Pending Items Grouped by Brand
    const getPendingBrands = () => {
        // Filter items that have 0 global scans (including local queue)
        const pendingItems = expectedItems.filter(item => {
            const globalQty = scannedItems[item.code] || 0;
            const localAdded = localQueue.filter(q => q.code === item.code).reduce((a, b) => a + b.quantity, 0);
            return (globalQty + localAdded) === 0;
        });

        // Group by Brand
        const grouped = pendingItems.reduce((acc, item) => {
            const brand = item.brand || 'Sin Marca';
            if (!acc[brand]) acc[brand] = [];
            acc[brand].push(item);
            return acc;
        }, {});

        return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 mb-20">
            <Toaster richColors position="top-center" />

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Conteo de Inventario (Multiusuario)</h1>
                    <p className="text-sm text-gray-500">Sesión de: {user?.username}</p>
                </div>

                <div className="flex gap-3 items-center w-full md:w-auto">
                    <select
                        value={selectedOrder}
                        onChange={handleOrderSelect}
                        className="flex-1 md:w-64 p-2 border rounded-lg shadow-sm"
                        disabled={localQueue.length > 0} // Lock change if unsaved data
                    >
                        <option value="">Seleccionar Pedido...</option>
                        {orderList.map(o => (
                            <option key={o.id} value={o.order_number}>
                                {o.order_number} {o.numero_pv ? `(PV: ${o.numero_pv})` : ''}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={handleSync}
                        disabled={localQueue.length === 0 || isSyncing}
                        className={`px-4 py-2 rounded-lg font-bold shadow-sm transition flex items-center gap-2
                            ${localQueue.length > 0
                                ? 'bg-yellow-500 text-white hover:bg-yellow-600 animate-pulse'
                                : 'bg-gray-200 text-gray-400'}`}
                    >
                        {isSyncing ? (
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                        )}
                        Sync ({localQueue.length})
                    </button>
                </div>
            </div>

            {selectedOrder ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Panel: Input */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white p-4 rounded-xl shadow border border-gray-200">
                            <h3 className="font-semibold text-lg mb-4">Ingresar Producto</h3>

                            <form onSubmit={handleManualSubmit} className="mb-4">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={manualCode}
                                        onChange={e => setManualCode(e.target.value)}
                                        placeholder="Código..."
                                        className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        autoFocus
                                    />
                                    <button type="submit" className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700">OK</button>
                                </div>
                            </form>

                            <button
                                onClick={() => setIsScanning(!isScanning)}
                                className={`w-full py-3 rounded-lg border-2 font-medium transition
                                    ${isScanning ? 'border-red-200 text-red-600 bg-red-50' : 'border-blue-200 text-blue-600 bg-blue-50'}`}
                            >
                                {isScanning ? 'Detener Cámara' : 'Activar Cámara'}
                            </button>

                            {isScanning && !fichajeState.isOpen && (
                                <div className="mt-4 rounded-lg overflow-hidden border">
                                    <Scanner onScan={handleScan} />
                                </div>
                            )}
                        </div>

                        {/* Stats Card */}
                        <div className="bg-blue-900 text-white p-4 rounded-xl shadow">
                            <h4 className="text-blue-200 text-sm font-bold uppercase mb-2">Mi Progreso</h4>
                            <div className="text-3xl font-bold">
                                {Object.values(myScans).reduce((a, b) => a + b, 0) + localQueue.reduce((a, b) => a + b.quantity, 0)}
                                <span className="text-lg font-normal text-blue-300 ml-2">unidades</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: List / Pending Brands */}
                    <div className="lg:col-span-2 flex flex-col h-[600px] bg-white rounded-xl shadow border border-gray-200 overflow-hidden">

                        {/* Tabs */}
                        <div className="flex border-b">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex-1 p-3 text-sm font-semibold text-center transition
                                    ${viewMode === 'list' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                            >
                                Listado Completo
                            </button>
                            <button
                                onClick={() => setViewMode('brands')}
                                className={`flex-1 p-3 text-sm font-semibold text-center transition
                                    ${viewMode === 'brands' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                            >
                                Marcas Pendientes
                            </button>
                        </div>

                        {viewMode === 'list' ? (
                            <>
                                <div className="p-3 bg-gray-50 border-b font-medium grid grid-cols-12 text-sm text-gray-500 gap-2">
                                    <div className="col-span-6 md:col-span-5">Producto</div>
                                    <div className="col-span-2 text-center">Esperado</div>
                                    <div className="col-span-2 text-center text-blue-600 font-bold">Total</div>
                                    <div className="col-span-2 text-center text-green-600 font-bold">Mi Conteo</div>
                                </div>

                                <div className="flex-1 overflow-y-auto">
                                    {expectedItems.map((item, idx) => {
                                        const globalQty = scannedItems[item.code] || 0;
                                        const localAdded = localQueue.filter(q => q.code === item.code).reduce((a, b) => a + b.quantity, 0);
                                        const myTotal = (myScans[item.code] || 0) + localAdded;
                                        const totalVisible = globalQty + localAdded;

                                        const isComplete = totalVisible >= item.quantity;
                                        const isMyActive = myTotal > 0;

                                        return (
                                            <div key={item.code}
                                                className={`p-3 border-b grid grid-cols-12 items-center gap-2 text-sm hover:bg-gray-50 transition
                                                    ${isComplete ? 'bg-green-50/50' : ''}`}
                                            >
                                                <div className="col-span-6 md:col-span-5 truncate">
                                                    <div className="font-medium text-gray-800">{item.description}</div>
                                                    <div className="text-xs text-gray-400">{item.code} - {item.brand}</div>
                                                </div>

                                                <div className="col-span-2 text-center font-mono">{item.quantity}</div>

                                                <div className={`col-span-2 text-center font-bold 
                                                    ${totalVisible > item.quantity ? 'text-orange-600' : 'text-blue-600'}`}>
                                                    {totalVisible}
                                                </div>

                                                <div className="col-span-2 text-center">
                                                    {isMyActive && (
                                                        <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs font-bold">
                                                            {myTotal}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            // --- VISTA DE MARCAS PENDIENTES ---
                            <div className="flex-1 overflow-y-auto bg-gray-50 p-2">
                                {getPendingBrands().length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        <p>¡Todo contado! No hay marcas con productos pendientes al 100%.</p>
                                    </div>
                                ) : (
                                    getPendingBrands().map(([brandName, items]) => {
                                        const isExpanded = expandedBrands[brandName];
                                        return (
                                            <div key={brandName} className="mb-2 bg-white rounded-lg shadow-sm border overflow-hidden">
                                                <button
                                                    onClick={() => toggleBrand(brandName)}
                                                    className="w-full flex justify-between items-center p-4 bg-white hover:bg-gray-50 transition"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-bold text-gray-700">{brandName}</span>
                                                        <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-bold">
                                                            {items.length} pendientes
                                                        </span>
                                                    </div>
                                                    <svg
                                                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                                                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                                    </svg>
                                                </button>

                                                {isExpanded && (
                                                    <div className="border-t bg-gray-50 divide-y">
                                                        {items.map(item => (
                                                            <div key={item.code} className="p-3 pl-6 grid grid-cols-12 gap-2 text-sm hover:bg-white transition">
                                                                <div className="col-span-8">
                                                                    <div className="font-medium text-gray-800">{item.description}</div>
                                                                    <div className="text-xs text-gray-400">{item.code}</div>
                                                                </div>
                                                                <div className="col-span-4 text-right flex flex-col items-end justify-center">
                                                                    <span className="text-xs text-gray-500">Esperado</span>
                                                                    <span className="font-bold text-gray-900">{item.quantity}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-500 text-lg">Seleccione un pedido para comenzar a contar</p>
                </div>
            )}

            <FichajeModal
                isOpen={fichajeState.isOpen}
                onClose={() => setFichajeState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleFichajeConfirm}
                product={fichajeState.product}
                existingQuantity={fichajeState.existingQuantity}
                expectedQuantity={fichajeState.expectedQuantity}
            />
        </div>
    );
};

export default InventoryPage;