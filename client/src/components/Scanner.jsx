import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { CapacitorPluginMlKitTextRecognition } from '@pantrist/capacitor-plugin-ml-kit-text-recognition';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Helper: Siempre limpiar las clases CSS del escáner
const cleanupScannerCSS = () => {
    document.body.classList.remove('barcode-scanner-active');
    document.documentElement.classList.remove('barcode-scanner-active');
};

// Helper: Extraer números del texto OCR y validar checksum (EAN-8, UPC-A, EAN-13, EAN-14)
const extractNumbers = (text) => {
    if (!text) return null;
    const noSpaceText = text.replace(/\s+/g, '');
    // Buscar todas las secuencias de entre 8 y 14 dígitos que podrían ser códigos
    const matches = [...noSpaceText.matchAll(/\d{8,14}/g)];

    for (const match of matches) {
        const code = match[0];
        if (isValidBarcode(code)) {
            return code;
        }
    }
    return null;
};

// Valida si un código numérico es un EAN/UPC válido mediante checksum
const isValidBarcode = (code) => {
    if (!/^\d+$/.test(code)) return false;
    const length = code.length;
    // Solo validamos longitudes estándar (EAN-8, UPC-A(12), EAN-13, GTIN-14)
    if (![8, 12, 13, 14].includes(length)) return false;

    let sum = 0;
    // El dígito verificador es el último
    const checkDigit = parseInt(code[length - 1], 10);

    for (let i = length - 2; i >= 0; i--) {
        const digit = parseInt(code[i], 10);
        // Regla estándar EAN/UPC: de derecha a izquierda (sin el check digit), posiciones impares multiplican por 3
        const isOddPositionFromRight = ((length - 2 - i) % 2) === 0;
        sum += isOddPositionFromRight ? digit * 3 : digit;
    }

    const calculatedCheck = (10 - (sum % 10)) % 10;
    return calculatedCheck === checkDigit;
};

const Scanner = ({ onScan, onCancel, isEnabled = true, isPaused = false, scanStatus = null }) => {
    // Shared state
    const [scanMode, setScanMode] = useState(() => {
        const stored = localStorage.getItem('scanner_mode');
        if (stored) return stored;
        return localStorage.getItem('scanner_auto_confirm') === 'true' ? 'auto' : 'manual';
    });

    const isAutoConfirm = scanMode === 'auto';

    const handleModeChange = async (newMode) => {
        if (scanMode === newMode) return;
        setScanMode(newMode);
        localStorage.setItem('scanner_mode', newMode);

        const willBeNative = Capacitor.isNativePlatform() && newMode !== 'ia';
        await stopScanning(willBeNative);
        setTimeout(() => { startScanning(newMode); }, 100);
    };
    // Shared state
    const [isNative] = useState(Capacitor.isNativePlatform());
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);

    // Native: almacena el último código detectado en tiempo real
    const [detectedCode, setDetectedCode] = useState(null);
    const detectedCodeRef = useRef(null);

    // Flash state
    const [torchOn, setTorchOn] = useState(false);
    const [nativeZoom, setNativeZoom] = useState(1.0);
    const [showFocusHint, setShowFocusHint] = useState(false);
    const focusTimerRef = useRef(null);

    // Web-specific state
    const [webTorchOn, setWebTorchOn] = useState(false);
    const [webZoom, setWebZoom] = useState(2.0);
    const [webZoomSupported, setWebZoomSupported] = useState(false);
    const [webTorchSupported, setWebTorchSupported] = useState(false);
    const [webDetectedCode, setWebDetectedCode] = useState(null);
    const webDetectedCodeRef = useRef(null);
    const webPausedRef = useRef(false);
    const ocrIntervalRef = useRef(null);

    // Web-specific refs
    const scannerRef = useRef(null);
    const lastScannedCodeRef = useRef(null);
    // Reusable AudioContext for beep feedback
    const audioCtxRef = useRef(null);
    const lastScannedTimeRef = useRef(0);

    // native references
    const moduleCheckedRef = useRef(false);
    const nativeScanActiveRef = useRef(false);

    // Ref to always have the latest onScan prop available inside stale callbacks
    const onScanRef = useRef(onScan);
    useEffect(() => { onScanRef.current = onScan; }, [onScan]);

    // Ref for scanMode to avoid stale closures in scan callbacks
    const scanModeRef = useRef(scanMode);
    useEffect(() => { scanModeRef.current = scanMode; }, [scanMode]);

    // --- REF: Track enabled state for async callbacks ---
    const isEnabledRef = useRef(isEnabled);
    const isPausedRef = useRef(isPaused);
    const restartTimerRef = useRef(null);

    useEffect(() => {
        isEnabledRef.current = isEnabled;
    }, [isEnabled]);

    useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused]);

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
    }, [isEnabled, isNative]); // Removing scanMode dependency from here so it doesn't restart continuously


    // --- FUNCTION: Start Scanning ---
    const startScanning = async (modeOverride) => {
        const currentMode = modeOverride || scanMode;
        setError(null);

        if (isNative && currentMode !== 'ia') {
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
        setWebDetectedCode(null);
        webDetectedCodeRef.current = null;
        webPausedRef.current = false;
        setWebTorchOn(false);
        setNativeZoom(1.0);
        setShowFocusHint(false);
        if (focusTimerRef.current) {
            clearTimeout(focusTimerRef.current);
            focusTimerRef.current = null;
        }

        if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current);
            restartTimerRef.current = null;
        }

        if (ocrIntervalRef.current) {
            clearInterval(ocrIntervalRef.current);
            ocrIntervalRef.current = null;
        }

        try {
            await BarcodeScanner.removeAllListeners();
            await BarcodeScanner.stopScan();
        } catch (e) {
            // Ignore error if not scanning
        }
        nativeScanActiveRef.current = false;

        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
            } catch (err) {
                console.warn("Failed to stop web scanner", err);
            }
        }

        if (!skipCSSCleanup) {
            cleanupScannerCSS();
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

            // 3. Mostrar el overlay UI ANTES de hacer el fondo transparente
            //    para que el usuario vea el botón de cancelar desde el inicio
            setIsScanning(true);

            // 4. Hacer el fondo transparente para que se vea la cámara
            document.body.classList.add('barcode-scanner-active');
            document.documentElement.classList.add('barcode-scanner-active');

            // 5. Agregar listener para códigos detectados
            await BarcodeScanner.addListener('barcodeScanned', async (result) => {
                if (isPausedRef.current) return;
                if (result.barcode && result.barcode.rawValue) {
                    const code = result.barcode.rawValue;
                    if (scanModeRef.current === 'auto') {
                        handleScanSuccess(code);
                    } else {
                        detectedCodeRef.current = code;
                        setDetectedCode(code);
                    }
                }
            });

            // 6. Iniciar escaneo continuo (la cámara se ve detrás de la WebView)
            await BarcodeScanner.startScan({
                formats: [
                    'EAN_13', 'EAN_8', 'CODE_128', 'UPC_A', 'UPC_E', 'CODE_39'
                ]
            });

            // 7. Aplicar zoom inicial de seguridad (50%) para ayudar al enfoque en gama baja y códigos de barras pequeños
            try {
                await BarcodeScanner.setZoom({ ratio: 1.5 });
                setNativeZoom(1.5);
            } catch (e) {
                console.warn("Zoom no soportado en este dispositivo");
            }

            // 8. Iniciar timer para ayuda visual
            focusTimerRef.current = setTimeout(() => {
                setShowFocusHint(true);
            }, 3500);

            nativeScanActiveRef.current = true;

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

        // Procesar el código capturado
        handleScanSuccess(code);

        // Limpiar para permitir nueva captura si no se cierra (ej: error en padre)
        detectedCodeRef.current = null;
        setDetectedCode(null);
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

    // --- OCR: Interval for IA Mode ---
    useEffect(() => {
        if (!isScanning || scanMode !== 'ia') {
            if (ocrIntervalRef.current) {
                clearInterval(ocrIntervalRef.current);
                ocrIntervalRef.current = null;
            }
            return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        ocrIntervalRef.current = setInterval(async () => {
            if (webPausedRef.current || isPausedRef.current) return;
            const video = document.querySelector('#reader video');
            if (!video || video.readyState !== 4) return;

            // set max size for OCR
            const maxW = 640;
            const maxH = 640 * (video.videoHeight / video.videoWidth);
            canvas.width = maxW;
            canvas.height = maxH;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const base64DataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const base64Image = base64DataUrl.split(',')[1];

            try {
                const result = await CapacitorPluginMlKitTextRecognition.detectText({ base64Image });
                if (result && result.text) {
                    const code = extractNumbers(result.text);
                    if (code && scanModeRef.current === 'ia') {
                        handleScanSuccess(code);
                    }
                }
            } catch (err) {
                console.error("OCR Check error", err);
            }
        }, 1200);

        return () => {
            if (ocrIntervalRef.current) clearInterval(ocrIntervalRef.current);
        };
    }, [isScanning, scanMode]);

    // --- STRATEGY: Web (Html5Qrcode) ---
    const startWebScan = async () => {
        if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode("reader", {
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_39
                ],
                verbose: false
            });
        }

        const tryStart = async (constraints) => {
            await scannerRef.current.start(
                { facingMode: "environment" },
                {
                    fps: 20, // Reducido de 30 para ahorrar CPU en gama baja
                    videoConstraints: constraints
                },
                (decodedText) => {
                    if (webPausedRef.current || isPausedRef.current) return;
                    if (scanModeRef.current === 'auto' || scanModeRef.current === 'ia') {
                        handleScanSuccess(decodedText);
                    } else {
                        // Manual mode: show code, wait for user confirmation
                        if (decodedText !== webDetectedCodeRef.current) {
                            webDetectedCodeRef.current = decodedText;
                            setWebDetectedCode(decodedText);
                        }
                    }
                },
                () => { } // Ignore frame errors
            );
        };

        try {
            await tryStart({
                facingMode: "environment",
                width: { min: 640, ideal: 1280, max: 1920 }, // Reducido de 1080p/4K para mayor rapidez
                height: { min: 480, ideal: 720, max: 1080 },
                focusMode: "continuous",
            });
            setIsScanning(true);

            // After start, detect capabilities and apply zoom
            try {
                const capabilities = scannerRef.current.getRunningTrackCapabilities();
                if (capabilities?.zoom) {
                    setWebZoomSupported(true);
                    const minZoom = capabilities.zoom.min ?? 1;
                    const maxZoom = capabilities.zoom.max ?? 8;
                    const targetZoom = Math.min(2.0, maxZoom);
                    const clampedZoom = Math.max(minZoom, targetZoom);
                    await scannerRef.current.applyVideoConstraints({
                        advanced: [{ zoom: clampedZoom }]
                    });
                    setWebZoom(clampedZoom);
                }
                if (capabilities?.torch) {
                    setWebTorchSupported(true);
                }
            } catch (capErr) {
                console.warn("No se pudieron leer capabilities:", capErr);
            }
        } catch (err) {
            // Fallback: try with lower resolution
            try {
                if (scannerRef.current?.isScanning) await scannerRef.current.stop();
                await tryStart({ facingMode: "environment", focusMode: "continuous" });
                setIsScanning(true);
            } catch (fallbackErr) {
                console.error("Web scan error", fallbackErr);
                setError("No se pudo acceder a la cámara Web.");
                setIsScanning(false);
            }
        }
    };

    // --- WEB: Toggle Torch ---
    const handleWebToggleTorch = async () => {
        try {
            const next = !webTorchOn;
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: next }]
            });
            setWebTorchOn(next);
        } catch (e) {
            console.warn('Linterna no soportada en web:', e);
        }
    };

    // --- WEB: Adjust Zoom ---
    const handleWebZoom = async (delta) => {
        try {
            const capabilities = scannerRef.current.getRunningTrackCapabilities();
            const minZoom = capabilities?.zoom?.min ?? 1;
            const maxZoom = capabilities?.zoom?.max ?? 8;
            const newZoom = Math.max(minZoom, Math.min(maxZoom, webZoom + delta));
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ zoom: newZoom }]
            });
            setWebZoom(newZoom);
        } catch (e) {
            console.warn('Zoom no soportado:', e);
        }
    };

    // --- WEB: Confirm manual capture ---
    const handleWebCapture = () => {
        const code = webDetectedCodeRef.current;
        if (!code) return;
        webPausedRef.current = true;
        webDetectedCodeRef.current = null;
        setWebDetectedCode(null);
        handleScanSuccess(code);
        // Reset pause after brief delay to allow re-scan
        setTimeout(() => { webPausedRef.current = false; }, 1500);
    };

    // --- SHARED: Handle Success ---
    const handleScanSuccess = async (code) => {
        if (isPausedRef.current) return;
        const now = Date.now();
        // Debounce
        if (code === lastScannedCodeRef.current && (now - lastScannedTimeRef.current) < 800) {
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
            // Reutilizar AudioContext para evitar latencia
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const audioCtx = audioCtxRef.current;
            if (audioCtx) {
                // Resumir si fue suspendido por el navegador
                if (audioCtx.state === 'suspended') await audioCtx.resume();
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

        // Call the parent callback using ref to avoid stale closures
        if (onScanRef.current) {
            onScanRef.current(code);
        }
    };

    return (
        <>
            <div className={`w-full h-full relative overflow-hidden ${isNative && scanMode !== 'ia' ? 'bg-transparent' : 'bg-black'}`}>
                {!(isNative && scanMode !== 'ia') && (
                    <div id="reader" className="w-full h-full object-cover"></div>
                )}
            </div>

            {isScanning && ReactDOM.createPortal(
                <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: 'transparent', zIndex: 2000 }}>
                    <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
                        <button
                            onClick={isNative && scanMode !== 'ia' ? handleNativeCancel : () => { if (onCancel) onCancel(); }}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white active:scale-90 transition-transform"
                            aria-label="Cerrar escáner"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>

                        <div className="flex bg-black/60 rounded-full p-1 border border-white/20 w-[200px]">
                            <button onClick={() => handleModeChange('manual')} className={`flex-1 text-xs font-bold py-1.5 rounded-full transition ${scanMode === 'manual' ? 'bg-white text-black shadow-sm' : 'text-white/70'}`}>Manual</button>
                            <button onClick={() => handleModeChange('auto')} className={`flex-1 text-xs font-bold py-1.5 rounded-full transition ${scanMode === 'auto' ? 'bg-green-500 text-white shadow-sm' : 'text-white/70'}`}>Auto</button>
                            <button onClick={() => handleModeChange('ia')} className={`flex-1 text-xs font-bold py-1.5 rounded-full transition ${scanMode === 'ia' ? 'bg-blue-500 text-white shadow-sm' : 'text-white/70'}`}>IA</button>
                        </div>

                        <div className="flex items-center gap-2">
                            {!(isNative && scanMode !== 'ia') && webZoomSupported && (
                                <div className="hidden sm:flex items-center gap-1 bg-black/60 rounded-full px-2 py-1 border border-white/20">
                                    <button onClick={() => handleWebZoom(-0.5)} className="w-6 h-6 flex items-center justify-center text-white text-lg font-bold leading-none active:scale-90 transition-transform">−</button>
                                    <span className="text-white text-[10px] font-mono min-w-[28px] text-center">{webZoom.toFixed(1)}x</span>
                                    <button onClick={() => handleWebZoom(+0.5)} className="w-6 h-6 flex items-center justify-center text-white text-lg font-bold leading-none active:scale-90 transition-transform">+</button>
                                </div>
                            )}
                            <button
                                onClick={(isNative && scanMode !== 'ia') ? handleToggleTorch : handleWebToggleTorch}
                                className={`w-10 h-10 flex items-center justify-center rounded-full text-white active:scale-90 transition-all ${((isNative && scanMode !== 'ia') ? torchOn : webTorchOn) ? 'bg-yellow-500/80' : 'bg-black/60'}`}
                                aria-label="Toggle flash"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={((isNative && scanMode !== 'ia') ? torchOn : webTorchOn) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {scanStatus && (
                        <div className="px-4 py-2 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border ${scanStatus.type === 'error' ? 'bg-red-500 border-red-400 text-white' : 'bg-green-600 border-green-500 text-white'}`}>
                                <p className="text-sm font-bold leading-tight flex-1">{scanStatus.message}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 flex items-center justify-center relative">
                        <div className="relative w-[85%] max-w-sm aspect-square">
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-lg"></div>
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-lg"></div>
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-lg"></div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-lg"></div>
                            <div className={`absolute left-2 right-2 h-[2px] bg-gradient-to-r from-transparent ${((isNative && scanMode !== 'ia') ? detectedCode : webDetectedCode) ? 'via-green-400' : 'via-white'} to-transparent opacity-70 animate-scan-line`}></div>
                            {showFocusHint && !detectedCode && (isNative && scanMode !== 'ia') && (
                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center px-6 pointer-events-none">
                                    <div className="bg-black/40 backdrop-blur-sm border border-white/20 text-white px-4 py-3 rounded-2xl text-center shadow-xl animate-pulse">
                                        <p className="text-sm font-bold">¿No enfoca?</p>
                                        <p className="text-[11px] opacity-90 mt-0.5 text-white/80">Alejá un poco el celular del código</p>
                                    </div>
                                </div>
                            )}
                            {((isNative && scanMode !== 'ia') ? detectedCode : webDetectedCode) && (
                                <div className="absolute -bottom-10 left-0 right-0 flex justify-center">
                                    <div className="bg-green-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        Código detectado
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pb-6 px-6 flex flex-col items-center gap-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
                        {((isNative && scanMode !== 'ia') ? detectedCode : webDetectedCode) && (
                            <div className="bg-black/70 backdrop-blur-md rounded-xl px-5 py-2.5 max-w-full">
                                <p className="text-white/60 text-[10px] uppercase tracking-widest text-center mb-0.5">Código leído</p>
                                <p className="text-white text-lg font-mono font-bold text-center tracking-wider break-all">{((isNative && scanMode !== 'ia') ? detectedCode : webDetectedCode)}</p>
                            </div>
                        )}
                        {scanMode === 'manual' && (
                            <button
                                onClick={(isNative && scanMode !== 'ia') ? handleNativeCapture : handleWebCapture}
                                disabled={!((isNative && scanMode !== 'ia') ? detectedCode : webDetectedCode)}
                                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 shadow-2xl ${((isNative && scanMode !== 'ia') ? detectedCode : webDetectedCode) ? 'bg-white ring-4 ring-white/30' : 'bg-white/30 ring-4 ring-white/10'}`}
                                aria-label="Capturar código"
                            >
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${((isNative && scanMode !== 'ia') ? detectedCode : webDetectedCode) ? 'bg-green-500 text-white' : 'bg-white/20 text-white/40'}`}>
                                    {((isNative && scanMode !== 'ia') ? detectedCode : webDetectedCode) ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                                    )}
                                </div>
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-6 text-center z-50">
                    <div>
                        <svg className="w-12 h-12 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                        </svg>
                        <p className="text-lg font-bold mb-2">Error</p>
                        <p className="text-sm text-gray-400">{error}</p>
                        {isNative && <button onClick={() => startScanning()} className="mt-4 px-4 py-2 bg-gray-700 rounded text-sm hover:bg-gray-600">Reintentar</button>}
                    </div>
                </div>
            )}
        </>
    );
};

export default Scanner;
