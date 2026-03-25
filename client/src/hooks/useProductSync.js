import { useState, useCallback, useEffect } from 'react';
import api from '../api';
import { db } from '../db';
import { toast } from 'sonner';

export const useProductSync = () => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const [progress, setProgress] = useState(0);

    const fetchSyncMetadata = useCallback(async () => {
        const metadata = await db.sync_metadata.get('products_last_sync');
        if (metadata) {
            setLastSync(new Date(metadata.last_sync));
        }
    }, []);

    useEffect(() => {
        fetchSyncMetadata();
    }, [fetchSyncMetadata]);

    const syncProducts = useCallback(async (force = false) => {
        if (isSyncing) return;

        // Si synced hace menos de 1 hora y no es forzado, saltar
        const metadata = await db.sync_metadata.get('products_last_sync');
        const now = new Date();
        if (!force && metadata && (now - new Date(metadata.last_sync)) < 1000 * 60 * 60) {
            console.log("Skipping sync - recently updated");
            return;
        }

        setIsSyncing(true);
        setProgress(10);

        try {
            toast.info("Sincronizando catálogo de productos...", { id: 'product-sync' });

            const response = await api.get('/api/products/sync');
            const products = response.data;

            setProgress(50);

            // Limpiar y cargar nuevos productos
            await db.products.clear();

            // Chunk insertion for performance with very large datasets
            const chunkSize = 2000;
            for (let i = 0; i < products.length; i += chunkSize) {
                const chunk = products.slice(i, i + chunkSize);
                await db.products.bulkAdd(chunk);
                setProgress(Math.round(50 + (i / products.length) * 50));
            }

            const syncTime = new Date().toISOString();
            await db.sync_metadata.put({ key: 'products_last_sync', last_sync: syncTime });

            setLastSync(new Date(syncTime));
            toast.success(`Catálogo sincronizado: ${products.length} productos`, { id: 'product-sync' });
        } catch (error) {
            console.error("Sync error:", error);
            toast.error("Error al sincronizar catálogo", { id: 'product-sync' });
        } finally {
            setIsSyncing(false);
            setProgress(100);
        }
    }, [isSyncing]);

    const getProductByCode = useCallback(async (code) => {
        if (!code) return null;
        const normalized = code.trim().toLowerCase();

        // Buscar por código exacto o código de barras exacto
        const product = await db.products
            .where('code').equalsIgnoreCase(normalized)
            .or('barcode').equalsIgnoreCase(normalized)
            .first();

        return product;
    }, []);

    const searchProductsLocally = useCallback(async (query) => {
        if (!query || query.length < 2) return [];

        const terms = query.toLowerCase().trim().split(/\s+/);

        // Búsqueda simple por prefijo en descripción para velocidad
        // Dexie/IndexedDB no soporta FULLTEXT nativamente de forma eficiente sin plugins,
        // pero podemos filtrar por el primer término y luego refinar.
        const matches = await db.products
            .where('description').startsWithIgnoreCase(terms[0])
            .limit(50)
            .toArray();

        // Refinar con todos los términos
        return matches.filter(p => {
            const desc = p.description.toLowerCase();
            const code = p.code.toLowerCase();
            const barcode = (p.barcode || '').toLowerCase();
            return terms.every(term =>
                desc.includes(term) || code.includes(term) || barcode.includes(term)
            );
        });
    }, []);

    return {
        isSyncing,
        lastSync,
        progress,
        syncProducts,
        getProductByCode,
        searchProductsLocally
    };
};

export default useProductSync;
