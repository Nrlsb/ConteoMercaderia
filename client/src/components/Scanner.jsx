import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const Scanner = ({ onScan, isEnabled = true }) => {
    const [scanResult, setScanResult] = useState(null);
    const lastScannedCodeRef = useRef(null);
    const lastScannedTimeRef = useRef(0);
    const isScanningPausedRef = useRef(!isEnabled);

    // Update pause ref when isEnabled changes
    useEffect(() => {
        isScanningPausedRef.current = !isEnabled;
        console.log(`Scanner ${isEnabled ? 'enabled' : 'paused'}`);
    }, [isEnabled]);

    useEffect(() => {
        // Use a flag to prevent race conditions in Strict Mode
        let isMounted = true;
        let scanner = null;

        const config = {
            fps: 20, // Mayor fluidez
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                // Área amplia (90%) para capturar códigos sin tener que centrarlos perfecto
                return {
                    width: viewfinderWidth * 0.9,
                    height: viewfinderHeight * 0.9
                };
            },
            aspectRatio: 1.333334, // Ratio 4:3 (estándar de cámaras)
            showTorchButtonIfSupported: true, // Botón de linterna
            rememberLastUsedCamera: true,
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true // CRÍTICO: Usa el motor de IA nativo del celular
            },
            videoConstraints: {
                facingMode: "environment",
                // Solicita resoluciones altas para ver barras finas desde lejos
                width: { min: 1280, ideal: 1920 },
                height: { min: 720, ideal: 1080 },
                focusMode: "continuous" // Enfoque automático constante
            }
        };

        const startScanner = async () => {
            // Ensure the element exists
            if (!document.getElementById("reader")) return;

            scanner = new Html5QrcodeScanner(
                "reader",
                config,
                /* verbose= */ false
            );

            try {
                // In strict mode, this might run twice.
                // Html5QrcodeScanner.render doesn't return a promise, it's synchronous but starts async processes.
                // We just need to make sure we clear it on unmount.
                scanner.render(onScanSuccess, onScanFailure);
            } catch (err) {
                console.error("Error starting scanner", err);
            }
        };

        // Small timeout to ensure DOM is ready and previous instances are cleared
        const timerId = setTimeout(startScanner, 100);

        function onScanSuccess(decodedText, decodedResult) {
            if (!isMounted || isScanningPausedRef.current) return;

            const now = Date.now();
            if (decodedText === lastScannedCodeRef.current && (now - lastScannedTimeRef.current) < 2500) {
                return;
            }

            lastScannedCodeRef.current = decodedText;
            lastScannedTimeRef.current = now;

            console.log(`Code matched = ${decodedText}`, decodedResult);
            setScanResult(decodedText);
            onScan(decodedText);
        }

        function onScanFailure(error) {
            // handle scan failure
        }

        return () => {
            isMounted = false;
            clearTimeout(timerId);
            if (scanner) {
                scanner.clear().catch(error => {
                    console.error("Failed to clear html5-qrcode scanner. ", error);
                });
            }
        };
    }, [onScan]);

    return (
        <div className="w-full max-w-md mx-auto">
            <div id="reader" className="w-full"></div>
            {scanResult && (
                <div className="mt-4 p-4 bg-green-100 text-green-800 rounded">
                    Last Scanned: <span className="font-bold">{scanResult}</span>
                </div>
            )}
        </div>
    );
};

export default Scanner;
