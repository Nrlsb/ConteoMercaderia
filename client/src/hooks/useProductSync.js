import { useState, useCallback, useEffect } from 'react';
import api from '../api';
import { db } from '../db';
import { toast } from 'sonner';
import { normalizeText } from '../utils/textUtils';

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

        const normalizedQuery = normalizeText(query);
        const terms = normalizedQuery.trim().split(/\s+/);
        const firstTerm = terms[0];

        // 1. Intentar búsqueda rápida por prefijo en indexes clave (code, barcode, description)
        let results = [];
        try {
            // Nota: startsWithIgnoreCase de Dexie no siempre maneja acentos bien si el índice no está normalizado.
            // Pero como primer filtro rápido es excelente.
            const primaryMatches = await db.products
                .where('code').startsWithIgnoreCase(firstTerm)
                .or('barcode').startsWithIgnoreCase(firstTerm)
                .or('description').startsWithIgnoreCase(firstTerm)
                .limit(100)
                .toArray();

            results = primaryMatches;
        } catch (e) {
            console.error("Error in primary search:", e);
        }

        // 2. Si hay pocos resultados y no parece un código puro, intentar búsqueda por "contiene" normalizada
        if (results.length < 15 && isNaN(firstTerm)) {
            try {
                const containsMatches = await db.products
                    .filter(p => normalizeText(p.description).includes(firstTerm))
                    .limit(50)
                    .toArray();

                const existingCodes = new Set(results.map(r => r.code));
                containsMatches.forEach(m => {
                    if (!existingCodes.has(m.code)) {
                        results.push(m);
                    }
                });
            } catch (e) {
                console.error("Error in contains search:", e);
            }
        }

        // 3. Refinar todos los resultados encontrados para asegurar que CUMPLEN con TODOS los términos ingresados (Normalizado)
        return results.filter(p => {
            const desc = normalizeText(p.description);
            const code = normalizeText(p.code);
            const barcode = normalizeText(p.barcode);
            const brand = normalizeText(p.brand);

            return terms.every(term =>
                desc.includes(term) ||
                code.includes(term) ||
                barcode.includes(term) ||
                brand.includes(term)
            );
        }).slice(0, 50);
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
