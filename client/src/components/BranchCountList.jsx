import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { toast } from 'sonner';

const BranchCountList = ({ countId, countName }) => {
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [localQty, setLocalQty] = useState({}); // { code: string } - raw input values
    const debounceTimers = useRef({});
    const inputRefs = useRef({});

    // Load product list with already-scanned quantities
    useEffect(() => {
        if (!countId) return;
        const load = async () => {
            setIsLoading(true);
            try {
                const res = await api.get(`/api/general-counts/${countId}/product-list`);
                setProducts(res.data.products);
                const initial = {};
                res.data.products.forEach(p => {
                    initial[p.code] = p.quantity !== null ? String(p.quantity) : '';
                });
                setLocalQty(initial);
            } catch (err) {
                toast.error('Error al cargar la lista de productos');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [countId]);

    const saveQuantity = useCallback(async (code, value) => {
        const qty = parseFloat(value);
        if (isNaN(qty) || qty < 0) return;
        try {
            setIsSaving(true);
            await api.post('/api/inventory/scan', {
                orderNumber: countId,
                items: [{ code, quantity: qty }]
            });
            setProducts(prev => prev.map(p => p.code === code ? { ...p, quantity: qty } : p));
        } catch (err) {
            toast.error(`Error al guardar ${code}`);
        } finally {
            setIsSaving(false);
        }
    }, [countId]);

    const handleChange = (code, value) => {
        setLocalQty(prev => ({ ...prev, [code]: value }));
        // Debounce save
        clearTimeout(debounceTimers.current[code]);
        debounceTimers.current[code] = setTimeout(() => {
            if (value !== '' && !isNaN(parseFloat(value))) {
                saveQuantity(code, value);
            }
        }, 800);
    };

    const handleBlur = (code, value) => {
        clearTimeout(debounceTimers.current[code]);
        if (value !== '' && !isNaN(parseFloat(value))) {
            saveQuantity(code, value);
        }
    };

    const handleKeyDown = (e, code, index) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Move to next product input
            const codes = filtered.map(p => p.code);
            const next = codes[index + 1];
            if (next && inputRefs.current[next]) {
                inputRefs.current[next].focus();
                inputRefs.current[next].select();
            }
        }
    };

    const filtered = products.filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            p.description?.toLowerCase().includes(q) ||
            p.code?.toLowerCase().includes(q)
        );
    });

    const countedCount = products.filter(p => p.quantity !== null && p.quantity >= 0).length;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
                <p>Cargando lista de productos...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div>
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Lista de Conteo
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {countedCount} / {products.length} productos cargados
                        {isSaving && <span className="ml-2 text-blue-500 animate-pulse">· Guardando...</span>}
                    </p>
                </div>
                <input
                    type="text"
                    placeholder="Buscar producto o código..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 h-1.5">
                <div
                    className="bg-blue-500 h-1.5 transition-all duration-300"
                    style={{ width: products.length > 0 ? `${(countedCount / products.length) * 100}%` : '0%' }}
                />
            </div>

            {/* Product list */}
            <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p>No se encontraron productos</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="text-left px-4 py-2 font-medium text-gray-600 w-8 text-xs">#</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-600">Descripción</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-600 w-28">Código</th>
                                <th className="text-right px-4 py-2 font-medium text-gray-600 w-32">Cantidad</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map((product, index) => {
                                const rawVal = localQty[product.code] ?? '';
                                const hasValue = rawVal !== '' && !isNaN(parseFloat(rawVal));

                                return (
                                    <tr
                                        key={product.code}
                                        className={`transition-colors ${hasValue ? 'bg-green-50 hover:bg-green-100' : 'bg-white hover:bg-gray-50'}`}
                                    >
                                        <td className="px-4 py-2 text-gray-400 text-xs font-mono">
                                            {product.excel_order !== null ? product.excel_order + 1 : index + 1}
                                        </td>
                                        <td className="px-4 py-2 font-medium text-gray-800">
                                            {product.description || '—'}
                                        </td>
                                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                                            {product.code}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <input
                                                ref={el => inputRefs.current[product.code] = el}
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={rawVal}
                                                onChange={e => handleChange(product.code, e.target.value)}
                                                onBlur={e => handleBlur(product.code, e.target.value)}
                                                onFocus={e => e.target.select()}
                                                onKeyDown={e => handleKeyDown(e, product.code, index)}
                                                placeholder="—"
                                                className={`w-24 px-2 py-1.5 border rounded-lg text-right font-bold text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition
                                                    ${hasValue
                                                        ? 'border-green-400 bg-white text-green-700'
                                                        : 'border-gray-300 bg-white text-gray-700'
                                                    }`}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default BranchCountList;
