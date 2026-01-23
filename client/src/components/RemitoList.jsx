import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';

const RemitoList = () => {
    const { user } = useAuth();
    const [remitos, setRemitos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRemito, setSelectedRemito] = useState(null);

    // Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [mainTab, setMainTab] = useState('scanned');
    const [discrepancyTab, setDiscrepancyTab] = useState('missing');

    useEffect(() => {
        fetchRemitos();
    }, []);

    const navigate = useNavigate();

    const fetchRemitos = async () => {
        try {
            const response = await api.get('/api/remitos');
            setRemitos(response.data);
        } catch (error) {
            console.error('Error fetching remitos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = (remito) => {
        navigate(`/remitos/${remito.id}`);
    };

    const closeDetails = () => {
        setSelectedRemito(null);
        setMainTab('scanned'); // Reset main tab
        setDiscrepancyTab('missing'); // Reset discrepancy tab
    };

    // Filter Logic
    const filteredRemitos = remitos.filter(remito => {
        const matchesSearch = remito.remito_number.toLowerCase().includes(searchTerm.toLowerCase());

        let matchesDate = true;
        if (startDate || endDate) {
            const remitoDate = new Date(remito.date);
            // Reset time for accurate date comparison
            remitoDate.setHours(0, 0, 0, 0);

            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                if (remitoDate < start) matchesDate = false;
            }

            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                if (remitoDate > end) matchesDate = false;
            }
        }

        return matchesSearch && matchesDate;
    });

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Header & Filters */}
                <div className="p-6 border-b border-gray-200 bg-white">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Historial de Pedidos de Venta</h2>
                            <p className="text-sm text-gray-500 mt-1">Gestiona y audita los movimientos de mercadería</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-100">
                                Total: {filteredRemitos.length}
                            </span>
                            {/* Mobile Filter Button */}
                            <button
                                onClick={() => setShowMobileFilters(true)}
                                className="md:hidden p-2 text-gray-500 hover:text-blue-600 bg-gray-50 rounded-lg border border-gray-200"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                            </button>
                        </div>
                    </div>

                    {/* Desktop Filters */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4">
                        <div className="md:col-span-5 relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                                placeholder="Buscar por N° de pedido..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="md:col-span-3">
                            <input
                                type="date"
                                className="block w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                placeholder="Fecha desde"
                            />
                        </div>
                        <div className="md:col-span-3">
                            <input
                                type="date"
                                className="block w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                placeholder="Fecha hasta"
                            />
                        </div>
                        <div className="md:col-span-1 flex justify-end">
                            {(searchTerm || startDate || endDate) && (
                                <button
                                    onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); }}
                                    className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition"
                                    title="Limpiar filtros"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Mobile Filter Modal */}
                {showMobileFilters && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/50 backdrop-blur-sm">
                        <div className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl p-6 animate-in slide-in-from-bottom duration-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-900">Filtrar Remitos</h3>
                                <button onClick={() => setShowMobileFilters(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
                                    <input
                                        type="text"
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="N° de remito..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                                        <input
                                            type="date"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                                        <input
                                            type="date"
                                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button
                                        onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); }}
                                        className="flex-1 py-2 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200"
                                    >
                                        Limpiar
                                    </button>
                                    <button
                                        onClick={() => setShowMobileFilters(false)}
                                        className="flex-1 py-2 text-white bg-blue-600 rounded-lg font-medium hover:bg-blue-700"
                                    >
                                        Aplicar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Table Content */}
                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                    </div>
                ) : filteredRemitos.length === 0 ? (
                    <div className="text-center py-20 bg-gray-50">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron remitos</h3>
                        <p className="mt-1 text-sm text-gray-500">Intenta ajustar los filtros de búsqueda.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4 p-4">
                            {filteredRemitos.map((remito) => (
                                <div
                                    key={remito.id}
                                    onClick={() => handleViewDetails(remito)}
                                    className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 active:bg-gray-50 transition cursor-pointer"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-lg font-bold text-blue-600">
                                                    {remito.remito_number}
                                                </span>
                                                {remito.status === 'pending_scanned' && (
                                                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase animate-pulse">
                                                        En Curso
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {new Date(remito.date).toLocaleDateString()} • {new Date(remito.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${remito.status === 'processed'
                                            ? 'bg-green-100 text-green-800'
                                            : remito.status === 'voided'
                                                ? 'bg-gray-100 text-gray-800'
                                                : remito.status === 'pending_scanned'
                                                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                                    : 'bg-amber-100 text-amber-800'
                                            }`}>
                                            {remito.status === 'processed' ? 'Finalizado' : remito.status === 'voided' ? 'Anulado' : remito.status === 'pending_scanned' ? 'En curso' : 'Finalizado'}
                                        </span>
                                    </div>

                                    {remito.status === 'pending_scanned' && remito.progress !== null && (
                                        <div className="mt-3 mb-4">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Progreso de Conteo</span>
                                                <span className="text-xs font-bold text-blue-600">{remito.progress}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-blue-600 h-full rounded-full transition-all duration-1000"
                                                    style={{ width: `${remito.progress}%` }}
                                                ></div>
                                            </div>
                                            {remito.scanned_brands?.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {remito.scanned_brands.map(brand => (
                                                        <span key={brand} className="px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[9px] font-medium border border-gray-200 rounded">
                                                            {brand}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {remito.status === 'pending_scanned' && remito.progress === null && (
                                        <div className="mt-3 mb-4">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Conteo General Activo</span>
                                            </div>
                                            {remito.scanned_brands?.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {remito.scanned_brands.map(brand => (
                                                        <span key={brand} className="px-1.5 py-0.5 bg-gray-50 text-gray-400 text-[9px] font-medium border border-gray-200 rounded">
                                                            {brand}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                        <div className="flex items-center">
                                            {remito.created_by ? (
                                                <>
                                                    <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 mr-2">
                                                        {remito.created_by.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm text-gray-600 truncate max-w-[100px]">{remito.created_by}</span>
                                                </>
                                            ) : (
                                                <span className="text-sm text-gray-400 italic">Sistema</span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {remito.items ? remito.items.length : 0} items
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <table className="hidden md:table min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>

                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conteo</th>

                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                    {user?.role === 'admin' && (
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    [...Array(5)].map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-24"></div></td>

                                            <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-24"></div></td>

                                            <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-12"></div></td>
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                                            {user?.role === 'admin' && (
                                                <td className="px-6 py-4 whitespace-nowrap text-right"><div className="h-4 bg-gray-200 rounded w-8 ml-auto"></div></td>
                                            )}
                                        </tr>
                                    ))
                                ) : filteredRemitos.length === 0 ? (
                                    <tr>
                                        <td colSpan={user?.role === 'admin' ? "6" : "5"} className="px-6 py-10 text-center text-gray-500">
                                            No se encontraron remitos
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRemitos.map((remito) => (
                                        <tr key={remito.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {new Date(remito.date).toLocaleDateString()}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {new Date(remito.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm font-semibold text-brand-blue font-mono">{remito.count_name || remito.remito_number}</span>
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                                    {remito.items?.length || 0}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs uppercase">
                                                        {remito.created_by ? remito.created_by.substring(0, 2) : 'U'}
                                                    </div>
                                                    <div className="ml-3">
                                                        <div className="text-sm font-medium text-gray-900">{remito.created_by || 'Unknown'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`px-2 py-0.5 inline-flex text-[10px] leading-4 font-bold rounded uppercase w-fit ${remito.status === 'pending_scanned' ? 'bg-blue-100 text-blue-700 animate-pulse' : remito.discrepancies && Object.keys(remito.discrepancies).length > 0 ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                                        {remito.status === 'pending_scanned' ? 'En curso' : 'Finalizado'}
                                                    </span>
                                                    {remito.status === 'pending_scanned' && (
                                                        <div className="w-32">
                                                            {remito.progress !== null ? (
                                                                <>
                                                                    <div className="flex justify-between items-center mb-0.5">
                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Progreso</span>
                                                                        <span className="text-[10px] font-bold text-blue-600">{remito.progress}%</span>
                                                                    </div>
                                                                    <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                                                                        <div
                                                                            className="bg-blue-600 h-full rounded-full transition-all duration-1000"
                                                                            style={{ width: `${remito.progress}%` }}
                                                                        ></div>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter block mb-1">Conteo General</span>
                                                            )}
                                                            {remito.scanned_brands?.length > 0 && (
                                                                <div className="mt-1.5 flex flex-wrap gap-1 max-w-[150px]">
                                                                    {remito.scanned_brands.map(brand => (
                                                                        <span key={brand} className="px-1 py-0 bg-gray-50 text-gray-400 text-[8px] font-bold border border-gray-100 rounded uppercase">
                                                                            {brand}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            {user?.role === 'admin' && (
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button onClick={() => handleViewDetails(remito)} className="text-gray-400 hover:text-brand-blue transition">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 5 8.268 7.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
};

export default RemitoList;
