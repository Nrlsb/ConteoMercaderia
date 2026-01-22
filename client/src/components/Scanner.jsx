import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const Scanner = ({ onScan }) => {
    const [scanResult, setScanResult] = useState(null);
    const lastScannedCodeRef = useRef(null);
    const lastScannedTimeRef = useRef(0);

    useEffect(() => {
        // Use a flag to prevent race conditions in Strict Mode
        let isMounted = true;
        let scanner = null;

        const startScanner = async () => {
            // Ensure the element exists
            if (!document.getElementById("reader")) return;

            scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
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
            if (!isMounted) return;

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
