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
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${hasDiscrepancies ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                    {hasDiscrepancies ? 'Con Diferencias' : 'Sin Diferencias'}
                                </span>
                            </div>
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
                            Diferencias
                            {hasDiscrepancies && (
                                <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs font-bold">
                                    {(discrepancies.missing?.length || 0) + (discrepancies.extra?.length || 0)}
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
                                <div className="p-0">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {userStats.items.map((item, itemIdx) => (
                                                    <tr key={itemIdx} className="hover:bg-blue-50/50 transition">
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{item.code}</td>
                                                        <td className="px-6 py-3 text-sm text-gray-600">{item.description}</td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-bold text-slate-700">{item.quantity}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* DISCREPANCIES TAB */}
                {activeTab === 'discrepancies' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        {remito.clarification && (
                            <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <h4 className="text-sm font-bold text-yellow-800 mb-2 flex items-center">
                                    <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
                                    Aclaración General
                                </h4>
                                <p className="text-gray-800 italic">"{remito.clarification}"</p>
                            </div>
                        )}

                        {!hasDiscrepancies ? (
                            <div className="text-center py-16">
                                <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">Todo Coincide</h3>
                                <p className="text-gray-500 mt-2">No se encontraron diferencias entre el stock esperado y el conteo.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* MISSING */}
                                <div>
                                    <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center border-b pb-2">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                        Faltantes ({discrepancies.missing?.length || 0})
                                    </h3>
                                    <div className="space-y-3">
                                        {discrepancies.missing?.map((item, idx) => (
                                            <div key={idx} className="bg-red-50 rounded-lg p-4 border border-red-100">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-bold text-gray-900">{item.description}</p>
                                                        <p className="text-sm text-gray-500 font-mono">{item.code}</p>
                                                        {item.reason && (
                                                            <span className="inline-block mt-2 px-2 py-0.5 bg-red-200 text-red-800 text-xs font-bold rounded uppercase">
                                                                {item.reason === 'no_stock' ? 'Sin Stock' : item.reason === 'damaged' ? 'Dañado' : item.reason}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="block text-2xl font-bold text-red-600">
                                                            {item.scanned - item.expected}
                                                        </span>
                                                        <span className="text-xs text-gray-500">Dif.</span>
                                                    </div>
                                                </div>
                                                <div className="mt-3 pt-2 border-t border-red-100 flex justify-between text-sm text-gray-600">
                                                    <span>Esperado: <strong>{item.expected}</strong></span>
                                                    <span>Escaneado: <strong>{item.scanned}</strong></span>
                                                </div>
                                            </div>
                                        ))}
                                        {(!discrepancies.missing || discrepancies.missing.length === 0) && (
                                            <p className="text-gray-400 italic text-sm">No hay faltantes.</p>
                                        )}
                                    </div>
                                </div>

                                {/* EXTRA */}
                                <div>
                                    <h3 className="text-lg font-bold text-orange-600 mb-4 flex items-center border-b pb-2">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                        Sobrantes ({discrepancies.extra?.length || 0})
                                    </h3>
                                    <div className="space-y-3">
                                        {discrepancies.extra?.map((item, idx) => (
                                            <div key={idx} className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-bold text-gray-900">{item.description}</p>
                                                        <p className="text-sm text-gray-500 font-mono">{item.code}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="block text-2xl font-bold text-orange-600">
                                                            +{item.scanned - item.expected}
                                                        </span>
                                                        <span className="text-xs text-gray-500">Dif.</span>
                                                    </div>
                                                </div>
                                                <div className="mt-3 pt-2 border-t border-orange-100 flex justify-between text-sm text-gray-600">
                                                    <span>Esperado: <strong>{item.expected}</strong></span>
                                                    <span>Escaneado: <strong>{item.scanned}</strong></span>
                                                </div>
                                            </div>
                                        ))}
                                        {(!discrepancies.extra || discrepancies.extra.length === 0) && (
                                            <p className="text-gray-400 italic text-sm">No hay sobrantes.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RemitoDetailsPage;
