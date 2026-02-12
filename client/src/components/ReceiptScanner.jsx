import React, { useState, useEffect } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { toast } from 'sonner';

const ReceiptScanner = ({ onScanComplete, onClose }) => {
    const [capturedImages, setCapturedImages] = useState([]); // Array of { base64, format }
    const [parsedItems, setParsedItems] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);

    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const startScan = async () => {
        setIsScanning(true);
        setError(null);
        try {
            const permissions = await Camera.checkPermissions();
            if (permissions.camera !== 'granted') {
                const request = await Camera.requestPermissions();
                if (request.camera !== 'granted') {
                    throw new Error('Permisos de cámara denegados.');
                }
            }

            const photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source: CameraSource.Camera
            });

            if (photo.base64String) {
                setCapturedImages(prev => [...prev, {
                    base64: photo.base64String,
                    format: photo.format
                }]);
            }
        } catch (error) {
            console.error('Error al capturar:', error);
            if (error.message && !error.message.includes('cancelled')) {
                toast.error(`Error: ${error.message}`);
            }
        } finally {
            setIsScanning(false);
        }
    };

    const pickGalleryImages = async () => {
        setIsScanning(true);
        setError(null);
        try {
            const result = await Camera.pickImages({
                quality: 90
            });

            if (result.photos && result.photos.length > 0) {
                const newImages = [];
                for (const photo of result.photos) {
                    const response = await fetch(photo.webPath);
                    const blob = await response.blob();
                    const base64 = await blobToBase64(blob);
                    newImages.push({
                        base64: base64,
                        format: photo.format
                    });
                }
                setCapturedImages(prev => [...prev, ...newImages]);
            }
        } catch (error) {
            console.error('Error al seleccionar de galería:', error);
            if (error.message && !error.message.includes('cancelled')) {
                toast.error(`Error: ${error.message}`);
            }
        } finally {
            setIsScanning(false);
        }
    };

    const processImages = async () => {
        if (capturedImages.length === 0) return;

        setIsProcessing(true);
        setError(null);
        setProgress(10);

        try {
            const api = (await import('../api')).default;
            const allItems = [];

            for (let i = 0; i < capturedImages.length; i++) {
                const img = capturedImages[i];
                const currentProgress = Math.round(10 + (i / capturedImages.length) * 80);
                setProgress(currentProgress);

                toast.info(`Procesando página ${i + 1} de ${capturedImages.length}...`);

                const blob = await (await fetch(`data:image/${img.format};base64,${img.base64}`)).blob();
                const formData = new FormData();
                formData.append('image', blob, `página_${i + 1}.${img.format}`);

                const response = await api.post('/api/ai/parse-image', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (response.data && response.data.length > 0) {
                    allItems.push(...response.data);
                }
            }

            if (allItems.length > 0) {
                setParsedItems(allItems);
                toast.success('Escaneo de todas las páginas completado');
                setProgress(100);
            } else {
                toast.info('No se detectaron productos en las imágenes');
                setError('No se pudo extraer información de los remitos.');
            }
        } catch (error) {
            console.error('Error al procesar con IA:', error);
            toast.error(`Error en procesamiento: ${error.message}`);
            setError('Error al analizar las imágenes con IA.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirm = () => {
        onScanComplete(parsedItems);
        onClose();
    };

    if (isProcessing) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-white p-6 rounded-lg shadow-xl text-center w-full max-w-sm">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-lg font-bold">Analizando con IA</p>
                    <p className="text-sm text-gray-500 mt-1">Página {Math.floor((progress - 10) / 80 * capturedImages.length) + 1} de {capturedImages.length}</p>

                    <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                        <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            </div>
        );
    }

    if (parsedItems.length > 0) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-lg h-[90vh] flex flex-col shadow-2xl">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                        <h2 className="text-xl font-bold">Confirmar Items ({parsedItems.length})</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-1">
                            ✕
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto p-4">
                        <div className="space-y-3">
                            {parsedItems.map((item, index) => (
                                <div key={index} className="flex gap-2 items-center bg-white border p-3 rounded-lg shadow-sm">
                                    <div className="flex-1">
                                        <div className="flex gap-2 mb-1">
                                            <input
                                                type="text"
                                                value={item.code}
                                                className="border rounded px-2 py-1 w-28 text-sm font-mono"
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
                                                className="border rounded px-2 py-1 w-20 text-sm font-bold"
                                                onChange={(e) => {
                                                    const newItems = [...parsedItems];
                                                    newItems[index].quantity = parseFloat(e.target.value);
                                                    setParsedItems(newItems);
                                                }}
                                                placeholder="Cant"
                                            />
                                        </div>
                                        <div className="text-xs text-gray-600 italic truncate" title={item.description}>
                                            {item.description}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newItems = parsedItems.filter((_, i) => i !== index);
                                            setParsedItems(newItems);
                                        }}
                                        className="text-red-400 hover:text-red-600 p-2"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 border-t bg-gray-50 rounded-b-lg flex gap-3">
                        <button
                            onClick={() => setParsedItems([])}
                            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            Reintentar
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg transition-colors"
                        >
                            Importar Items
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                <div className="p-6 text-center">
                    <h2 className="text-2xl font-black mb-2">Escanear Remito</h2>
                    <p className="text-sm text-gray-500 mb-6">Puedes capturar varias páginas antes de procesar</p>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-2">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    {/* Thumbnails of captured images */}
                    {capturedImages.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
                            {capturedImages.map((img, idx) => (
                                <div key={idx} className="relative flex-shrink-0">
                                    <img
                                        src={`data:image/${img.format};base64,${img.base64}`}
                                        className="h-20 w-16 object-cover rounded-lg border-2 border-blue-100"
                                        alt={`pág ${idx + 1}`}
                                    />
                                    <button
                                        onClick={() => setCapturedImages(prev => prev.filter((_, i) => i !== idx))}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md"
                                    >
                                        ✕
                                    </button>
                                    <span className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-[10px] px-1 rounded">
                                        p.{idx + 1}
                                    </span>
                                </div>
                            ))}
                            <button
                                onClick={startScan}
                                className="h-20 w-16 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all"
                            >
                                <span className="text-xl">+</span>
                                <span className="text-[10px]">Añadir</span>
                            </button>
                        </div>
                    )}

                    <div className="space-y-3">
                        {capturedImages.length === 0 ? (
                            <>
                                <button
                                    onClick={startScan}
                                    className="w-full py-4 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 flex items-center justify-center gap-3 text-lg font-bold transition-transform active:scale-95"
                                >
                                    <span>📸</span> Usar Cámara
                                </button>
                                <button
                                    onClick={pickGalleryImages}
                                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 flex items-center justify-center gap-3 font-medium transition-colors"
                                >
                                    <span>🖼️</span> Galería de Fotos
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={processImages}
                                disabled={isProcessing}
                                className="w-full py-4 bg-green-600 text-white rounded-xl shadow-lg hover:bg-green-700 flex items-center justify-center gap-3 text-lg font-bold transition-all active:scale-95"
                            >
                                <span>✨</span> Procesar {capturedImages.length} {capturedImages.length === 1 ? 'Página' : 'Páginas'}
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="w-full py-2 text-gray-400 hover:text-gray-600 transition-colors text-sm font-medium pt-2"
                        >
                            Cerrar escáner
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReceiptScanner;
