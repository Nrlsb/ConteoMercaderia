
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import ReceiptScanner from './ReceiptScanner';
import Scanner from './Scanner';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';

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

                if (isListening) {
                    await SpeechRecognition.stop();
                    return;
                }

                setIsListening(true);
                let resultListener;
                let stateListener;

                const cleanup = () => {
                    setIsListening(false);
                    if (resultListener) resultListener.remove();
                    if (stateListener) stateListener.remove();
                };

                stateListener = await SpeechRecognition.addListener('listeningState', (data) => {
                    if (data.status === false) cleanup();
                });

                resultListener = await SpeechRecognition.addListener('partialResults', (data) => {
                    if (data.matches && data.matches.length > 0) {
                        setScanInput(data.matches[0]);
                    }
                });

                SpeechRecognition.start({
                    language: 'es-ES',
                    maxResults: 1,
                    prompt: 'Diga el código o nombre del producto',
                    partialResults: true,
                    popup: false
                }).then(result => {
                    if (result && result.matches && result.matches.length > 0) {
                        setScanInput(result.matches[0]);
                    }
                }).catch(error => {
                    console.error('Speech error:', error);
                    cleanup();
                });

                setTimeout(() => {
                    cleanup();
                    SpeechRecognition.stop();
                }, 15000);

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

    const handleScan = async (e) => {
        e.preventDefault();
        if (!scanInput.trim() || processing) return;

        setProcessing(true);
        const code = scanInput.trim();
        const qty = parseFloat(quantityInput) || 1;

        try {
            if (activeTab === 'load') {
                // Mode: Load Expected Items (scan provider code)
                await api.post(`/api/receipts/${id}/items`,
                    { code, quantity: qty }
                );
                toast.success(`Producto agregado (Cant: ${qty})`);
            } else {
                // Mode: Control (scan any code to increment verified)
                await api.post(`/api/receipts/${id}/scan`,
                    { code, quantity: qty }
                );
                // toast.success(`Producto verificado (+${qty})`);
                // Play success sound if possible?
            }

            setScanInput('');
            setQuantityInput(1); // Reset quantity to 1 after scan
            await fetchReceiptDetails(); // Refresh to show update
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
        setIsBarcodeReaderActive(false);
        // Toast with info
        toast.info(`Código capturado: ${code}`);
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

    const handleScanComplete = async (items) => {
        setProcessing(true);
        let successCount = 0;
        let failCount = 0;

        for (const item of items) {
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
            }
        }

        if (successCount > 0) toast.success(`${successCount} items importados correctamente`);
        if (failCount > 0) toast.error(`${failCount} fallaron al importar`);

        await fetchReceiptDetails();
        setProcessing(false);
    };

    if (loading) return <div className="p-4 text-center">Cargando...</div>;
    if (!receipt) return <div className="p-4 text-center">No encontrado</div>;

    // Calculate progress
    const totalExpected = items.reduce((sum, item) => sum + Number(item.expected_quantity), 0);
    const totalScanned = items.reduce((sum, item) => sum + Number(item.scanned_quantity), 0);
    const progress = totalExpected > 0 ? (totalScanned / totalExpected) * 100 : 0;

    return (
        <div className="container mx-auto p-4 max-w-lg md:max-w-5xl">
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
                {receipt.status !== 'finalized' && (
                    <button
                        onClick={handleFinalize}
                        className="w-full sm:w-auto bg-brand-alert text-white px-6 py-2.5 rounded-lg font-bold hover:bg-red-700 shadow-sm transition-colors"
                    >
                        Finalizar Ingreso
                    </button>
                )}
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
            {receipt.status !== 'finalized' && (
                <div className="flex flex-col sm:flex-row mb-4 bg-gray-200/50 p-1.5 rounded-xl gap-1">
                    <div className="flex flex-1 gap-1">
                        <button
                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'load' ? 'bg-white shadow-sm text-brand-blue' : 'text-gray-500'}`}
                            onClick={() => setActiveTab('load')}
                        >
                            1. Cargar Remito
                        </button>
                        <button
                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'control' ? 'bg-white shadow-sm text-brand-success' : 'text-gray-500'}`}
                            onClick={() => setActiveTab('control')}
                        >
                            2. Controlar
                        </button>
                    </div>
                    {activeTab === 'load' && (
                        <button
                            onClick={() => setShowScanner(true)}
                            className="w-full sm:w-auto px-4 py-2.5 bg-brand-blue text-white rounded-lg hover:bg-blue-700 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
                        >
                            <span>📷</span> Escanear OCR
                        </button>
                    )}
                </div>
            )}

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
                                        onChange={(e) => setScanInput(e.target.value)}
                                        className="w-full text-lg p-3 pr-24 border rounded-xl focus:ring-2 focus:ring-brand-blue outline-none bg-gray-50"
                                        placeholder="Escanear o escribir..."
                                        disabled={processing}
                                    />
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
                                <div className="flex-1 sm:w-24">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">
                                        Cant.
                                    </label>
                                    <input
                                        type="number"
                                        value={quantityInput}
                                        onChange={(e) => setQuantityInput(e.target.value)}
                                        className="w-full text-lg p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-blue bg-gray-50"
                                        min="0.1"
                                        step="any"
                                    />
                                </div>
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

            {/* Items List */}
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

            {showScanner && (
                <ReceiptScanner
                    onClose={() => setShowScanner(false)}
                    onScanComplete={handleScanComplete}
                />
            )}

            {isBarcodeReaderActive && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col">
                    <div className="p-4 bg-gray-900 flex justify-between items-center text-white">
                        <h3 className="font-bold">Escáner de Barcode</h3>
                        <button
                            onClick={() => setIsBarcodeReaderActive(false)}
                            className="px-4 py-2 bg-red-600 rounded-lg text-sm font-bold"
                        >
                            Cerrar
                        </button>
                    </div>
                    <div className="flex-1 relative">
                        <Scanner
                            onScan={handleBarcodeScan}
                            isEnabled={isBarcodeReaderActive}
                        />
                    </div>
                    <div className="p-6 bg-gray-900 text-center text-gray-400 text-sm">
                        Apunte al código de barras para escanear
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceiptDetailsPage;
