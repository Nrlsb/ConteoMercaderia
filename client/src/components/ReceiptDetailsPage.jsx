
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
        <div className="container mx-auto p-4">
            {/* Header */}
            <div className="bg-white p-4 rounded shadow mb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold">Remito: {receipt.remito_number}</h1>
                    <div className="text-sm text-gray-600">
                        Estado: <span className={receipt.status === 'finalized' ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}>
                            {receipt.status === 'finalized' ? 'FINALIZADO' : 'ABIERTO'}
                        </span>
                    </div>
                </div>
                {receipt.status !== 'finalized' && (
                    <button
                        onClick={handleFinalize}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
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
                <div className="flex mb-4 bg-gray-200 p-1 rounded">
                    <button
                        className={`flex-1 py-2 rounded font-medium ${activeTab === 'load' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}
                        onClick={() => setActiveTab('load')}
                    >
                        1. Cargar Remito (Proveedor)
                    </button>
                    {activeTab === 'load' && (
                        <button
                            onClick={() => setShowScanner(true)}
                            className="ml-2 px-3 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 text-sm font-bold flex items-center gap-1"
                        >
                            📷 Escanear (OCR)
                        </button>
                    )}
                    <button
                        className={`flex-1 py-2 rounded font-medium ${activeTab === 'control' ? 'bg-white shadow text-green-700' : 'text-gray-600'}`}
                        onClick={() => setActiveTab('control')}
                    >
                        2. Controlar (Físico)
                    </button>
                </div>
            )}

            {/* Input Area */}
            {receipt.status !== 'finalized' && (
                <div className="bg-white p-4 rounded shadow mb-4">
                    <form onSubmit={handleScan} className="flex gap-2 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {activeTab === 'load' ? 'Escanear Código de Proveedor' : 'Escanear Producto (Interno/Prov)'}
                            </label>
                            <div className="relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={scanInput}
                                    onChange={(e) => setScanInput(e.target.value)}
                                    className="w-full text-lg p-2 pr-20 border rounded focus:ring-2 focus:ring-blue-500"
                                    placeholder="Escanear..."
                                    disabled={processing}
                                />
                                <div className="absolute inset-y-0 right-0 flex items-center pr-1 gap-1">
                                    <button
                                        type="button"
                                        onClick={handleVoiceSearch}
                                        className={`p-1.5 rounded-full transition-colors focus:outline-none ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                        title="Buscar por voz"
                                    >
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsBarcodeReaderActive(true)}
                                        className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none"
                                        title="Escanear con cámara"
                                    >
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="w-24">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Cantidad
                            </label>
                            <input
                                type="number"
                                value={quantityInput}
                                onChange={(e) => setQuantityInput(e.target.value)}
                                className="w-full text-lg p-2 border rounded"
                                min="0.1"
                                step="any"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={processing}
                            className={`px-6 py-2 h-[46px] rounded text-white font-bold ${activeTab === 'load' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                        >
                            {processing ? '...' : 'OK'}
                        </button>
                    </form>
                    <div className="text-xs text-gray-500 mt-2">
                        {activeTab === 'load'
                            ? 'Escanea el código que figura en el remito del proveedor para agregar a la lista de "Esperado".'
                            : 'Escanea el producto físico para confirmar su recepción.'}
                    </div>
                </div>
            )}

            {/* Items List */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Esperado</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Escaneado</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {items
                                .sort((a, b) => {
                                    // Sort by remaining (issues first) or recent
                                    const diffA = a.expected_quantity - a.scanned_quantity;
                                    const diffB = b.expected_quantity - b.scanned_quantity;
                                    return diffB - diffA; // High discrepancies first
                                })
                                .slice(0, visibleItems)
                                .map((item) => {
                                    const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
                                    let statusColor = 'bg-gray-100 text-gray-800';
                                    if (item.scanned_quantity === 0) statusColor = 'bg-red-100 text-red-800'; // Not started
                                    else if (diff === 0) statusColor = 'bg-green-100 text-green-800'; // Perfect
                                    else if (diff > 0) statusColor = 'bg-yellow-100 text-yellow-800'; // Missing
                                    else if (diff < 0) statusColor = 'bg-orange-100 text-orange-800'; // Over

                                    return (
                                        <tr key={item.id}>
                                            <td className="px-4 py-2">
                                                <div className="text-sm font-medium text-gray-900">{item.products?.description || 'Sin descripción'}</div>
                                                <div className="text-xs text-gray-500">
                                                    Int: {item.product_code} | Prov: {item.products?.provider_code || '-'}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-900 font-bold">{item.expected_quantity}</td>
                                            <td className="px-4 py-2 text-sm text-gray-900 font-bold">{item.scanned_quantity}</td>
                                            <td className="px-4 py-2 text-sm">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}`}>
                                                    {diff === 0 ? 'OK' : diff > 0 ? `Faltan ${diff}` : `Sobran ${Math.abs(diff)}`}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                                        No hay items cargados aún. Comienza escaneando en la pestaña "Cargar Remito".
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {items.length > visibleItems && (
                        <div className="p-4 text-center border-t">
                            <button
                                onClick={() => setVisibleItems(prev => prev + 20)}
                                className="text-blue-600 font-semibold hover:text-blue-800 text-sm"
                            >
                                Mostrar más ({items.length - visibleItems} restantes)
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
        </div>
    );
};

export default ReceiptDetailsPage;
