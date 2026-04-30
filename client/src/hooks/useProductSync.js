import { useState, useCallback, useEffect } from 'react';
import api from '../api';
import { db } from '../db';
import { toast } from 'sonner';
import { normalizeText, normalizePhonetic } from '../utils/textUtils';

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

    const getProductByCode = useCallback(async (code, type = 'any') => {
        if (!code) return null;
        const normalized = code.trim().toLowerCase();
        const original = code.trim();

        if (type === 'barcode') return await db.products.where('barcode').equalsIgnoreCase(normalized).first();
        if (type === 'internal') return await db.products.where('code').equalsIgnoreCase(normalized).first();
        if (type === 'provider') return await db.products.where('provider_code').equalsIgnoreCase(normalized).first();

        // Barcodes de scanner/cámara son todos dígitos >= 6. Probar índice correcto primero.
        const looksLikeBarcode = /^\d{6,}$/.test(original);
        if (looksLikeBarcode) {
            const byBarcode = await db.products.where('barcode').equalsIgnoreCase(normalized).first();
            if (byBarcode) return byBarcode;
            return await db.products.where('code').equalsIgnoreCase(normalized).first();
        }

        // Código alfanumérico: probar code → barcode → provider_code
        const byCode = await db.products.where('code').equalsIgnoreCase(normalized).first();
        if (byCode) return byCode;
        const byBarcode = await db.products.where('barcode').equalsIgnoreCase(normalized).first();
        if (byBarcode) return byBarcode;
        return await db.products.where('provider_code').equalsIgnoreCase(normalized).first();
    }, []);

    const searchProductsLocally = useCallback(async (query, type = 'any') => {
        if (!query || query.length < 2) return [];

        const normalizedQuery = normalizeText(query);
        const terms = normalizedQuery.trim().split(/\s+/);
        const firstTerm = terms[0];

        let results = [];
        try {
            // 1. Búsqueda rápida por prefijo según el tipo seleccionado
            const collection = db.products;

            if (type === 'any' || type === 'internal') {
                const inner = await collection.where('code').startsWithIgnoreCase(firstTerm).limit(50).toArray();
                results = [...results, ...inner];
            }
            if (type === 'any' || type === 'barcode') {
                const inner = await collection.where('barcode').startsWithIgnoreCase(firstTerm).limit(50).toArray();
                results = [...results, ...inner];
            }
            if (type === 'any' || type === 'provider') {
                const inner = await collection.where('provider_code').startsWithIgnoreCase(firstTerm).limit(50).toArray();
                results = [...results, ...inner];
            }
            if (type === 'any') {
                const inner = await collection.where('description').startsWithIgnoreCase(firstTerm).limit(50).toArray();
                results = [...results, ...inner];
            }

            // Deduplicar por código
            const seen = new Set();
            results = results.filter(r => {
                if (seen.has(r.code)) return false;
                seen.add(r.code);
                return true;
            });

        } catch (e) {
            console.error("Error in primary search:", e);
        }

        // 2. Si hay pocos resultados y no es una búsqueda de código específico de tipo barcode/internal/provider, buscar en descripción
        if (results.length < 15 && type === 'any' && isNaN(firstTerm)) {
            try {
                const containsMatches = await db.products
                    .filter(p => normalizeText(p.description).includes(firstTerm))
                    .limit(500)
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

        // 3. Refinar y puntuar resultados
        return results.map(p => {
            const desc = normalizeText(p.description);
            const code = normalizeText(p.code);
            const barcode = normalizeText(p.barcode || '');
            const provCode = normalizeText(p.provider_code || '');
            const brand = normalizeText(p.brand || '');

            let score = 0;
            let matchesAll = true;

            for (const term of terms) {
                let termMatched = false;
                
                // Prioridad 1: Descripción (Puntaje alto)
                if (desc.includes(term)) {
                    score += 100;
                    termMatched = true;
                    // Extra por coincidencia de palabra completa (especialmente para números como "20")
                    const wordRegex = new RegExp(`\\b${term}\\b`, 'i');
                    if (wordRegex.test(desc)) score += 50;
                }
                
                // Prioridad 2: Marca
                if (brand.includes(term)) {
                    score += 30;
                    termMatched = true;
                }

                // Prioridad 3: Códigos (Puntaje bajo para evitar ruido de barras)
                if (code.includes(term)) {
                    score += 10;
                    termMatched = true;
                    if (code === term) score += 40;
                }
                if (barcode.includes(term)) {
                    score += 5;
                    termMatched = true;
                    if (barcode === term) score += 45;
                }
                if (provCode.includes(term)) {
                    score += 10;
                    termMatched = true;
                }

                if (!termMatched) {
                    matchesAll = false;
                    break;
                }
            }

            return { product: p, score, matchesAll };
        })
        .filter(r => r.matchesAll)
        .sort((a, b) => b.score - a.score)
        .map(r => r.product)
        .slice(0, 50);
    }, []);

    /**
     * Búsqueda fuzzy fonética. Usa normalización fonética rioplatense para tolerar
     * errores de transcripción por voz (b/v, s/z/c, ll/y, h mudo, etc.).
     * Primero intenta coincidencia exacta normalizada, luego fonética, luego
     * fallback por palabras individuales.
     * @param {string} query
     * @returns {Promise<Array>}
     */
    const searchProductsFuzzy = useCallback(async (query) => {
        if (!query || query.trim().length < 2) return [];

        const words = normalizeText(query).trim().split(/\s+/).filter(w => w.length >= 2);
        if (words.length === 0) return [];

        const phoneticWords = words.map(normalizePhonetic);

        try {
            // Buscar por primer término (índice rápido) como base
            const firstWord = words[0];
            let candidates = await db.products
                .where('description').startsWithIgnoreCase(firstWord)
                .limit(1000)
                .toArray();

            // Complementar con búsqueda contains si pocos resultados
            if (candidates.length < 20) {
                candidates = await db.products
                    .filter(p => normalizeText(p.description).includes(firstWord))
                    .limit(1000)
                    .toArray();
                const seen = new Set(candidates.map(r => r.code));
                // extra.forEach(p => { if (!seen.has(p.code)) { seen.add(p.code); candidates.push(p); } });
            }

            // Filtrar: todos los términos deben aparecer (fonético)
            const matched = candidates.filter(p => {
                const descPhonetic = normalizePhonetic(p.description);
                const descNorm = normalizeText(p.description);
                const brandPhonetic = normalizePhonetic(p.brand || '');
                return phoneticWords.every(pt => {
                    const wt = words[phoneticWords.indexOf(pt)];
                    return descNorm.includes(wt) ||
                        descPhonetic.includes(pt) ||
                        brandPhonetic.includes(pt) ||
                        normalizePhonetic(p.code || '').includes(pt);
                });
            }).slice(0, 50);

            if (matched.length > 0) return matched;

            // Fallback: si hay varias palabras, probar con subconjunto (mayor cobertura primero)
            if (words.length > 1) {
                for (let size = words.length - 1; size >= 1; size--) {
                    const subWords = phoneticWords.slice(0, size);
                    const subMatched = candidates.filter(p => {
                        const descPhonetic = normalizePhonetic(p.description);
                        return subWords.every(pt => descPhonetic.includes(pt));
                    }).slice(0, 50);
                    if (subMatched.length > 0) return subMatched;
                }
            }

        } catch (e) {
            console.error('Fuzzy search error:', e);
        }

        return [];
    }, []);

    return {
        isSyncing,
        lastSync,
        progress,
        syncProducts,
        getProductByCode,
        searchProductsLocally,
        searchProductsFuzzy,
    };
};

export default useProductSync;
