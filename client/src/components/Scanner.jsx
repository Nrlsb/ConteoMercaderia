import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Helper: Siempre limpiar las clases CSS del escáner
const cleanupScannerCSS = () => {
    document.body.classList.remove('barcode-scanner-active');
    document.documentElement.classList.remove('barcode-scanner-active');
};

const Scanner = ({ onScan, onCancel, isEnabled = true }) => {
    // Shared state
    const [isNative] = useState(Capacitor.isNativePlatform());
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);

    // Native: almacena el último código detectado en tiempo real
    const [detectedCode, setDetectedCode] = useState(null);
    const detectedCodeRef = useRef(null);

    // Flash state
    const [torchOn, setTorchOn] = useState(false);

    // Web-specific refs
    const scannerRef = useRef(null);
    const lastScannedCodeRef = useRef(null);
    const lastScannedTimeRef = useRef(0);

    // native references
    const moduleCheckedRef = useRef(false);
    const nativeScanActiveRef = useRef(false);

    // --- REF: Track enabled state for async callbacks ---
    const isEnabledRef = useRef(isEnabled);
    const restartTimerRef = useRef(null);

    useEffect(() => {
        isEnabledRef.current = isEnabled;
    }, [isEnabled]);

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
            // On unmount/disable, stop everything and ALWAYS clean CSS
            stopScanning();
            cleanupScannerCSS();
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
    // skipCSSCleanup: si es true, NO limpia las clases CSS (se delegará al useEffect cleanup)
    const stopScanning = async (skipCSSCleanup = false) => {
        setIsScanning(false);
        setDetectedCode(null);
        detectedCodeRef.current = null;
        setTorchOn(false);

        if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current);
            restartTimerRef.current = null;
        }

        if (isNative) {
            try {
                await BarcodeScanner.removeAllListeners();
                await BarcodeScanner.stopScan();
            } catch (e) {
                // Ignore error if not scanning
            }
            nativeScanActiveRef.current = false;
            // Solo limpiar CSS aquí si NO se delega al useEffect (ej: stopScanning normal)
            if (!skipCSSCleanup) {
                cleanupScannerCSS();
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

    // --- STRATEGY: Native (Capacitor ML Kit) con startScan() ---
    const startNativeScan = async () => {
        try {
            // 1. Check/Request Permissions
            const status = await BarcodeScanner.checkPermissions();
            if (status.camera !== 'granted') {
                const request = await BarcodeScanner.requestPermissions();
                if (request.camera !== 'granted') {
                    setError("Permiso de cámara denegado.");
                    if (onCancel) onCancel();
                    return;
                }
            }

            // 2. Ensure Module is Installed (Android specific)
            if (Capacitor.getPlatform() === 'android' && !moduleCheckedRef.current) {
                try {
                    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
                    if (!available) {
                        console.info('Instalando módulo de Google Barcode Scanner...');
                        await BarcodeScanner.installGoogleBarcodeScannerModule();
                    }
                    moduleCheckedRef.current = true;
                } catch (installErr) {
                    console.warn('Error al verificar/instalar módulo:', installErr);
                    moduleCheckedRef.current = true;
                }
            }

            // 3. Hacer el fondo transparente para que se vea la cámara
            document.body.classList.add('barcode-scanner-active');
            document.documentElement.classList.add('barcode-scanner-active');

            // 4. Agregar listener para códigos detectados
            await BarcodeScanner.addListener('barcodeScanned', (result) => {
                if (result.barcode && result.barcode.rawValue) {
                    const code = result.barcode.rawValue;
                    detectedCodeRef.current = code;
                    setDetectedCode(code);
                }
            });

            // 5. Iniciar escaneo continuo (la cámara se ve detrás de la WebView)
            await BarcodeScanner.startScan({
                formats: [
                    'QR_CODE', 'EAN_13', 'EAN_8', 'CODE_128', 'UPC_A', 'UPC_E'
                ]
            });

            nativeScanActiveRef.current = true;
            setIsScanning(true);

        } catch (err) {
            console.error("Native scan error:", err);
            if (!err?.message?.toLowerCase().includes('canceled')) {
                setError("Error en scanner nativo: " + err.message);
            }
            setIsScanning(false);
            cleanupScannerCSS();
            if (onCancel) onCancel();
        }
    };

    // --- NATIVE: Confirmar captura (botón de disparo manual) ---
    const handleNativeCapture = useCallback(async () => {
        const code = detectedCodeRef.current;
        if (!code) return;

        // Detener el escaneo PRIMERO y esperar
        await stopScanning();

        // Procesar el código capturado
        handleScanSuccess(code);
    }, []);

    // --- NATIVE: Cancelar escaneo ---
    const handleNativeCancel = useCallback(async () => {
        // Detener el scanner nativo SIN limpiar CSS (skipCSSCleanup=true)
        // El padre recibirá onCancel, desmontará su envoltoria Y este componente,
        // y el useEffect cleanup se encargará de limpiar las clases CSS.
        // Esto evita que la envoltoria del padre (con fondo negro/blanco) se muestre
        // brevemente antes de desmontarse.
        try {
            await BarcodeScanner.removeAllListeners();
            await BarcodeScanner.stopScan();
        } catch (e) {
            // Ignore
        }
        nativeScanActiveRef.current = false;
        setIsScanning(false);
        // Llamar al padre INMEDIATAMENTE para que desmonte todo
        if (onCancel) onCancel();
        // Las clases CSS se limpiarán en el useEffect cleanup del desmontaje
    }, [onCancel]);

    // --- NATIVE: Toggle Flash/Torch ---
    const handleToggleTorch = useCallback(async () => {
        try {
            await BarcodeScanner.toggleTorch();
            setTorchOn(prev => !prev);
        } catch (e) {
            console.warn('Error toggling torch:', e);
        }
    }, []);

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
        // --- Provide User Feedback (Beep & Vibrate) ---
        try {
            if (isNative) {
                Haptics.impact({ style: ImpactStyle.Heavy });
            }
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx) {
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

                oscillator.start(audioCtx.currentTime);
                oscillator.stop(audioCtx.currentTime + 0.1);
            }
        } catch (e) {
            console.log("Feedback error", e);
        }

        // Call the parent callback
        if (onScan) {
            onScan(code);
        }
    };

    return (
        <div className={`w-full h-full relative overflow-hidden group ${isNative ? 'bg-transparent' : 'bg-black'}`}>
            {/* WEB SCANNER CONTAINER */}
            {!isNative && <div id="reader" className="w-full h-full object-cover"></div>}

            {/* ============================================ */}
            {/* NATIVE: Overlay UI similar a Google Scanner  */}
            {/* Renderizado como Portal en document.body     */}
            {/* ============================================ */}
            {isNative && isScanning && ReactDOM.createPortal(
                <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: 'transparent', zIndex: 99999 }}>

                    {/* Header - Barra superior */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
                        <button
                            onClick={handleNativeCancel}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white active:scale-90 transition-transform"
                            aria-label="Cerrar escáner"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>

                        <p className="text-white text-sm font-medium tracking-wide drop-shadow-lg">Enfocá el código</p>

                        {/* Botón de Flash funcional */}
                        <button
                            onClick={handleToggleTorch}
                            className={`w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-sm text-white active:scale-90 transition-all ${torchOn ? 'bg-yellow-500/70' : 'bg-black/40'}`}
                            aria-label="Toggle flash"
                        >
                            {torchOn ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                </svg>
                            )}
                        </button>
                    </div>

                    {/* Zona central: visor con esquinas tipo Google */}
                    <div className="flex-1 flex items-center justify-center relative">
                        {/* Oscurecimiento alrededor del visor */}
                        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 35% at center, transparent 0%, rgba(0,0,0,0.55) 100%)' }}></div>

                        {/* Visor rectangular con esquinas */}
                        <div className="relative w-[85%] max-w-sm aspect-[2/1]">
                            {/* Esquinas del visor */}
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-lg"></div>
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-lg"></div>
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-lg"></div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-lg"></div>

                            {/* Línea de escaneo animada */}
                            <div className="absolute left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-60 animate-scan-line"></div>

                            {/* Indicador de código detectado */}
                            {detectedCode && (
                                <div className="absolute -bottom-10 left-0 right-0 flex justify-center">
                                    <div className="bg-green-500/90 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                        Código detectado
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Zona inferior: botón de captura y código detectado */}
                    <div className="pb-6 px-6 flex flex-col items-center gap-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>

                        {/* Código detectado visible */}
                        {detectedCode && (
                            <div className="bg-black/50 backdrop-blur-md rounded-xl px-5 py-2.5 max-w-full">
                                <p className="text-white/60 text-[10px] uppercase tracking-widest text-center mb-0.5">Código leído</p>
                                <p className="text-white text-lg font-mono font-bold text-center tracking-wider break-all">{detectedCode}</p>
                            </div>
                        )}

                        {/* Botón de captura grande estilo Google Lens */}
                        <button
                            onClick={handleNativeCapture}
                            disabled={!detectedCode}
                            className={`
                                w-20 h-20 rounded-full flex items-center justify-center
                                transition-all duration-200 active:scale-90
                                shadow-2xl
                                ${detectedCode
                                    ? 'bg-white ring-4 ring-white/30'
                                    : 'bg-white/30 ring-4 ring-white/10'
                                }
                            `}
                            aria-label="Capturar código"
                        >
                            <div className={`
                                w-16 h-16 rounded-full flex items-center justify-center transition-all
                                ${detectedCode
                                    ? 'bg-green-500 text-white'
                                    : 'bg-white/20 text-white/40'
                                }
                            `}>
                                {detectedCode ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="7" height="7"></rect>
                                        <rect x="14" y="3" width="7" height="7"></rect>
                                        <rect x="14" y="14" width="7" height="7"></rect>
                                        <rect x="3" y="14" width="7" height="7"></rect>
                                    </svg>
                                )}
                            </div>
                        </button>

                        <p className="text-white/70 text-xs text-center">
                            {detectedCode
                                ? 'Presioná para confirmar'
                                : 'Apuntá al código de barras'
                            }
                        </p>
                    </div>
                </div>,
                document.body
            )}

            {/* Custom Overlay (Only for Web) */}
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

        </div>
    );
};

export default Scanner;
