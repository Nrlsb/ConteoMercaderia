import React, { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { toast } from 'sonner';

const ReceiptScanner = ({ onScanComplete, onClose }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [scannedText, setScannedText] = useState('');
    const [parsedItems, setParsedItems] = useState([]);

    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
        };
    }, []);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (error) {
            console.error('Error accessing camera:', error);
            toast.error('No se pudo acceder a la cámara');
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const captureImage = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = canvas.toDataURL('image/png');
            processImage(imageData);
        }
    };

    const processImage = async (imageData) => {
        setIsProcessing(true);
        try {
            const result = await Tesseract.recognize(
                imageData,
                'eng', // Using English as default, can be changed to 'spa' if needed
                {
                    logger: m => console.log(m)
                }
            );

            const text = result.data.text;
            setScannedText(text);
            parseReceiptText(text);
        } catch (error) {
            console.error('OCR Error:', error);
            toast.error('Error al procesar la imagen');
        } finally {
            setIsProcessing(false);
        }
    };

    const parseReceiptText = (text) => {
        // Basic heuristic to find lines with numbers (quantity) and text (code/desc)
        // This is highly dependent on receipt format.
        // For now, checks for lines that look like: "CODE 123" or "10 x PRODUCT"
        const lines = text.split('\n');
        const items = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            // Simple regex to find a number (quantity) and alphanumeric string (code)
            // Example pattern: [Quantity] [Code] or [Code] [Quantity]
            // This is a placeholder logic and needs refinement based on real receipts
            const quantityMatch = trimmed.match(/(\d+(\.\d+)?)/);

            if (quantityMatch) {
                // Assuming the number found is quantity if it's small, or part of code if large?
                // Let's take a naive approach: First number is quantity, rest is code/desc
                const qty = parseFloat(quantityMatch[0]);
                const potentialCode = trimmed.replace(quantityMatch[0], '').trim();

                // Filter out short noise
                if (potentialCode.length > 3) {
                    items.push({
                        original: trimmed,
                        code: potentialCode.split(' ')[0], // Take first word as code
                        quantity: qty,
                        description: potentialCode
                    });
                }
            }
        });

        setParsedItems(items);
    };

    const handleConfirm = () => {
        onScanComplete(parsedItems);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded-lg w-full max-w-lg h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Escanear Remito</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-auto">
                    {!scannedText ? (
                        <div className="relative bg-black rounded-lg overflow-hidden h-64 md:h-96">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                            />
                            <canvas ref={canvasRef} className="hidden" />
                            {isProcessing && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
                                    Procesando...
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="mt-4">
                            <h3 className="font-bold mb-2">Items Detectados</h3>
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
                                        />
                                        <input
                                            type="text"
                                            value={item.description}
                                            className="border p-1 flex-1 text-sm bg-gray-50 text-gray-500"
                                            readOnly
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button
                                    onClick={() => {
                                        setScannedText('');
                                        setParsedItems([]);
                                    }}
                                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                                >
                                    Reintentar
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold flex-1"
                                >
                                    Importar Seleccionados
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {!scannedText && (
                    <div className="mt-4 flex justify-center">
                        <button
                            onClick={captureImage}
                            disabled={isProcessing}
                            className="bg-blue-600 rounded-full p-4 hover:bg-blue-700 disabled:opacity-50"
                        >
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReceiptScanner;
