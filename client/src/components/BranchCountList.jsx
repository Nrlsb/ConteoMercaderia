import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

const BranchCountList = ({ countId, countName }) => {
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [localQty, setLocalQty] = useState({});

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [countedTotal, setCountedTotal] = useState(0);

    // Search (server-side, debounced)
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const searchTimer = useRef(null);

    const debounceTimers = useRef({});
    const inputRefs = useRef({});
    const listTopRef = useRef(null);

    const fetchPage = useCallback(async (p, q) => {
        if (!countId) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ page: p, pageSize: PAGE_SIZE });
            if (q) params.set('search', q);
            const res = await api.get(`/api/general-counts/${countId}/product-list?${params}`);
            const data = res.data;
            setProducts(data.products);
            setPage(data.page);
            setTotalPages(data.totalPages);
            setTotal(data.total);
            setCountedTotal(data.countedTotal);

            const initial = {};
            data.products.forEach(p => {
                initial[p.code] = p.quantity !== null ? String(p.quantity) : '';
            });
            setLocalQty(initial);
        } catch (err) {
            toast.error('Error al cargar la lista de productos');
        } finally {
            setIsLoading(false);
        }
    }, [countId]);

    // Initial load
    useEffect(() => {
        fetchPage(1, '');
    }, [fetchPage]);

    // Debounce search input → server query
    const handleSearchChange = (value) => {
        setSearchInput(value);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setSearch(value);
            fetchPage(1, value);
        }, 400);
    };

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
            setCountedTotal(prev => {
                // Only increment if this product wasn't already counted
                const wasEmpty = localQty[code] === '' || localQty[code] === undefined;
                return wasEmpty ? prev + 1 : prev;
            });
        } catch (err) {
            toast.error(`Error al guardar ${code}`);
        } finally {
            setIsSaving(false);
        }
    }, [countId, localQty]);

    const handleChange = (code, value) => {
        setLocalQty(prev => ({ ...prev, [code]: value }));
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
            const next = products[index + 1];
            if (next && inputRefs.current[next.code]) {
                inputRefs.current[next.code].focus();
                inputRefs.current[next.code].select();
            } else if (index === products.length - 1 && page < totalPages) {
                // Last row on page → go to next page
                goToPage(page + 1);
            }
        }
    };

    const goToPage = (p) => {
        if (p < 1 || p > totalPages) return;
        fetchPage(p, search);
        listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const progressPct = total > 0 ? (countedTotal / total) * 100 : 0;

    const renderPagination = () => {
        if (totalPages <= 1) return null;
        return (
            <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 gap-3">
                <div className="text-xs text-gray-500 text-center sm:text-left">
                    Página <span className="font-semibold">{page}</span> de <span className="font-semibold">{totalPages}</span> · {total} productos
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-center">
                    <button
                        onClick={() => goToPage(1)}
                        disabled={page === 1 || isLoading}
                        className="p-1.5 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-white bg-gray-50 transition shadow-sm"
                        title="Primera página"
                    >
                        «
                    </button>
                    <button
                        onClick={() => goToPage(page - 1)}
                        disabled={page === 1 || isLoading}
                        className="px-3 py-1.5 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-white bg-gray-50 transition shadow-sm font-medium"
                    >
                        Anterior
                    </button>

                    <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                            const p = start + i;
                            if (p > totalPages) return null;
                            return (
                                <button
                                    key={p}
                                    onClick={() => goToPage(p)}
                                    disabled={isLoading}
                                    className={`w-8 h-8 flex items-center justify-center text-xs rounded border transition shadow-sm ${p === page
                                            ? 'border-blue-500 bg-blue-500 text-white font-bold'
                                            : 'border-gray-300 bg-white hover:bg-gray-100'
                                        }`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => goToPage(page + 1)}
                        disabled={page === totalPages || isLoading}
                        className="px-3 py-1.5 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-white bg-gray-50 transition shadow-sm font-medium"
                    >
                        Siguiente
                    </button>
                    <button
                        onClick={() => goToPage(totalPages)}
                        disabled={page === totalPages || isLoading}
                        className="p-1.5 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-white bg-gray-50 transition shadow-sm"
                        title="Última página"
                    >
                        »
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full" ref={listTopRef}>
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
                        {countedTotal} / {total} productos cargados
                        {isSaving && <span className="ml-2 text-blue-500 animate-pulse font-medium">· Guardando...</span>}
                    </p>
                </div>
                <div className="relative w-full sm:w-64">
                    <input
                        type="text"
                        placeholder="Buscar producto o código..."
                        value={searchInput}
                        onChange={e => handleSearchChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-9 transition-all"
                    />
                    <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 h-1.5 relative z-10">
                <div
                    className="bg-blue-500 h-1.5 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                />
            </div>

            {/* Top Pagination */}
            {!isLoading && products.length > 0 && renderPagination()}

            {/* Product list */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
                        <p>Cargando productos...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p>No se encontraron productos</p>
                    </div>
                ) : (
                    <div className="w-full text-sm">
                        {/* Desktop Header */}
                        <div className="hidden sm:flex bg-gray-100 sticky top-0 z-10 border-b border-gray-200">
                            <div className="px-4 py-2 font-medium text-gray-600 w-12 text-xs">#</div>
                            <div className="flex-1 px-4 py-2 font-medium text-gray-600">Descripción</div>
                            <div className="w-32 px-4 py-2 font-medium text-gray-600 text-center">Código</div>
                            <div className="w-36 px-4 py-2 font-medium text-gray-600 text-right">Cantidad</div>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {products.map((product, index) => {
                                const rawVal = localQty[product.code] ?? '';
                                const hasValue = rawVal !== '' && !isNaN(parseFloat(rawVal));
                                const globalIndex = (page - 1) * PAGE_SIZE + index;

                                return (
                                    <div
                                        key={product.code}
                                        className={`flex flex-col sm:flex-row sm:items-center transition-colors py-3 sm:py-0 border-l-4 ${hasValue
                                                ? 'bg-green-50 hover:bg-green-100 border-green-500'
                                                : product.has_other_scans
                                                    ? 'bg-amber-50/30 hover:bg-amber-50 border-amber-400'
                                                    : 'bg-white hover:bg-gray-50 border-transparent'
                                            }`}
                                    >
                                        {/* Desktop # */}
                                        <div className="hidden sm:flex items-center px-4 py-2 text-gray-400 text-xs font-mono w-12">
                                            {product.excel_order !== null ? product.excel_order + 1 : globalIndex + 1}
                                        </div>

                                        {/* Description */}
                                        <div className="flex-1 px-4 py-1 sm:py-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-semibold sm:font-medium text-gray-900 sm:text-gray-800 text-sm sm:text-sm">
                                                    {product.description || '—'}
                                                </div>
                                                {product.has_other_scans && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                                        <svg className="w-2.5 h-2.5 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                                                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                                        </svg>
                                                        Contado por otros
                                                    </span>
                                                )}
                                            </div>
                                            {/* Mobile Order # (optional) */}
                                            <div className="sm:hidden text-[10px] text-gray-400 mt-0.5">
                                                Producto #{product.excel_order !== null ? product.excel_order + 1 : globalIndex + 1}
                                            </div>
                                        </div>

                                        {/* Mobile / Desktop Footer (Code + Qty) */}
                                        <div className="flex items-center justify-between sm:justify-end px-4 py-1 sm:py-0 border-t border-gray-50 sm:border-0 mt-2 sm:mt-0">
                                            {/* Code - shown as badge on mobile, mono on desktop */}
                                            <div className="text-gray-500 font-mono text-[11px] sm:text-xs sm:w-32 sm:text-center sm:px-4 sm:py-2">
                                                <span className="sm:hidden text-gray-400 mr-1">Cód:</span>
                                                {product.code}
                                            </div>

                                            {/* Quantity Input */}
                                            <div className="sm:w-36 sm:px-4 sm:py-2 text-right">
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
                                                    className={`w-28 px-2 py-2 border rounded-lg text-right font-bold text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all
                                                        ${hasValue
                                                            ? 'border-green-400 bg-white text-green-700 shadow-sm'
                                                            : 'border-gray-300 bg-white text-gray-700'
                                                        }`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Pagination */}
            {!isLoading && products.length > 0 && renderPagination()}
        </div>
    );
};

export default BranchCountList;
