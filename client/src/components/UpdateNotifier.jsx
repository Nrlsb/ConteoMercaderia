import React, { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import Modal from './Modal';
import api from '../api';

const UpdateNotifier = () => {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const isNewerVersion = (current, latest) => {
        const currentParts = current.split('.').map(Number);
        const latestParts = latest.split('.').map(Number);

        for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
            const c = currentParts[i] || 0;
            const l = latestParts[i] || 0;
            if (l > c) return true;
            if (l < c) return false;
        }
        return false;
    };

    useEffect(() => {
        const checkForUpdates = async () => {
            try {
                // En desarrollo local o navegador puro, App.getInfo puede fallar o no ser relevante
                // pero intentamos usarlo.
                let currentVersion = '1.0.0'; // Default fallback
                try {
                    const info = await CapacitorApp.getInfo();
                    currentVersion = info.version;
                } catch (e) {
                    // Silencioso en web
                }

                const response = await api.get('/api/app-version');
                const serverInfo = response.data;

                // Comparación simple de versiones (ej. 1.0.0 vs 1.0.1)
                if (isNewerVersion(currentVersion, serverInfo.version)) {
                    setUpdateInfo(serverInfo);
                }
            } catch (error) {
                console.error('Error checking for updates:', error);
            }
        };

        checkForUpdates();
        const intervalId = setInterval(checkForUpdates, 30000); // Poll cada 30 segundos
        return () => clearInterval(intervalId);
    }, []);

    // Effect para abrir el modal cuando hay info de actualización por primera vez en la sesión
    useEffect(() => {
        if (updateInfo && !dismissed) {
            setIsModalOpen(true);
        }
    }, [updateInfo, dismissed]);

    const handleDownload = () => {
        if (updateInfo?.downloadUrl) {
            // Abre la URL en el navegador externo para bajar el APK
            window.open(updateInfo.downloadUrl, '_system');
            setIsModalOpen(false);
            setDismissed(true);
        }
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setDismissed(true);
    };

    return (
        <>
            <Modal
                isOpen={isModalOpen}
                onClose={handleClose}
                title="¡Nueva Actualización Disponible!"
                message={`La versión ${updateInfo?.version} está disponible. Te recomendamos actualizar para obtener las últimas mejoras y correcciones.\n\nNovedades: ${updateInfo?.releaseNotes || 'Mejoras de rendimiento y estabilidad.'}`}
                type="info"
                confirmText="Descargar Actualización"
                onConfirm={handleDownload}
            />

            {/* Banner top por si cierran el modal temporalmente */}
            {updateInfo && dismissed && (
                <div className="bg-blue-100 border-b border-blue-300 px-4 py-2 flex justify-between items-center text-brand-dark z-40 shadow-sm animate-fade-in-down w-full">
                    <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium text-sm md:text-base">
                            Actualización {updateInfo.version} disponible
                        </span>
                    </div>
                    <button
                        onClick={handleDownload}
                        className="bg-brand-blue hover:bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm font-bold transition shadow-sm whitespace-nowrap"
                    >
                        Descargar
                    </button>
                </div>
            )}
        </>
    );
};

export default UpdateNotifier;
