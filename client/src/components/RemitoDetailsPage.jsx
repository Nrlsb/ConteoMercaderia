import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

const RemitoDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'discrepancies' | 'scanned'
    const [error, setError] = useState(null);
    const [expandedBrands, setExpandedBrands] = useState({}); // Track expanded brands per user
    const [expandedSummaryBrands, setExpandedSummaryBrands] = useState({}); // Track expanded brands in the summary

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const response = await api.get(`/api/remitos/${id}/details`);
                setData(response.data);
            } catch (err) {
                console.error('Error fetching details:', err);
                setError('No se pudo cargar el detalle del remito.');
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchDetails();
    }, [id]);

    if (loading) return (
        <div className="flex justify-center items-center h-screen bg-gray-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue"></div>
        </div>
    );

    if (error || !data) return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
            <div className="text-red-500 font-medium mb-4">{error || 'Remito no encontrado'}</div>
            <button
                onClick={() => navigate('/list')}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-100"
            >
                Volver al listado
            </button>
        </div>
    );

    const { remito, userCounts } = data;
    const isInProgress = !remito.is_finalized;
    const discrepancies = remito.discrepancies || { missing: [], extra: [] };
    const hasDiscrepancies = discrepancies.missing?.length > 0 || discrepancies.extra?.length > 0;

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <button
                        onClick={() => navigate('/list')}
                        className="mb-4 flex items-center text-sm text-gray-500 hover:text-brand-blue transition"
                    >
                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        Volver al Historial
                    </button>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">
                                {remito.count_name ? `Conteo: ${remito.count_name}` : `Remito #${remito.remito_number}`}
                            </h1>
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span className="flex items-center">
                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                    {new Date(remito.date).toLocaleDateString()}
                                </span>
                                <span className="flex items-center">
                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                                    {userCounts.length} participante(s)
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${isInProgress ? 'bg-blue-100 text-blue-700' : hasDiscrepancies ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                    {isInProgress ? 'En curso' : hasDiscrepancies ? 'Con Diferencias' : 'Sin Diferencias'}
                                </span>
                            </div>

                            {/* Progress Indicator */}
                            {(remito.items?.length > 0 || (remito.discrepancies?.missing?.length > 0)) && (
                                <div className="mt-4 max-w-md">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Avance del Conteo</span>
                                        <span className="text-sm font-bold text-brand-blue">
                                            {(() => {
                                                const totalExpected = remito.items?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0;
                                                const totalScanned = userCounts.reduce((acc, u) => acc + (u.totalUnits || 0), 0) || 0;
                                                return totalExpected > 0 ? Math.min(Math.round((totalScanned / totalExpected) * 100), 100) : 100;
                                            })()}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200">
                                        <div
                                            className="bg-brand-blue h-full rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                            style={{
                                                width: `${(() => {
                                                    const totalExpected = remito.items?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0;
                                                    const totalScanned = userCounts.reduce((acc, u) => acc + (u.totalUnits || 0), 0) || 0;
                                                    return totalExpected > 0 ? Math.min(Math.round((totalScanned / totalExpected) * 100), 100) : 100;
                                                })()}%`
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Top Actions */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    api.get(`/api/remitos/${id}/export`, { responseType: 'blob' })
                                        .then((response) => {
                                            const url = window.URL.createObjectURL(new Blob([response.data]));
                                            const link = document.createElement('a');
                                            link.href = url;

                                            // Try to extract filename from header or default
                                            const contentDisposition = response.headers['content-disposition'];
                                            let fileName = `Reporte_${remito.remito_number}.xlsx`;
                                            if (contentDisposition) {
                                                const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                                                if (fileNameMatch && fileNameMatch.length === 2)
                                                    fileName = fileNameMatch[1];
                                            }

                                            link.setAttribute('download', fileName);
                                            document.body.appendChild(link);
                                            link.click();
                                            link.remove();
                                        })
                                        .catch((err) => console.error('Export failed', err));
                                }}
                                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue"
                            >
                                <svg className="h-4 w-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                Exportar Excel
                            </button>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 overflow-x-auto">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('users')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition ${activeTab === 'users'
                                ? 'border-brand-blue text-brand-blue'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            Conteo por Usuario
                        </button>
                        <button
                            onClick={() => setActiveTab('discrepancies')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition flex items-center ${activeTab === 'discrepancies'
                                ? 'border-brand-blue text-brand-blue'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            {isInProgress ? 'Pendiente de contar' : 'Diferencias'}
                            {hasDiscrepancies && !isInProgress && (
                                <span className="ml-2 bg-orange-100 text-orange-600 py-0.5 px-2 rounded-full text-[10px] font-bold">
                                    Diferencias
                                </span>
                            )}
                        </button>
                    </nav>
                </div>
            </div>

            {/* Content Area */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* USER COUNTS TAB */}
                {activeTab === 'users' && (
                    <div className="space-y-6">
                        {userCounts.map((userStats, idx) => (
                            <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                                            {userStats.username.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">{userStats.username}</h3>
                                            <p className="text-sm text-gray-500">
                                                Escaneó <span className="font-semibold text-gray-700">{userStats.totalItems}</span> productos ({userStats.totalUnits} unidades)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4">
                                    {(() => {
                                        // Group items by brand (use brand field if available)
                                        const brandGroups = {};
                                        userStats.items.forEach(item => {
                                            // Use brand field if available, otherwise parse description
                                            // Use brand field if available, otherwise apply a safer fallback
                                            let brand = item.brand;
                                            if (!brand && item.description) {
                                                const firstWord = item.description.split(' ')[0]?.toUpperCase();
                                                if (firstWord && firstWord.length > 3) {
                                                    brand = firstWord;
                                                }
                                            }
                                            if (!brand) brand = 'OTRAS MARCAS';
                                            if (!brandGroups[brand]) {
                                                brandGroups[brand] = { items: [], totalUnits: 0 };
                                            }
                                            brandGroups[brand].items.push(item);
                                            brandGroups[brand].totalUnits += item.quantity;
                                        });

                                        const brands = Object.keys(brandGroups).sort();
                                        const userKey = `user-${idx}`;

                                        return (
                                            <div className="space-y-2">
                                                {brands.map(brand => {
                                                    const brandKey = `${userKey}-${brand}`;
                                                    const isExpanded = expandedBrands[brandKey];
                                                    const brandData = brandGroups[brand];

                                                    return (
                                                        <div key={brand} className="border border-gray-200 rounded-lg overflow-hidden">
                                                            <button
                                                                onClick={() => setExpandedBrands(prev => ({ ...prev, [brandKey]: !prev[brandKey] }))}
                                                                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition flex items-center justify-between"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded bg-blue-500 flex items-center justify-center text-white font-bold text-xs">
                                                                        {brand.substring(0, 2)}
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <div className="font-bold text-gray-900">{brand}</div>
                                                                        <div className="text-xs text-gray-500">
                                                                            {brandData.items.length} producto{brandData.items.length !== 1 ? 's' : ''} • {brandData.totalUnits} unidades
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <svg
                                                                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    viewBox="0 0 24 24"
                                                                >
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                                                </svg>
                                                            </button>
                                                            {isExpanded && (
                                                                <div className="bg-white">
                                                                    <table className="min-w-full divide-y divide-gray-200">
                                                                        <thead className="bg-gray-50">
                                                                            <tr>
                                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                                                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-200">
                                                                            {brandData.items.map((item, itemIdx) => (
                                                                                <tr key={itemIdx} className="hover:bg-blue-50/30 transition">
                                                                                    <td className="px-4 py-2 text-sm font-mono text-gray-900">{item.code}</td>
                                                                                    <td className="px-4 py-2 text-sm text-gray-600">{item.description}</td>
                                                                                    <td className="px-4 py-2 text-sm text-right font-bold text-gray-900">{item.quantity}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* PROGRESS / DISCREPANCIES TAB */}
                {activeTab === 'discrepancies' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                            <h3 className="text-lg font-bold text-gray-900">
                                {isInProgress ? 'Productos Pendientes por Marca' : 'Reporte de Diferencias'}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {isInProgress
                                    ? 'Lista de productos que aún no han sido contados, agrupados por marca.'
                                    : 'Comparativa final entre lo esperado y lo efectivamente contado.'}
                            </p>
                        </div>

                        {remito.clarification && (
                            <div className="m-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <h4 className="text-sm font-bold text-yellow-800 mb-2 flex items-center">
                                    <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
                                    Aclaración General
                                </h4>
                                <p className="text-gray-800 italic">"{remito.clarification}"</p>
                            </div>
                        )}

                        {/* BRAND SUMMARY TABLE (SCROLL TO SEE UNSCANNED) */}
                        {isInProgress && remito.items?.length > 0 && (
                            <div className="m-6 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                                <h4 className="text-sm font-bold text-blue-900 mb-4 flex items-center">
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01m-.01 4h.01"></path></svg>
                                    Resumen por Marca (Pendientes)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {(() => {
                                        const brandSummary = {};
                                        remito.items.forEach(item => {
                                            const brand = item.brand || 'OTRAS MARCAS';
                                            if (!brandSummary[brand]) {
                                                brandSummary[brand] = { totalExpected: 0, totalScanned: 0, unscannedItems: [] };
                                            }

                                            let scannedQty = 0;
                                            userCounts.forEach(u => {
                                                const match = u.items.find(i => i.code === item.code);
                                                if (match) scannedQty += match.quantity;
                                            });

                                            brandSummary[brand].totalExpected += item.quantity;
                                            brandSummary[brand].totalScanned += scannedQty;

                                            if (scannedQty === 0) {
                                                brandSummary[brand].unscannedItems.push(item);
                                            }
                                        });

                                        return Object.keys(brandSummary).sort().map(brand => {
                                            const data = brandSummary[brand];
                                            const isExpanded = expandedSummaryBrands[brand];
                                            const progress = data.totalExpected > 0 ? Math.round((data.totalScanned / data.totalExpected) * 100) : 0;

                                            return (
                                                <div key={brand} className="bg-white border border-blue-100 rounded-lg shadow-sm overflow-hidden flex flex-col">
                                                    <button
                                                        onClick={() => setExpandedSummaryBrands(prev => ({ ...prev, [brand]: !prev[brand] }))}
                                                        className="p-3 text-left hover:bg-gray-50 transition-colors flex flex-col gap-2"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-bold text-gray-900 text-sm truncate">{brand}</span>
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${data.unscannedItems.length === 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                {data.unscannedItems.length} pendientes
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                            <div
                                                                className="bg-brand-blue h-full rounded-full transition-all duration-500"
                                                                style={{ width: `${progress}%` }}
                                                            ></div>
                                                        </div>
                                                        <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                                                            <span>{data.totalScanned} / {data.totalExpected} unid.</span>
                                                            <span>{progress}%</span>
                                                        </div>
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="border-t border-gray-100 max-h-48 overflow-y-auto bg-gray-50/50">
                                                            {data.unscannedItems.length > 0 ? (
                                                                <table className="min-w-full text-[11px]">
                                                                    <thead className="bg-gray-100/80 sticky top-0">
                                                                        <tr>
                                                                            <th className="px-2 py-1 text-left text-gray-500">Producto</th>
                                                                            <th className="px-2 py-1 text-right text-gray-500 whitespace-nowrap">Esp.</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-200">
                                                                        {data.unscannedItems.map((item, i) => (
                                                                            <tr key={i} className="hover:bg-blue-50">
                                                                                <td className="px-2 py-1.5 text-gray-700 leading-tight">
                                                                                    {item.description || item.name}
                                                                                    <div className="text-[9px] text-gray-400 font-mono mt-0.5">{item.code}</div>
                                                                                </td>
                                                                                <td className="px-2 py-1.5 text-right font-bold text-gray-900">{item.quantity}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            ) : (
                                                                <div className="p-4 text-center text-xs text-green-600 font-medium bg-green-50/50">
                                                                    🎉 Todos los productos escaneados
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        )}

                        {!isInProgress && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Esperado</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Contado</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Dif.</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {/* Expected Items */}
                                        {(remito.items || []).map((item, idx) => {
                                            // Calculate total scanned for this item across all users
                                            let totalScanned = 0;
                                            userCounts.forEach(u => {
                                                const match = u.items.find(i => i.code === item.code);
                                                if (match) totalScanned += match.quantity;
                                            });

                                            const diff = totalScanned - item.quantity;
                                            const progress = item.quantity > 0 ? Math.min(Math.round((totalScanned / item.quantity) * 100), 100) : 100;
                                            const isComplete = totalScanned >= item.quantity;
                                            const isMissing = totalScanned < item.quantity;
                                            const isExtra = totalScanned > item.quantity;

                                            return (
                                                <tr key={idx} className={`${isMissing ? 'bg-red-50/30' : isExtra ? 'bg-orange-50/30' : 'bg-green-50/30'} hover:bg-gray-100 transition`}>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm font-bold text-gray-900">{item.description || item.name}</div>
                                                        <div className="text-xs text-gray-500 font-mono">{item.code}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-semibold text-gray-700">
                                                        {item.quantity}
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-bold">
                                                        <span className={isMissing ? 'text-red-600' : isExtra ? 'text-orange-600' : 'text-green-600'}>
                                                            {totalScanned}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-bold">
                                                        {diff === 0 ? (
                                                            <span className="text-gray-400">-</span>
                                                        ) : (
                                                            <span className={diff < 0 ? 'text-red-600 font-bold' : 'text-blue-600 font-bold'}>
                                                                {diff > 0 ? `+${diff}` : diff}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 min-w-[150px]">
                                                        <div className="flex flex-col">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className={`text-[10px] font-bold uppercase ${isMissing ? 'text-red-600' : isExtra ? 'text-blue-600' : 'text-green-600'}`}>
                                                                    {isMissing ? `Faltan ${Math.abs(diff)}` : isExtra ? `Sobran ${diff}` : 'Completo'}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-gray-500">{progress}%</span>
                                                            </div>
                                                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-500 ${isExtra ? 'bg-blue-500' : isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                                                                    style={{ width: `${progress}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}

                                        {/* Extra Items (Scanned but not in remito) */}
                                        {discrepancies.extra?.map((item, idx) => {
                                            // Avoid duplicates if already shown in expected
                                            if (remito.items?.some(i => i.code === item.code)) return null;

                                            return (
                                                <tr key={`extra-${idx}`} className="bg-blue-50/50 hover:bg-blue-100/50 transition border-l-4 border-blue-400">
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm font-bold text-blue-900">{item.description}</div>
                                                        <div className="text-xs text-blue-700 font-mono">{item.code}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-normal text-gray-400">
                                                        0
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-bold text-blue-700">
                                                        {item.scanned}
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-bold text-blue-600">
                                                        +{item.scanned}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase">
                                                            Producto Extra (+{item.scanned})
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RemitoDetailsPage;
