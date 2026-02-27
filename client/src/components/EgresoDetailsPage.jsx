import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import Scanner from './Scanner';
import FichajeModal from './FichajeModal';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { downloadFile } from '../utils/downloadUtils';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';

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

    // History state
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const inputRef = useRef(null);

    useEffect(() => {
        fetchEgresoDetails();
    }, [id]);

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

    const fetchEgresoDetails = async () => {
        try {
            const response = await api.get(`/api/egresos/${id}`);
            setEgreso(response.data);
            setItems(response.data.items || []);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching egreso details:', error);
            toast.error('Error al cargar los detalles');
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const response = await api.get(`/api/egreso-history/${id}`);
            setHistory(response.data);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setHistoryLoading(false);
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

        const existingItem = items.find(i => i.product_code === code || i.products?.provider_code === code || i.products?.barcode === code);

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
            await api.post(`/api/egresos/${id}/scan`, { code, quantity: qty });
            toast.success(`Producto controlado (Cant: ${qty})`);

            setScanInput('');
            setFichajeState(prev => ({ ...prev, isOpen: false }));
            await fetchEgresoDetails();
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
        toast.info(`Código capturado: ${code}`);
        setTimeout(() => handleScan(null, code), 50);
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
                    <title>Diferencias de Egreso - ${egreso.reference_number}</title>
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
                    <h1>Diferencias de Egreso</h1>
                    <p><strong>Referencia:</strong> ${egreso.reference_number}</p>
                    <p><strong>Fecha:</strong> ${new Date(egreso.date).toLocaleString()}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Código</th>
                                <th>Cód. Barras</th>
                                <th>Esperado</th>
                                <th>Controlado</th>
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
                                        <td>${item.products?.barcode || '-'}</td>
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
                        <div className="text-sm mt-1 ml-7">
                            Estado: <span className={egreso.status === 'finalized' ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}>
                                {egreso.status === 'finalized' ? 'FINALIZADO' : 'ABIERTO'}
                            </span>
                        </div>
                        {egreso.pdf_filename && (
                            <div className="text-xs text-gray-400 ml-7 mt-0.5">📄 {egreso.pdf_filename}</div>
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
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
                            <button
                                onClick={handleFinalize}
                                className="bg-brand-alert text-white px-6 py-2.5 rounded-lg font-bold hover:bg-red-700 shadow-sm transition-colors"
                            >
                                Finalizar Egreso
                            </button>
                        ) : (
                            (user?.role === 'admin' || user?.role === 'superadmin') && (
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
                                                        <div className="text-xs text-gray-500">COD: {s.code} {s.barcode ? `| BARRAS: ${s.barcode}` : ''}</div>
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

                {/* Content based on Tab */}
                {activeTab === 'history' ? (
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
                                                        <p className="text-[10px] text-gray-400 font-bold mb-1 uppercase tracking-wider">
                                                            INT: {item.product_code} | PROV: {item.products?.provider_code || '-'}
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

            {/* Fichaje Modal */}
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

export default EgresoDetailsPage;
