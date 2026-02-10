import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

const Scanner = ({ onScan, isEnabled = true }) => {
    // Shared state
    const [isNative] = useState(Capacitor.isNativePlatform());
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);

    // Web-specific refs
    const scannerRef = useRef(null);
    const lastScannedCodeRef = useRef(null);
    const lastScannedTimeRef = useRef(0);

    // native cleanup function ref
    const stopNativeScanRef = useRef(null);

    // --- EFFECT: Lifecycle Management ---
    useEffect(() => {
        if (!isEnabled) {
            stopScanning();
            return;
        }

        // Slight delay to allow UI to settle
        const timer = setTimeout(() => {
            startScanning();
        }, 100);

        return () => {
            clearTimeout(timer);
            // On unmount/disable, stop everything
            stopScanning();
        };
    }, [isEnabled, isNative]);


    // --- FUNCTION: Start Scanning ---
    const startScanning = async () => {
        setError(null);

        if (isNative) {
            startNativeScan();
        } else {
            startWebScan();
        }
    };

    // --- FUNCTION: Stop Scanning ---
    const stopScanning = async () => {
        setIsScanning(false);

        if (isNative) {
            // For ML Kit, we usually just stop listening or the single-shot scan ends.
            // If using continuous scanning, we'd call stopScan.
            // For this implementation, we'll try to stop actively if running.
            try {
                await BarcodeScanner.stopScan();
            } catch (e) {
                // Ignore error if not scanning
            }
        } else {
            if (scannerRef.current && scannerRef.current.isScanning) {
                try {
                    await scannerRef.current.stop();
                } catch (err) {
                    console.warn("Failed to stop web scanner", err);
                }
            }
        }
    };

    // --- STRATEGY: Native (Capacitor ML Kit) ---
    const startNativeScan = async () => {
        try {
            // 1. Check/Request Permissions
            const status = await BarcodeScanner.checkPermissions();
            if (status.camera !== 'granted') {
                const request = await BarcodeScanner.requestPermissions();
                if (request.camera !== 'granted') {
                    setError("Permiso de cámara denegado.");
                    return;
                }
            }

            // 2. Ensure Module is Installed (Android specific)
            if (Capacitor.getPlatform() === 'android') {
                try {
                    await BarcodeScanner.installGoogleBarcodeScannerModule();
                } catch (installErr) {
                    if (installErr.message?.includes('already installed')) {
                        console.warn('Google Barcode Scanner Module ya estaba instalado.');
                    } else {
                        throw installErr;
                    }
                }
            }

            // 3. Start Scanning
            setIsScanning(true);
            document.body.classList.add('barcode-scanner-active'); // Helper for transparency if needed

            // We use 'scan' which typically opens a full-screen view or overlays.
            // Note: ML Kit plugin 'scan' might be a one-off. For continuous, usage patterns vary.
            // Let's implement single scan loop or continuous listener if supported.
            // The @capacitor-mlkit/barcode-scanning typical 'scan' method opens a camera view.

            const { barcodes } = await BarcodeScanner.scan({
                formats: [
                    'QR_CODE', 'EAN_13', 'EAN_8', 'CODE_128', 'UPC_A', 'UPC_E'
                ]
            });

            if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                handleScanSuccess(code);
            }

            // Native scanner often auto-closes after scan. 
            // If we want continuous, we'd loop.
            // For now, let's assume one scan per trigger, or restart.
            // But 'RemitoForm' expects continuous scanning roughly.
            // If the native UI closes, we might need to restart it.
            // Let's wait for the first scan and see.

            setIsScanning(false);
            document.body.classList.remove('barcode-scanner-active');

        } catch (err) {
            console.error("Native scan error:", err);
            // Often "Canceled" if user backs out
            if (!err.message.includes('canceled')) {
                setError("Error en scanner nativo: " + err.message);
            }
            setIsScanning(false);
            document.body.classList.remove('barcode-scanner-active');
        }
    };

    // --- STRATEGY: Web (Html5Qrcode) ---
    const startWebScan = async () => {
        if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode("reader", {
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                verbose: false
            });
        }

        try {
            await scannerRef.current.start(
                { facingMode: "environment" },
                {
                    fps: 15,
                    qrbox: { width: 300, height: 150 },
                    videoConstraints: {
                        facingMode: "environment",
                        width: { min: 1280, ideal: 3840, max: 4096 },
                        height: { min: 720, ideal: 2160, max: 4096 },
                        focusMode: "continuous",
                        advanced: [{ zoom: 2.0 }]
                    }
                },
                (decodedText) => handleScanSuccess(decodedText),
                () => { } // Ignore frame errors
            );
            setIsScanning(true);
        } catch (err) {
            console.error("Web scan error", err);
            setError("No se pudo acceder a la cámara Web.");
            setIsScanning(false);
        }
    };

    // --- SHARED: Handle Success ---
    const handleScanSuccess = (code) => {
        const now = Date.now();
        // Debounce
        if (code === lastScannedCodeRef.current && (now - lastScannedTimeRef.current) < 2000) {
            return;
        }
        lastScannedCodeRef.current = code;
        lastScannedTimeRef.current = now;

        console.log("Scanned:", code);
        onScan(code);

        // If native, we might want to restart scanning immediately if we want "continuous" feel?
        // But usually native UI closes. 
        // For this use case, let's keep it simple: One scan, then maybe user has to tap "Scan" again?
        // Or we re-trigger. Let's re-trigger if it was native and we are still enabled.
        if (isNative && isEnabled) {
            // Optional: Add small delay or just restart
            // startNativeScan(); 
            // BEWARE: Infinite loops if not careful.
            // Actually, the native plugin often has a UI. If it closes, we are "done".
            // RemitoForm stays "isScanning=true" until user stops.
            // So we should restart.
            setTimeout(startNativeScan, 500);
        }
    };

    return (
        <div className="w-full h-full relative bg-black overflow-hidden group">
            {/* WEB SCANNER CONTAINER */}
            {!isNative && <div id="reader" className="w-full h-full object-cover"></div>}

            {/* NATIVE PLACEHOLDER / UI */}
            {isNative && (
                <div className="flex flex-col items-center justify-center h-full text-white p-4">
                    <p className="mb-4 text-center">Modo Nativo</p>
                    <button
                        onClick={startNativeScan}
                        className="bg-brand-blue px-6 py-3 rounded-full font-bold shadow-lg active:scale-95 transition"
                    >
                        {isScanning ? 'Escáner Activo...' : 'Activar Cámara'}
                    </button>
                    <p className="text-xs text-gray-400 mt-4 max-w-xs text-center">
                        Si la cámara no se abre automáticamente, pulsa el botón.
                    </p>
                </div>
            )}

            {/* Custom Overlay (Only for Web, usually native has its own or we hide it) */}
            {!isNative && isScanning && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[80%] h-[30%] max-w-sm border-2 border-red-500 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-scan-line"></div>
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-red-500 -mt-1 -ml-1"></div>
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-red-500 -mt-1 -mr-1"></div>
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-red-500 -mb-1 -ml-1"></div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-red-500 -mb-1 -mr-1"></div>
                    </div>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-6 text-center z-50">
                    <div>
                        <svg className="w-12 h-12 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                        </svg>
                        <p className="text-lg font-bold mb-2">Error</p>
                        <p className="text-sm text-gray-400">{error}</p>
                        {isNative && <button onClick={startNativeScan} className="mt-4 px-4 py-2 bg-gray-700 rounded text-sm hover:bg-gray-600">Reintentar</button>}
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
                :global(#reader video) {
                    object-fit: cover !important;
                    width: 100% !important;
                    height: 100% !important;
                    border-radius: 0 !important;
                }
                :global(body.barcode-scanner-active) {
                    background: transparent !important;
                }
            `}</style>
        </div>
    );
};

export default Scanner;
