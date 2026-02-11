import React, { useState, useEffect } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Ocr, TextDetections } from '@capacitor-community/image-to-text';
import { toast } from 'sonner';

const ReceiptScanner = ({ onScanComplete, onClose }) => {
    const [parsedItems, setParsedItems] = useState([]);
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        startScan();
    }, []);

    const startScan = async () => {
        setIsScanning(true);
        try {
            const photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: true,
                resultType: CameraResultType.Uri,
                source: CameraSource.Camera
            });

            if (photo.path) {
                const data = await Ocr.detectText({ filename: photo.path });

                if (data.textDetections && data.textDetections.length > 0) {
                    // Join all text detections into a single string for parsing
                    const fullText = data.textDetections.map(d => d.text).join('\n');
                    parseReceiptText(fullText);
                } else {
                    toast.info('No se detectó texto en la imagen');
                    onClose();
                }
            } else {
                onClose();
            }

        } catch (error) {
            console.error('Error al escanear:', error);
            // Verify if error is "User cancelled photos app"
            if (error.message !== 'User cancelled photos app') {
                toast.error('Error al acceder a la cámara o procesar imagen');
            }
            onClose();
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

            // Simple regex to find a number (quantity) and alphanumeric string (code)
            const quantityMatch = trimmed.match(/(\d+(\.\d+)?)/);

            if (quantityMatch) {
                const qty = parseFloat(quantityMatch[0]);
                const potentialCode = trimmed.replace(quantityMatch[0], '').trim();

                // Filter out short noise and unrealistic quantities
                if (potentialCode.length > 3 && qty < 10000) {
                    items.push({
                        original: trimmed,
                        code: potentialCode.split(' ')[0], // Take first word as code
                        quantity: qty,
                        description: potentialCode
                    });
                }
            }
        });

        // If items found, set them for review, otherwise close or retry
        if (items.length > 0) {
            setParsedItems(items);
        } else {
            toast.error('No se encontraron items válidos. Intente acercar más la cámara.');
            onClose();
        }
    };

    const handleConfirm = () => {
        onScanComplete(parsedItems);
        onClose();
    };

    if (isScanning) {
        return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 text-white">Abriendo cámara...</div>;
    }

    if (parsedItems.length === 0) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded-lg w-full max-w-lg h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Confirmar Items Escaneados</h2>
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
                                <input
                                    type="text"
                                    value={item.description}
                                    className="border p-1 flex-1 text-sm bg-gray-50 text-gray-500"
                                    readOnly
                                />
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
                        onClick={startScan}
                        className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                        Escanear de nuevo
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold flex-1"
                    >
                        Importar {parsedItems.length} Items
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReceiptScanner;
