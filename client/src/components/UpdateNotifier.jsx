import React, { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import Modal from './Modal';

const UpdateNotifier = () => {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

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
                    console.log('Capacitor plugin not available, using default version 1.0.0');
                }

                const response = await fetch('/api/app-version');
                if (response.ok) {
                    const serverInfo = await response.json();

                    // Comparación simple de versiones (ej. 1.0.0 vs 1.0.1)
                    if (isNewerVersion(currentVersion, serverInfo.version)) {
                        setUpdateInfo(serverInfo);
                        setIsModalOpen(true);
                    }
                }
            } catch (error) {
                console.error('Error checking for updates:', error);
            }
        };

        checkForUpdates();
    }, []);

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

    const handleDownload = () => {
        if (updateInfo?.downloadUrl) {
            // Abre la URL en el navegador externo para bajar el APK
            window.open(updateInfo.downloadUrl, '_system');
            setIsModalOpen(false);
        }
    };

    return (
        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="¡Nueva Actualización Disponible!"
            message={`La versión ${updateInfo?.version} está disponible. Te recomendamos actualizar para obtener las últimas mejoras y correcciones.\n\nNovedades: ${updateInfo?.releaseNotes || 'Mejoras de rendimiento y estabilidad.'}`}
            type="info"
            confirmText="Descargar Actualización"
            onConfirm={handleDownload}
        />
    );
};

export default UpdateNotifier;
