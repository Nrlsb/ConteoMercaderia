import React, { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import Modal from './Modal';
import api from '../api';

const UpdateNotifier = () => {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    // Usar localStorage para recordar la versión que ya ignoramos o intentamos descargar
    const [dismissedVersion, setDismissedVersion] = useState(
        localStorage.getItem('dismissedUpdateVersion')
    );

    const isNative = Capacitor.isNativePlatform();

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
        if (!isNative) return;

        const checkForUpdates = async () => {
            try {
                let currentVersion = '1.0.0';
                try {
                    const info = await CapacitorApp.getInfo();
                    currentVersion = info.version;
                } catch (e) {
                    // Fallback local
                }

                const response = await api.get('/api/app-version');
                const serverInfo = response.data;

                if (isNewerVersion(currentVersion, serverInfo.version)) {
                    setUpdateInfo(serverInfo);
                }
            } catch (error) {
                console.error('Error checking for updates:', error);
            }
        };

        checkForUpdates();
        const intervalId = setInterval(checkForUpdates, 30000);
        return () => clearInterval(intervalId);
    }, [isNative]);

    useEffect(() => {
        if (updateInfo && updateInfo.version !== dismissedVersion) {
            setIsModalOpen(true);
        }
    }, [updateInfo, dismissedVersion]);

    const handleDownload = async () => {
        if (!updateInfo?.downloadUrl || isDownloading) return;

        let finalUrl = updateInfo.downloadUrl;
        if (!finalUrl.startsWith('http')) {
            const baseUrl = api.defaults.baseURL !== '/' ? api.defaults.baseURL : window.location.origin;
            finalUrl = `${baseUrl.replace(/\/$/, '')}/${finalUrl.replace(/^\//, '')}`;
        }

        setIsDownloading(true);
        setDownloadProgress(0);
        let progressListener;
        try {
            const fileName = 'ConteoMercaderia_Update.apk';

            progressListener = await Filesystem.addListener('progress', (progress) => {
                if (progress.url === finalUrl) {
                    const percentage = progress.contentLength > 0 
                        ? Math.round((progress.bytes / progress.contentLength) * 100) 
                        : 0;
                    setDownloadProgress(percentage);
                }
            });

            // Download file
            const downloadResult = await Filesystem.downloadFile({
                url: finalUrl,
                path: fileName,
                directory: Directory.Data,
                progress: true
            });

            // Open APK
            await FileOpener.open({
                filePath: downloadResult.path,
                contentType: 'application/vnd.android.package-archive',
                openWithDefault: true
            });

            setIsModalOpen(false);
            setDismissedVersion(updateInfo.version);
            localStorage.setItem('dismissedUpdateVersion', updateInfo.version);
        } catch (error) {
            console.error('Error downloading or opening APK:', error);
            alert('Error al descargar o instalar la actualización.');
        } finally {
            if (progressListener) {
                progressListener.remove();
            }
            setIsDownloading(false);
        }
    };

    const handleClose = () => {
        setIsModalOpen(false);
        if (updateInfo) {
            setDismissedVersion(updateInfo.version);
            localStorage.setItem('dismissedUpdateVersion', updateInfo.version);
        }
    };

    if (!isNative) return null;

    return (
        <>
            <Modal
                isOpen={isModalOpen}
                onClose={handleClose}
                title="¡Nueva Actualización Disponible!"
                message={
                    isDownloading
                        ? `Descargando actualización... ${downloadProgress}%`
                        : `La versión ${updateInfo?.version} está disponible. Te recomendamos actualizar para obtener las últimas mejoras y correcciones.\n\nNovedades: ${updateInfo?.releaseNotes || 'Mejoras de rendimiento y estabilidad.'}`
                }
                type="info"
                confirmText={isDownloading ? `Descargando... ${downloadProgress}%` : "Descargar"}
                onConfirm={isDownloading ? undefined : handleDownload}
            />

            {updateInfo && updateInfo.version === dismissedVersion && (
                <div
                    className="bg-blue-100 border-b border-blue-300 px-4 py-2 flex justify-between items-center text-brand-dark z-40 shadow-sm animate-fade-in-down w-full"
                    style={{ paddingTop: 'calc(var(--safe-area-top) + 0.5rem)' }}
                >
                    <div className="flex items-center gap-2 mt-1">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium text-sm md:text-base">
                            Actualización {updateInfo.version} disponible
                        </span>
                    </div>
                    <button
                        onClick={isDownloading ? undefined : handleDownload}
                        disabled={isDownloading}
                        className={`bg-brand-blue hover:bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm font-bold transition shadow-sm whitespace-nowrap mt-1 ${isDownloading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isDownloading ? `Descargando... ${downloadProgress}%` : 'Descargar'}
                    </button>
                </div>
            )}
        </>
    );
};

export default UpdateNotifier;
