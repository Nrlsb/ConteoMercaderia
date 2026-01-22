import React, { useState, useEffect } from 'react';
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
        setSelectedRemito(remito);
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
                                            <span className="text-lg font-bold text-blue-600 block">
                                                {remito.remito_number}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {new Date(remito.date).toLocaleDateString()} • {new Date(remito.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${remito.status === 'processed'
                                            ? 'bg-green-100 text-green-800'
                                            : remito.status === 'voided'
                                                ? 'bg-gray-100 text-gray-800'
                                                : 'bg-amber-100 text-amber-800'
                                            }`}>
                                            {remito.status === 'processed' ? 'Procesado' : remito.status === 'voided' ? 'Anulado' : 'Pendiente'}
                                        </span>
                                    </div>
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pedido Venta</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pre-Remito</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sucursal</th>
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
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
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
                                        <td colSpan={user?.role === 'admin' ? "8" : "7"} className="px-6 py-10 text-center text-gray-500">
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
                                                <span className="text-sm text-gray-900 font-mono">{remito.numero_pv || '-'}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm font-semibold text-brand-blue font-mono">{remito.remito_number}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm text-gray-500">{remito.sucursal || '-'}</span>
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
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${remito.discrepancies && Object.keys(remito.discrepancies).length > 0 ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                                    {remito.discrepancies && Object.keys(remito.discrepancies).length > 0 ? 'Pendiente' : 'Procesado'}
                                                </span>
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

            {/* Details Modal */}
            {selectedRemito && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-white">
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Remito: {selectedRemito.remito_number}</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Creado por: <span className="font-medium">{selectedRemito.created_by || 'Sistema'}</span>
                                </p>
                            </div>
                            <button onClick={closeDetails} className="text-gray-400 hover:text-gray-600 transition p-2 hover:bg-gray-100 rounded-full">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-white flex flex-col">
                            {/* Main Tabs */}
                            <div className="flex border-b border-gray-200">
                                <button
                                    onClick={() => setMainTab('scanned')}
                                    className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition ${mainTab === 'scanned'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Productos Escaneados
                                </button>
                                <button
                                    onClick={() => setMainTab('discrepancies')}
                                    className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition ${mainTab === 'discrepancies'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Discrepancias
                                    {(selectedRemito.discrepancies?.missing?.length > 0 || selectedRemito.discrepancies?.extra?.length > 0) && (
                                        <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs font-bold">
                                            !
                                        </span>
                                    )}
                                </button>
                            </div>

                            <div className="p-6 flex-1 overflow-y-auto">
                                {mainTab === 'scanned' && (
                                    <div className="animate-in fade-in duration-200">
                                        <div className="space-y-3">
                                            {selectedRemito.items && selectedRemito.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        <p className="font-medium text-gray-900 text-sm truncate">{item.name || item.description || 'Producto'}</p>
                                                        <p className="text-xs text-gray-400 font-mono mt-0.5">{item.code || item.barcode}</p>
                                                    </div>
                                                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                                                        <span className="text-xs font-bold text-gray-700">x{item.quantity}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!selectedRemito.items || selectedRemito.items.length === 0) && (
                                                <div className="text-center py-10 text-gray-400 text-sm">
                                                    No hay productos escaneados
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {mainTab === 'discrepancies' && (
                                    <div className="animate-in fade-in duration-200">
                                        {(selectedRemito.discrepancies && (selectedRemito.discrepancies.missing?.length > 0 || selectedRemito.discrepancies.extra?.length > 0)) ? (
                                            <>
                                                {/* Clarification Section */}
                                                {selectedRemito.clarification && (
                                                    <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                                        <h5 className="text-sm font-bold text-yellow-800 mb-1 flex items-center">
                                                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
                                                            Aclaración del Usuario
                                                        </h5>
                                                        <p className="text-sm text-yellow-900 italic">
                                                            "{selectedRemito.clarification}"
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Chips for Discrepancies */}
                                                <div className="flex gap-3 mb-6">
                                                    <button
                                                        onClick={() => setDiscrepancyTab('missing')}
                                                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition flex flex-col items-center justify-center border-2 ${discrepancyTab === 'missing'
                                                            ? 'bg-red-50 text-red-700 border-red-200 shadow-sm'
                                                            : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200'
                                                            }`}
                                                    >
                                                        <span className="text-xs font-normal mb-1 opacity-80">Faltantes</span>
                                                        <span className="text-xl">{selectedRemito.discrepancies.missing?.length || 0}</span>
                                                    </button>

                                                </div>

                                                <div className="min-h-[150px]">
                                                    {discrepancyTab === 'missing' && (
                                                        <div className="animate-in fade-in duration-200">
                                                            {selectedRemito.discrepancies.missing?.length > 0 ? (
                                                                <ul className="space-y-3">
                                                                    {selectedRemito.discrepancies.missing.map((item, idx) => (
                                                                        <li key={idx} className="flex items-start bg-[#FFF1F2] p-3 rounded-r-lg border-l-4 border-red-500 shadow-sm">
                                                                            <div className="mt-1 mr-3 text-red-500">
                                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                                                            </div>
                                                                            <div className="flex-1 min-w-0 mr-3">
                                                                                <span className="text-gray-900 font-medium text-sm block line-clamp-2 leading-snug mb-1">{item.description || item.code}</span>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-xs text-gray-500 font-mono block">{item.code}</span>
                                                                                    {item.reason && (
                                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${item.reason === 'no_stock' ? 'bg-gray-200 text-gray-700' : 'bg-red-200 text-red-800'}`}>
                                                                                            {item.reason === 'no_stock' ? 'Sin Stock' : 'Dañado'}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-col items-center justify-center">
                                                                                <div className="h-10 w-10 rounded-full bg-white border-2 border-red-100 flex items-center justify-center shadow-sm">
                                                                                    <span className="text-sm font-bold text-red-600">-{item.expected - item.scanned}</span>
                                                                                </div>
                                                                                <span className="text-[10px] text-gray-400 mt-1">
                                                                                    Esp: {item.expected}
                                                                                </span>
                                                                            </div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <div className="text-center py-8 text-gray-400 text-sm">
                                                                    No hay faltantes registrados
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}


                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                                </div>
                                                <h4 className="text-gray-900 font-medium">Todo en orden</h4>
                                                <p className="text-gray-500 text-sm mt-1">No se encontraron discrepancias en este remito.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={closeDetails}
                                className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition font-medium text-sm shadow-sm"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RemitoList;
