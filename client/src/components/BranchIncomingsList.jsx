import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const BranchIncomingsList = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [transfers, setTransfers] = useState([]);
    const [receiptHistory, setReceiptHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [visibleCount, setVisibleCount] = useState(20); // Limit display to 20 initially

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchTransfers(), fetchReceiptHistory()]);
            setLoading(false);
        };
        loadData();
    }, []);

    const fetchTransfers = async () => {
        try {
            const response = await api.get('/api/branch-transfers/pending');
            setTransfers(response.data);
        } catch (error) {
            console.error('Error fetching transfers:', error);
            toast.error('Error al cargar transferencias pendientes');
        }
    };

    const fetchReceiptHistory = async () => {
        try {
            const response = await api.get('/api/branch-transfers/receipts');
            setReceiptHistory(response.data);
        } catch (error) {
            console.error('Error fetching receipt history:', error);
            toast.error('Error al cargar historial de ingresos');
        }
    };

    const handleReceive = async (transferId) => {
        if (!window.confirm('¿Desea iniciar la recepción de este remito? Se creará un nuevo control de ingreso.')) return;
        
        setProcessingId(transferId);
        try {
            const response = await api.post(`/api/branch-transfers/${transferId}/receive`);
            toast.success('Control de ingreso creado correctamente');
            // Redirect to the new receipt details page
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
            setReceiptHistory(prev => prev.filter(r => r.id !== receiptId));
        } catch (error) {
            console.error('Error deleting receipt:', error);
            const msg = error.response?.data?.message || 'Error al eliminar el control';
            toast.error(msg);
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue"></div>
            <span className="ml-3 text-gray-600">Cargando transferencias...</span>
        </div>
    );

    return (
        <div className="container mx-auto p-4 max-w-lg md:max-w-4xl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Ingreso Sucursal</h1>
                <p className="text-gray-500 text-sm mt-1">
                    Aquí aparecen los remitos de egreso finalizados destinados a tu sucursal.
                </p>
            </div>

            {transfers.length === 0 && receiptHistory.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-300 shadow-sm">
                    <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-gray-500 font-medium text-lg">No hay transferencias ni ingresos registrados</p>
                    <p className="text-gray-400 text-sm mt-1">Los remitos aparecerán aquí cuando sean finalizados en el depósito.</p>
                </div>
            ) : (
                <>
                    {/* Sección de Transferencias Pendientes */}
                    {transfers.length > 0 && (
                        <div className="mb-10">
                            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                Pendientes de Recibir
                            </h2>
                            {/* Desktop View */}
                            <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden border border-gray-200 mb-4">
                                <table className="min-w-full leading-normal">
                                    <thead>
                                        <tr>
                                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                Referencia / Remito
                                            </th>
                                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                Destino
                                            </th>
                                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                Fecha Envío
                                            </th>
                                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                Acción
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transfers.map(transfer => (
                                            <tr key={transfer.id}>
                                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                                    <div className="flex flex-col">
                                                        <p className="text-gray-900 font-bold">{transfer.reference_number}</p>
                                                        <p className="text-xs text-gray-500">{transfer.pdf_filename || 'Carga manual'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                                    <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-100">
                                                        {transfer.sucursal?.name || 'Cualquiera'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                                    <p className="text-gray-900">
                                                        {new Date(transfer.date).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(transfer.date).toLocaleTimeString()}
                                                    </p>
                                                </td>
                                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                                    <button
                                                        onClick={() => handleReceive(transfer.id)}
                                                        disabled={processingId === transfer.id}
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                                                    >
                                                        {processingId === transfer.id ? (
                                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
                                    <div key={transfer.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">{transfer.reference_number}</h3>
                                                <div className="flex gap-2 items-center mt-1">
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase">
                                                        {transfer.sucursal?.name || 'Destinatario'}
                                                    </span>
                                                    <p className="text-[10px] text-gray-400">
                                                        {new Date(transfer.date).toLocaleDateString()} {new Date(transfer.date).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleReceive(transfer.id)}
                                                disabled={processingId === transfer.id}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50"
                                            >
                                                {processingId === transfer.id ? '...' : 'Recibir'}
                                            </button>
                                        </div>
                                        {transfer.pdf_filename && (
                                            <p className="text-xs text-gray-500 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                {transfer.pdf_filename}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sección de Historial de Ingresos */}
                    {receiptHistory.length > 0 && (
                        <div>
                            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                Controles e Historial
                            </h2>
                            {/* Desktop View */}
                            <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                                <table className="min-w-full leading-normal">
                                    <thead>
                                        <tr>
                                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                Remito
                                            </th>
                                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                Fecha
                                            </th>
                                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                Estado
                                            </th>
                                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                Acción
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {receiptHistory.slice(0, visibleCount).map(receipt => (
                                            <tr key={receipt.id}>
                                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                                    <p className="text-gray-900 font-bold">{receipt.remito_number}</p>
                                                </td>
                                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                                    <p className="text-gray-900">
                                                        {new Date(receipt.date).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(receipt.date).toLocaleTimeString()}
                                                    </p>
                                                </td>
                                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${receipt.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {receipt.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                                    <div className="flex items-center gap-4">
                                                        <button
                                                            onClick={() => navigate(`/receipts/${receipt.id}`)}
                                                            className="text-blue-600 hover:text-blue-800 font-bold"
                                                        >
                                                            Detalles
                                                        </button>
                                                        {receipt.status !== 'finalized' && (
                                                            <button
                                                                onClick={() => handleDeleteReceipt(receipt.id)}
                                                                className="text-red-500 hover:text-red-700 transition-colors p-1"
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
                                {receiptHistory.slice(0, visibleCount).map(receipt => (
                                    <div 
                                        key={receipt.id} 
                                        onClick={() => navigate(`/receipts/${receipt.id}`)}
                                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">{receipt.remito_number}</h3>
                                                <p className="text-xs text-gray-400">
                                                    {new Date(receipt.date).toLocaleDateString()} {new Date(receipt.date).toLocaleTimeString()}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${receipt.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {receipt.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                                            </span>
                                        </div>
                                        <div className="mt-3 flex justify-between items-center">
                                            {receipt.status !== 'finalized' ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteReceipt(receipt.id);
                                                    }}
                                                    className="text-red-500 flex items-center gap-1 text-sm font-medium"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    <span>Eliminar</span>
                                                </button>
                                            ) : <div></div>}
                                            <span className="text-blue-600 text-sm font-bold">Ver detalles →</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Pagination / Load More */}
                            {receiptHistory.length > visibleCount && (
                                <div className="mt-6 mb-8 flex justify-center">
                                    <button
                                        onClick={() => setVisibleCount(prev => prev + 20)}
                                        className="bg-white hover:bg-gray-50 text-blue-600 font-bold py-2.5 px-6 rounded-lg border border-blue-200 hover:border-blue-400 transition-all shadow-sm flex items-center gap-2 text-sm"
                                    >
                                        <span>Cargar más historial</span>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default BranchIncomingsList;
