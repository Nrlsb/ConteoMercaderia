import React, { useState, useEffect } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { toast } from 'sonner';

const ReceiptScanner = ({ onScanComplete, onClose }) => {
    const [parsedItems, setParsedItems] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);

    const startScan = async (sourceType) => {
        setIsScanning(true);
        setError(null);
        setProgress(20); // Simular inicio de carga
        try {
            // Check permissions only if using Camera
            if (sourceType === CameraSource.Camera) {
                const permissions = await Camera.checkPermissions();
                if (permissions.camera !== 'granted') {
                    const request = await Camera.requestPermissions();
                    if (request.camera !== 'granted') {
                        throw new Error('Permisos de cámara denegados.');
                    }
                }
            }

            const photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Base64, // Cambiado a Base64 para envío directo
                source: sourceType
            });

            if (photo.base64String) {
                setProgress(50);
                toast.info('Analizando con IA de alta precisión...');

                const api = (await import('../api')).default;

                // Crear FormData para enviar la imagen
                const blob = await (await fetch(`data:image/${photo.format};base64,${photo.base64String}`)).blob();
                const formData = new FormData();
                formData.append('image', blob, `remito.${photo.format}`);

                const response = await api.post('/api/ai/parse-image', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });

                if (response.data && response.data.length > 0) {
                    setParsedItems(response.data);
                    toast.success('Escaneo completado correctamente');
                    setProgress(100);
                } else {
                    toast.info('No se detectaron productos en la imagen');
                    setError('No se pudo extraer información clara del remito.');
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
