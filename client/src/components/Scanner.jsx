import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const Scanner = ({ onScan, isEnabled = true }) => {
    const scannerRef = useRef(null);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);
    const lastScannedCodeRef = useRef(null);
    const lastScannedTimeRef = useRef(0);

    // Configuration for high quality scanning
    const config = {
        fps: 15, // Lower FPS slightly to give more time for processing high-res frames
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            // Rectangular scanning area
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
                width: Math.floor(minEdge * 0.8),
                height: Math.floor(minEdge * 0.5) // Barcode shape
            };
        },
        aspectRatio: 1.0, // Force 1:1 aspect ratio for the container to fill properly
        disableFlip: false,
    };

    useEffect(() => {
        // Initialize scanner instance
        if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode("reader", {
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                },
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                ],
                verbose: false
            });
        }

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(err => console.error("Error stopping scanner on unmount", err));
            }
        };
    }, []);

    useEffect(() => {
        const startScanning = async () => {
            if (!scannerRef.current || isScanning || !isEnabled) return;

            try {
                setError(null);
                await scannerRef.current.start(
                    { facingMode: "environment" }, // Prefer back camera
                    {
                        fps: 15,
                        qrbox: { width: 300, height: 150 }, // Fixed px box for stability or function above
                        aspectRatio: window.innerWidth / window.innerHeight, // Match screen aspect to fill
                        videoConstraints: {
                            facingMode: "environment",
                            width: { min: 1280, ideal: 1920, max: 2560 }, // Request high resolution
                            height: { min: 720, ideal: 1080, max: 1440 },
                            focusMode: "continuous", // Crucial for barcode scanning
                        }
                    },
                    (decodedText, decodedResult) => {
                        const now = Date.now();
                        // Debounce duplicate scans
                        if (decodedText === lastScannedCodeRef.current && (now - lastScannedTimeRef.current) < 2000) {
                            return;
                        }

                        lastScannedCodeRef.current = decodedText;
                        lastScannedTimeRef.current = now;

                        console.log(`Code matched = ${decodedText}`, decodedResult);
                        onScan(decodedText);

                        // Optional: Visual feedback on successful scan could be added here
                    },
                    (errorMessage) => {
                        // console.log(errorMessage); // Ignore parse errors, they are common
                    }
                );
                setIsScanning(true);
            } catch (err) {
                console.error("Error starting scanner", err);
                setError("No se pudo acceder a la cámara. Verifique los permisos.");
                setIsScanning(false);
            }
        };

        const stopScanning = async () => {
            if (scannerRef.current && isScanning) {
                try {
                    await scannerRef.current.stop();
                    setIsScanning(false);
                } catch (err) {
                    console.error("Failed to stop scanner", err);
                }
            }
        };

        if (isEnabled) {
            // Small delay to ensure DOM is ready
            setTimeout(startScanning, 100);
        } else {
            stopScanning();
        }

        return () => {
            // Cleanup on dependency change handled by next effect execution or unmount
        };
    }, [isEnabled, onScan]);

    return (
        <div className="w-full h-full relative bg-black overflow-hidden group">
            <div id="reader" className="w-full h-full object-cover"></div>

            {/* Custom Overlay */}
            {isScanning && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    {/* Scanner Reticle */}
                    <div className="w-[80%] h-[30%] max-w-sm border-2 border-red-500 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] relative">
                        {/* Animated Scanning Line */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-scan-line"></div>

                        {/* Corner Markers */}
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-red-500 -mt-1 -ml-1"></div>
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-red-500 -mt-1 -mr-1"></div>
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-red-500 -mb-1 -ml-1"></div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-red-500 -mb-1 -mr-1"></div>
                    </div>
                    <p className="absolute bottom-10 text-white font-medium bg-black/50 px-4 py-2 rounded-full">
                        Apunta el código de barras
                    </p>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-6 text-center">
                    <div>
                        <svg className="w-12 h-12 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                        </svg>
                        <p className="text-lg font-bold mb-2">Error de Cámara</p>
                        <p className="text-sm text-gray-400">{error}</p>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes scan-line {
                    0% { top: 0; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan-line {
                    animation: scan-line 2s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default Scanner;
