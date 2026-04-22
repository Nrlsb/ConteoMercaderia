import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const BranchIncomingsList = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    
    // Transfers (Pending) State
    const [transfers, setTransfers] = useState([]);
    const [paginationPending, setPaginationPending] = useState({ page: 1, totalPages: 1, total: 0 });
    const [loadingPending, setLoadingPending] = useState(true);

    // Receipts (History) State
    const [receiptHistory, setReceiptHistory] = useState([]);
    const [paginationHistory, setPaginationHistory] = useState({ page: 1, totalPages: 1, total: 0 });
    const [loadingHistory, setLoadingHistory] = useState(true);

    const [processingId, setProcessingId] = useState(null);

    const fetchTransfers = useCallback(async (page = 1) => {
        setLoadingPending(true);
        try {
            const response = await api.get(`/api/branch-transfers/pending?page=${page}&limit=10`);
            setTransfers(response.data.data || []);
            setPaginationPending({
                page: response.data.page,
                totalPages: response.data.totalPages,
                total: response.data.total
            });
        } catch (error) {
            console.error('Error fetching transfers:', error);
            toast.error('Error al cargar transferencias pendientes');
        } finally {
            setLoadingPending(false);
        }
    }, []);

    const fetchReceiptHistory = useCallback(async (page = 1) => {
        setLoadingHistory(true);
        try {
            const response = await api.get(`/api/branch-transfers/receipts?page=${page}&limit=15`);
            setReceiptHistory(response.data.data || []);
            setPaginationHistory({
                page: response.data.page,
                totalPages: response.data.totalPages,
                total: response.data.total
            });
        } catch (error) {
            console.error('Error fetching receipt history:', error);
            toast.error('Error al cargar historial de ingresos');
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        fetchTransfers(1);
        fetchReceiptHistory(1);
    }, [fetchTransfers, fetchReceiptHistory]);

    const handleReceive = async (transferId) => {
        if (!window.confirm('¿Desea iniciar la recepción de este remito? Se creará un nuevo control de ingreso.')) return;
        
        setProcessingId(transferId);
        try {
            const response = await api.post(`/api/branch-transfers/${transferId}/receive`);
            toast.success('Control de ingreso creado correctamente');
            navigate(`/receipts/${response.data.id}`);
        } catch (error) {
            console.error('Error receiving transfer:', error);
            const msg = error.response?.data?.message || 'Error al iniciar la recepción';
            toast.error(msg);
        } finally {
            setProcessingId(null);
        }
    };

    const handleDeleteReceipt = async (receiptId) => {
        if (!window.confirm('¿Estás seguro de que deseas eliminar este control abierto? Esta acción no se puede deshacer.')) return;

        try {
            await api.delete(`/api/receipts/${receiptId}`);
            toast.success('Control eliminado correctamente');
            // Refresh current page
            fetchReceiptHistory(paginationHistory.page);
        } catch (error) {
            console.error('Error deleting receipt:', error);
            const msg = error.response?.data?.message || 'Error al eliminar el control';
            toast.error(msg);
        }
    };

    const PaginationControls = ({ pagination, onPageChange, isLoading }) => {
        if (pagination.totalPages <= 1) return null;

        const pages = [];
        const startPage = Math.max(1, pagination.page - 2);
        const endPage = Math.min(pagination.totalPages, startPage + 4);
        
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        return (
            <div className="flex items-center justify-center gap-2 mt-6 mb-4">
                <button
                    onClick={() => onPageChange(pagination.page - 1)}
                    disabled={pagination.page === 1 || isLoading}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {pages.map(p => (
                    <button
                        key={p}
                        onClick={() => onPageChange(p)}
                        disabled={isLoading}
                        className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                            pagination.page === p
                                ? 'bg-brand-blue text-white shadow-md scale-110'
                                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-blue hover:text-brand-blue'
                        }`}
                    >
                        {p}
                    </button>
                ))}

                <button
                    onClick={() => onPageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages || isLoading}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        );
    };

    if (loadingPending && loadingHistory && transfers.length === 0 && receiptHistory.length === 0) return (
        <div className="flex flex-col justify-center items-center h-64 bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm animate-pulse">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-brand-blue rounded-full animate-spin"></div>
            <span className="mt-4 text-gray-500 font-medium">Cargando transferencias e historial...</span>
        </div>
    );

    return (
        <div className="container mx-auto p-4 max-w-lg md:max-w-4xl animate-in fade-in duration-500">
            <div className="mb-8 p-6 bg-gradient-to-br from-brand-blue to-blue-700 rounded-2xl shadow-lg relative overflow-hidden">
                {/* Decorative circles */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
                
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Ingreso Sucursal</h1>
                <p className="text-blue-100/80 text-sm mt-2 max-w-md">
                    Gestiona los remitos de egreso destinados a tu sucursal y haz el seguimiento de tus ingresos.
                </p>
                <div className="flex gap-4 mt-4">
                    <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20">
                        <span className="block text-[10px] text-blue-200 uppercase font-bold tracking-wider">Pendientes</span>
                        <span className="text-white font-bold">{paginationPending.total}</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20">
                        <span className="block text-[10px] text-blue-200 uppercase font-bold tracking-wider">Historial</span>
                        <span className="text-white font-bold">{paginationHistory.total}</span>
                    </div>
                </div>
            </div>

            {transfers.length === 0 && receiptHistory.length === 0 && !loadingPending && !loadingHistory ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-gray-300 shadow-sm transition-all hover:border-brand-blue/50 group">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                        <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                    </div>
                    <p className="text-gray-600 font-bold text-xl">Sin actividad registrada</p>
                    <p className="text-gray-400 text-sm mt-2 max-w-xs mx-auto">Los remitos aparecerán aquí automáticamente cuando el depósito finalice un envío para tu sucursal.</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {/* Sección de Transferencias Pendientes */}
                    {(transfers.length > 0 || loadingPending) && (
                        <div className="relative">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-black text-gray-800 flex items-center gap-3">
                                    <span className="flex h-3 w-3 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-sm shadow-emerald-200"></span>
                                    </span>
                                    Pendientes de Recibir
                                </h2>
                                {loadingPending && transfers.length > 0 && (
                                    <div className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
                                )}
                            </div>
                            
                            <div className={`transition-opacity duration-300 ${loadingPending && transfers.length > 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                                {/* Desktop View */}
                                <div className="hidden md:block bg-white shadow-xl shadow-gray-100 rounded-2xl overflow-hidden border border-gray-100">
                                    <table className="min-w-full">
                                        <thead>
                                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Referencia / Remito</th>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Destino</th>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Fecha Envío</th>
                                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-widest">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {transfers.map(transfer => (
                                                <tr key={transfer.id} className="hover:bg-blue-50/30 transition-colors group">
                                                    <td className="px-6 py-5">
                                                        <div className="flex flex-col">
                                                            <p className="text-gray-900 font-black text-base group-hover:text-brand-blue transition-colors">{transfer.reference_number}</p>
                                                            <p className="text-xs text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                                </svg>
                                                                {transfer.pdf_filename || 'Carga manual'}
                                                            </p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-[11px] font-black tracking-wide border border-blue-100 uppercase">
                                                            {transfer.sucursal?.name || 'Sucursal'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <p className="text-gray-700 font-bold text-sm">
                                                            {new Date(transfer.date).toLocaleDateString()}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 font-medium tracking-tight">
                                                            {new Date(transfer.date).toLocaleTimeString()}
                                                        </p>
                                                    </td>
                                                    <td className="px-6 py-5 text-right">
                                                        <button
                                                            onClick={() => handleReceive(transfer.id)}
                                                            disabled={processingId === transfer.id}
                                                            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-2 px-5 rounded-xl shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 disabled:active:scale-100"
                                                        >
                                                            {processingId === transfer.id ? (
                                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                            ) : (
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            )}
                                                            Recibir
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile View */}
                                <div className="md:hidden space-y-4">
                                    {transfers.map(transfer => (
                                        <div key={transfer.id} className="bg-white p-5 rounded-2xl shadow-md border border-gray-100 relative group overflow-hidden">
                                            <div className="absolute top-0 right-0 w-1 h-full bg-emerald-500"></div>
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="text-lg font-black text-gray-900 group-hover:text-brand-blue transition-colors line-clamp-1">{transfer.reference_number}</h3>
                                                    <div className="flex gap-2 items-center mt-2 flex-wrap">
                                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-black uppercase tracking-wide">
                                                            {transfer.sucursal?.name || 'Destinatario'}
                                                        </span>
                                                        <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {new Date(transfer.date).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleReceive(transfer.id)}
                                                    disabled={processingId === transfer.id}
                                                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-90 text-white font-black py-2.5 px-4 rounded-xl text-sm shadow-md transition-all disabled:opacity-50"
                                                >
                                                    {processingId === transfer.id ? '...' : 'Recibir'}
                                                </button>
                                            </div>
                                            {transfer.pdf_filename && (
                                                <div className="pt-3 border-t border-gray-50 flex items-center justify-between">
                                                    <p className="text-[10px] text-gray-400 flex items-center gap-1 font-medium truncate pr-4">
                                                        <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M7 2v20h10v-20h-10zm2 2h6v11h-6v-11zm6 16h-6v-1h6v1zm0-2h-6v-1h6v1z" />
                                                        </svg>
                                                        {transfer.pdf_filename}
                                                    </p>
                                                    <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                                                        {new Date(transfer.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <PaginationControls 
                                    pagination={paginationPending} 
                                    onPageChange={fetchTransfers} 
                                    isLoading={loadingPending} 
                                />
                            </div>
                        </div>
                    )}

                    {/* Sección de Historial de Ingresos */}
                    {(receiptHistory.length > 0 || loadingHistory) && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-black text-gray-800 flex items-center gap-3">
                                    <div className="p-1.5 bg-blue-100 rounded-lg">
                                        <svg className="w-4 h-4 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                    </div>
                                    Controles e Historial
                                </h2>
                                {loadingHistory && receiptHistory.length > 0 && (
                                    <div className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
                                )}
                            </div>

                            <div className={`transition-opacity duration-300 ${loadingHistory && receiptHistory.length > 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                                {/* Desktop View */}
                                <div className="hidden md:block bg-white shadow-xl shadow-gray-100 rounded-2xl overflow-hidden border border-gray-100">
                                    <table className="min-w-full">
                                        <thead>
                                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Remito</th>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Fecha de Recepción</th>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Estado</th>
                                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-widest">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {receiptHistory.map(receipt => (
                                                <tr key={receipt.id} className="hover:bg-blue-50/30 transition-all group">
                                                    <td className="px-6 py-5">
                                                        <p className="text-gray-900 font-black text-base">{receipt.remito_number}</p>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <p className="text-gray-700 font-bold text-sm">
                                                            {new Date(receipt.date).toLocaleDateString()}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 font-medium tracking-tight">
                                                            {new Date(receipt.date).toLocaleTimeString()}
                                                        </p>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className={`inline-flex px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wide border ${
                                                            receipt.status === 'finalized' 
                                                            ? 'bg-green-50 text-green-700 border-green-100' 
                                                            : 'bg-orange-50 text-orange-700 border-orange-100 animate-pulse'
                                                        }`}>
                                                            {receipt.status === 'finalized' ? '✓ Finalizado' : '● Abierto'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5 text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <button
                                                                onClick={() => navigate(`/receipts/${receipt.id}`)}
                                                                className="text-brand-blue hover:bg-blue-100/50 px-3 py-1.5 rounded-lg font-black text-sm transition-colors"
                                                            >
                                                                Detalles
                                                            </button>
                                                            {receipt.status !== 'finalized' && (
                                                                <button
                                                                    onClick={() => handleDeleteReceipt(receipt.id)}
                                                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all"
                                                                    title="Eliminar control abierto"
                                                                >
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile View */}
                                <div className="md:hidden space-y-4">
                                    {receiptHistory.map(receipt => (
                                        <div 
                                            key={receipt.id} 
                                            onClick={() => navigate(`/receipts/${receipt.id}`)}
                                            className="bg-white p-5 rounded-2xl shadow-md border border-gray-100 active:scale-[0.98] transition-all relative overflow-hidden"
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="text-lg font-black text-gray-900 truncate max-w-[200px]">{receipt.remito_number}</h3>
                                                    <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1 mt-1">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                        {new Date(receipt.date).toLocaleDateString()} {new Date(receipt.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </p>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide border ${
                                                    receipt.status === 'finalized' 
                                                    ? 'bg-green-50 text-green-700 border-green-100' 
                                                    : 'bg-orange-50 text-orange-700 border-orange-100'
                                                }`}>
                                                    {receipt.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                                                </span>
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center text-sm">
                                                {receipt.status !== 'finalized' ? (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteReceipt(receipt.id);
                                                        }}
                                                        className="text-red-400 flex items-center gap-1.5 font-bold hover:text-red-600 transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                        <span>Borrar</span>
                                                    </button>
                                                ) : <div className="text-gray-300 italic text-[11px] font-medium">Historial</div>}
                                                <div className="flex items-center gap-1 text-brand-blue font-black tracking-tight group">
                                                    <span>Revisar Detalles</span>
                                                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <PaginationControls 
                                    pagination={paginationHistory} 
                                    onPageChange={fetchReceiptHistory} 
                                    isLoading={loadingHistory} 
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BranchIncomingsList;

