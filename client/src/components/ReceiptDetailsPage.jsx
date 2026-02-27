
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import ReceiptScanner from './ReceiptScanner';
import Scanner from './Scanner';
import { downloadFile } from '../utils/downloadUtils';
import FichajeModal from './FichajeModal';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import ReceiptHistory from './ReceiptHistory';

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

    // Bulk Import State (OCR)
    const [isBulkImporting, setIsBulkImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const [importFailedItems, setImportFailedItems] = useState([]);

    // Intelligent Search State
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef(null);

    // Fichaje Modal State
    const [fichajeState, setFichajeState] = useState({
        isOpen: false,
        product: null,
        existingQuantity: 0,
        expectedQuantity: null
    });

    // Focus management
    const inputRef = useRef(null);

    useEffect(() => {
        fetchReceiptDetails();
    }, [id]);

    useEffect(() => {
        // Keep focus on input for continuous scanning
        if (!processing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [processing, activeTab, items]);

    const fetchReceiptDetails = async () => {
        try {
            const response = await api.get(`/api/receipts/${id}`);
            setReceipt(response.data);
            setItems(response.data.items || []);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching receipt details:', error);
            toast.error('Error al cargar los detalles');
            setLoading(false);
        }
    };

    const executeSearch = async (value) => {
        if (!value || value.length < 2) {
            setShowSuggestions(false);
            setSuggestions([]);
            return;
        }

        try {
            const res = await api.get(`/api/products/search?q=${encodeURIComponent(value)}`);
            setSuggestions(res.data);
            setShowSuggestions(res.data.length > 0);
        } catch (error) {
            console.error('Error searching products:', error);
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
                    maxResults: 1,
                    prompt: 'Diga el código o nombre del producto',
                    partialResults: false,
                    popup: true
                }).then(result => {
                    if (result && result.matches && result.matches.length > 0) {
                        const transcript = result.matches[0];
                        setScanInput(transcript);
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
            setScanInput(transcript);
            setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
    };

    const handleScan = async (e, overrideCode = null) => {
        if (e) e.preventDefault();
        const code = (overrideCode || scanInput).trim();
        if (!code) return;

        // Try to find product in current items first (for expected quantity)
        const existingItem = items.find(i => i.product_code === code || i.products?.provider_code === code);

        const openModal = (product, expQty, currentScanned) => {
            setFichajeState({
                isOpen: true,
                product: product,
                existingQuantity: currentScanned,
                expectedQuantity: expQty
            });
            setShowSuggestions(false);
        };

        if (existingItem) {
            openModal({
                code: existingItem.product_code,
                description: existingItem.products?.description || 'Producto',
                barcode: existingItem.products?.barcode || existingItem.barcode || ''
            }, existingItem.expected_quantity, existingItem.scanned_quantity);
        } else {
            // Fetch from API
            try {
                setProcessing(true);
                const response = await api.get(`/api/products/${code}`);
                const product = Array.isArray(response.data) ? response.data[0] : response.data;
                openModal({
                    code: product.code,
                    description: product.description,
                    barcode: product.barcode || ''
                }, null, 0);
            } catch (error) {
                console.error('Error fetching product:', error);
                toast.error('Producto no encontrado');
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

        try {
            if (activeTab === 'load') {
                await api.post(`/api/receipts/${id}/items`,
                    { code, quantity: qty }
                );
                toast.success(`Producto agregado (Cant: ${qty})`);
            } else {
                await api.post(`/api/receipts/${id}/scan`,
                    { code, quantity: qty }
                );
            }

            setScanInput('');
            setQuantityInput(1);
            setFichajeState(prev => ({ ...prev, isOpen: false }));
            await fetchReceiptDetails();
        } catch (error) {
            console.error('Scan error:', error);
            if (error.response?.status === 404) {
                toast.error(`Producto no encontrado: ${code}`);
            } else {
                toast.error('Error al procesar código');
            }
        } finally {
            setProcessing(false);
        }
    };

    const handleBarcodeScan = (code) => {
        setScanInput(code);
        // Toast with info
        toast.info(`Código capturado: ${code}`);
        // Auto trigger the scan processing
        setTimeout(() => handleScan(null, code), 50);
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

    const handleScanComplete = async (items) => {
        setIsBulkImporting(true);
        setImportProgress({ current: 0, total: items.length });
        let successCount = 0;
        let failCount = 0;
        const failedItemsLog = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                // Post each item as 'expected'
                // Assuming logic is similar to manual provider code input
                await api.post(`/api/receipts/${id}/items`, {
                    code: item.code,
                    quantity: item.quantity
                });
                successCount++;
            } catch (error) {
                console.error(`Error importing item ${item.code}:`, error);
                failCount++;
                failedItemsLog.push({
                    code: item.code,
                    description: item.description,
                    quantity: item.quantity,
                    error: error.response?.data?.message || 'Error desconocido'
                });
            }
            setImportProgress({ current: i + 1, total: items.length });
        }

        if (successCount > 0) toast.success(`¡Listo! ${successCount} productos cargados en la base de datos.`);
        if (failCount > 0) {
            toast.error(`${failCount} fallaron al importar`);
            setImportFailedItems(failedItemsLog);
        }

        await fetchReceiptDetails();
        setIsBulkImporting(false);
    };

    if (loading) return <div className="p-4 text-center">Cargando...</div>;
    if (!receipt) return <div className="p-4 text-center">No encontrado</div>;

    // Calculate progress
    const totalExpected = items.reduce((sum, item) => sum + Number(item.expected_quantity), 0);
    const totalScanned = items.reduce((sum, item) => sum + Number(item.scanned_quantity), 0);
    const progress = totalExpected > 0 ? (totalScanned / totalExpected) * 100 : 0;

    return (
        <div className="relative w-full h-full">
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
                        {receipt.status !== 'finalized' ? (
                            <button
                                onClick={handleFinalize}
                                className="bg-brand-alert text-white px-6 py-2.5 rounded-lg font-bold hover:bg-red-700 shadow-sm transition-colors"
                            >
                                Finalizar Ingreso
                            </button>
                        ) : (
                            (user?.role === 'admin' || user?.role === 'superadmin') && (
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

                {/* Modes Tabs - Only if not finalized */}
                <div className="flex flex-col sm:flex-row mb-4 bg-gray-200/50 p-1.5 rounded-xl gap-1">
                    <div className="flex flex-1 gap-1">
                        {receipt.status !== 'finalized' && (
                            <>
                                <button
                                    className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'load' ? 'bg-white shadow-sm text-brand-blue' : 'text-gray-500'}`}
                                    onClick={() => setActiveTab('load')}
                                >
                                    1. Cargar
                                </button>
                                <button
                                    className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'control' ? 'bg-white shadow-sm text-brand-success' : 'text-gray-500'}`}
                                    onClick={() => setActiveTab('control')}
                                >
                                    2. Controlar
                                </button>
                            </>
                        )}
                        <button
                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500'}`}
                            onClick={() => setActiveTab('history')}
                        >
                            Historial
                        </button>
                    </div>
                    {activeTab === 'load' && receipt.status !== 'finalized' && (
                        <button
                            onClick={() => setShowScanner(true)}
                            className="w-full sm:w-auto px-4 py-2.5 bg-brand-blue text-white rounded-lg hover:bg-blue-700 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
                        >
                            <span>📷</span> OCR
                        </button>
                    )}
                </div>

                {/* Input Area */}
                {receipt.status !== 'finalized' && (
                    <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-gray-100">
                        <form onSubmit={handleScan} className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">
                                        {activeTab === 'load' ? 'Código de Proveedor' : 'Producto (Interno/Prov)'}
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
                                                        <div className="text-xs text-gray-500">COD: {s.code} {s.provider_code ? `| PROV: ${s.provider_code}` : ''}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
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
            {isBarcodeReaderActive && (
                <div className="fixed inset-0 z-[45] bg-transparent flex flex-col">
                    <div className="relative h-[90%] w-full flex items-center justify-center overflow-hidden">
                        <Scanner
                            onScan={handleBarcodeScan}
                            onCancel={() => setIsBarcodeReaderActive(false)}
                            isEnabled={isBarcodeReaderActive && !fichajeState.isOpen && !processing}
                        />
                    </div>
                    <div className="h-[10%] w-full bg-white scanner-footer flex items-center justify-center border-t border-gray-200 p-2 z-[46]">
                        <button
                            onClick={() => setIsBarcodeReaderActive(false)}
                            className="w-full h-full max-w-md bg-red-100 text-red-600 rounded-lg font-bold border border-red-200 flex items-center justify-center gap-2 hover:bg-red-200 transition"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            Detener Cámara
                        </button>
                    </div>
                </div>
            )}

            {isBulkImporting && (
                <div className="fixed inset-0 z-[100] bg-black bg-opacity-75 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
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
                </div>
            )}

            {importFailedItems.length > 0 && (
                <div className="fixed inset-0 z-[110] bg-black bg-opacity-75 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-lg w-full max-h-[90vh]">
                        <div className="p-4 border-b flex justify-between items-center bg-red-50 rounded-t-2xl">
                            <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                {importFailedItems.length} fallaron al importar
                            </h2>
                            <button onClick={() => setImportFailedItems([])} className="text-gray-500 hover:text-gray-900 p-1">
                                ✕
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            <p className="text-sm text-gray-600 mb-4">
                                Los siguientes productos extraídos por la IA no pudieron ser importados, probablemente porque el código no coincide con ningún producto en la base de datos.
                            </p>
                            <div className="space-y-3">
                                {importFailedItems.map((item, idx) => (
                                    <div key={idx} className="border border-red-100 bg-white p-3 rounded-xl shadow-sm">
                                        <div className="flex justify-between items-start gap-2 mb-1">
                                            <div className="font-bold text-gray-900 text-sm">{item.description || 'Sin descripción'}</div>
                                            <div className="font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs whitespace-nowrap">Cant: {item.quantity}</div>
                                        </div>
                                        <div className="text-xs font-mono text-gray-500 mb-2 mt-1">
                                            Código: <span className="font-bold text-gray-700">{item.code || '-'}</span>
                                        </div>
                                        <div className="text-xs text-red-600 bg-red-50 py-1.5 px-2 rounded font-medium border border-red-100">
                                            Error: {item.error}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-end">
                            <button
                                onClick={() => setImportFailedItems([])}
                                className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-bold shadow-sm transition-colors"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
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
        </div>
    );
};

export default ReceiptDetailsPage;
