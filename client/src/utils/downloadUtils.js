import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Utility to download files that works both in Web and Native (Capacitor)
 * @param {Blob} blob - The file content as a Blob
 * @param {string} fileName - The desired file name
 */
export const downloadFile = async (blob, fileName) => {
    // Sanitize filename to prevent filesystem errors with characters like "/"
    const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '-');

    if (Capacitor.isNativePlatform()) {
        try {
            // 1. Convert Blob to Base64
            const reader = new FileReader();
            const base64Promise = new Promise((resolve, reject) => {
                reader.onloadend = () => {
                    const base64data = reader.result.split(',')[1];
                    resolve(base64data);
                };
                reader.onerror = reject;
            });
            reader.readAsDataURL(blob);
            const base64Data = await base64Promise;

            // 2. Write to Filesystem
            // We use Cache or Documents directory. Cache is safer for temporary exports.
            const result = await Filesystem.writeFile({
                path: safeFileName,
                data: base64Data,
                directory: Directory.Cache
            });

            // 3. Share the file
            await Share.share({
                title: safeFileName,
                text: 'Exportando documento...',
                url: result.uri,
                dialogTitle: 'Compartir o Guardar archivo'
            });

        } catch (error) {
            console.error('Error in native download:', error);
            throw new Error('Error al procesar descarga nativa');
        }
    } else {
        // Standard Web Download logic
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', safeFileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    }
};
