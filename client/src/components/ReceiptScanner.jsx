import React, { useState, useEffect } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import Tesseract from 'tesseract.js';
import { toast } from 'sonner';

const ReceiptScanner = ({ onScanComplete, onClose }) => {
    const [parsedItems, setParsedItems] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);

    const startScan = async (sourceType) => {
        setIsScanning(true);
        setError(null);
        setProgress(0);
        try {
            // Check permissions only if using Camera
            if (sourceType === CameraSource.Camera) {
                const permissions = await Camera.checkPermissions();
                if (permissions.camera !== 'granted') {
                    const request = await Camera.requestPermissions();
                    if (request.camera !== 'granted') {
                        throw new Error('Permisos de cámara denegados. Por favor habilítelos en la configuración.');
                    }
                }
            }

            const photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: true,
                resultType: CameraResultType.Uri,
                source: sourceType
            });

            if (photo.webPath) {
                const result = await Tesseract.recognize(
                    photo.webPath,
                    'eng',
                    {
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                setProgress(parseInt(m.progress * 100));
                            }
                        }
                    }
                );

                const text = result.data.text;

                if (text && text.trim().length > 0) {
                    parseReceiptText(text);
                } else {
                    toast.info('No se detectó texto en la imagen');
                    setError('No se pudo leer texto en la imagen seleccionada.');
                }
            }

        } catch (error) {
            console.error('Error al escanear:', error);
            if (error.message && error.message.includes('cancelled')) {
                // User cancelled
            } else {
                toast.error(`Error: ${error.message}`);
                setError(error.message || 'Error desconocido al procesar imagen');
            }
        } finally {
            setIsScanning(false);
        }
    };

    const parseReceiptText = (text) => {
        const lines = text.split('\n');
        const items = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            // Log line for debugging
            console.log('Processing line:', trimmed);

            // Strategy 1: "Remito" format -> Code (digits) | Quantity (number) | ... | Description
            // Regex: Start with digits (Code), space, number (Qty), space, rest
            const remitoMatch = trimmed.match(/^(\d+)\s+(\d+(?:[.,]\d+)?)\s+(.*)/);

            if (remitoMatch) {
                const code = remitoMatch[1];
                const rawQty = remitoMatch[2].replace(',', '.');
                const qty = parseFloat(rawQty);
                let description = remitoMatch[3].trim();

                // Clean up description: remove "BULTOS" and "CAPACID." columns if they exist (usually just numbers)
                // Example: "3 4 CETOL..." -> Remove "3 4"
                description = description.replace(/^[\d\s.,]+/, '').trim();

                if (code.length >= 3 && qty < 10000 && description.length > 2) {
                    items.push({
                        original: trimmed,
                        code: code,
                        quantity: qty,
                        description: description
                    });
                    return; // Match found, skip fallback
                }
            }

            // Strategy 2: Fallback (Old Logic) - Quantity first
            // Only use this if the first strategy didn't produce a valid item
            // Regex: Starts with number (quantity), then text
            const quantityStartMatch = trimmed.match(/^(\d+(\.\d+)?)\s+(.*)/);

            if (quantityStartMatch) {
                const qty = parseFloat(quantityStartMatch[1]);
                const rest = quantityStartMatch[3].trim();
                // Heuristic: If "rest" starts with a long number, maybe THAT is the code? 
                // But for now, let's keep it simple.
                if (qty < 10000 && rest.length > 2) {
                    // Check if this looks like a Remito line that failed the first regex?
                    // Unlikely if the first regex is broad enough for "digits space digits".

                    // Only add if we are desperate or sure it's not a misread Remito line
                    // For now, let's skip adding it if it looks like a Code (large integer)
                    if (qty > 1000) {
                        // Likely a code, not a quantity
                        return;
                    }

                    items.push({
                        original: trimmed,
                        code: rest.split(' ')[0],
                        quantity: qty,
                        description: rest
                    });
                }
            }
        });

        console.log('Parsed items:', items);

        if (items.length > 0) {
            setParsedItems(items);
        } else {
            toast.error('No se encontraron items válidos.');
            setError('No se detectaron productos. Asegúrese de que la imagen sea legible y tenga el formato: Código Cantidad Descripción');
        }
    };

    const handleConfirm = () => {
        onScanComplete(parsedItems);
        onClose();
    };

    if (isScanning) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-lg font-medium">Procesando imagen...</p>
                    <p className="text-sm text-gray-500 mt-2">{progress}% completado</p>
                </div>
            </div>
        );
    }

    if (parsedItems.length > 0) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                <div className="bg-white p-4 rounded-lg w-full max-w-lg h-[90vh] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">Confirmar Items</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            ✕
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <div className="space-y-2">
                            {parsedItems.map((item, index) => (
                                <div key={index} className="flex gap-2 items-center bg-gray-100 p-2 rounded">
                                    <input
                                        type="text"
                                        value={item.code}
                                        className="border p-1 w-24 text-sm"
                                        onChange={(e) => {
                                            const newItems = [...parsedItems];
                                            newItems[index].code = e.target.value;
                                            setParsedItems(newItems);
                                        }}
                                        placeholder="Código"
                                    />
                                    <input
                                        type="number"
                                        value={item.quantity}
                                        className="border p-1 w-16 text-sm"
                                        onChange={(e) => {
                                            const newItems = [...parsedItems];
                                            newItems[index].quantity = parseFloat(e.target.value);
                                            setParsedItems(newItems);
                                        }}
                                        placeholder="Cant"
                                    />
                                    <div className="flex-1 text-xs text-gray-500 truncate">
                                        {item.description}
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newItems = parsedItems.filter((_, i) => i !== index);
                                            setParsedItems(newItems);
                                        }}
                                        className="text-red-500 hover:text-red-700"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                        <button
                            onClick={() => setParsedItems([])}
                            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                            Reintentar
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold flex-1"
                        >
                            Importar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-full max-w-sm text-center">
                <h2 className="text-xl font-bold mb-6">Escanear Remito</h2>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={() => startScan(CameraSource.Camera)}
                        className="w-full py-4 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 flex items-center justify-center gap-3 text-lg font-medium"
                    >
                        <span>📸</span> Cámara
                    </button>
                    <button
                        onClick={() => startScan(CameraSource.Photos)}
                        className="w-full py-4 bg-purple-600 text-white rounded-lg shadow hover:bg-purple-700 flex items-center justify-center gap-3 text-lg font-medium"
                    >
                        <span>🖼️</span> Galería
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-2 text-gray-500 hover:text-gray-700 mt-4"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReceiptScanner;
