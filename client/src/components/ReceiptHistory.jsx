import React, { useState, useEffect } from 'react';
import api from '../api';

const ReceiptHistory = ({ receiptId }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await api.get(`/api/receipt-history/${receiptId}`);
                setHistory(response.data);
            } catch (err) {
                console.error('Error fetching history:', err);
                setError('No se pudo cargar el historial.');
            } finally {
                setLoading(false);
            }
        };

        if (receiptId) {
            fetchHistory();
        }
    }, [receiptId]);

    if (loading) return (
        <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
        </div>
    );

    if (error) return (
        <div className="p-4 bg-red-50 text-red-700 rounded-md">
            {error}
        </div>
    );

    if (history.length === 0) return (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-gray-200 text-gray-500">
            <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>No hay historial de cambios registrado aún.</p>
        </div>
    );

    const getActionBadge = (operation) => {
        switch (operation) {
            case 'INSERT_EXPECTED':
            case 'UPDATE_EXPECTED':
                return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Esperado</span>;
            case 'INSERT_SCANNED':
            case 'UPDATE_SCANNED':
                return <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Control</span>;
            case 'MANUAL_OVERRIDE':
                return <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Manual</span>;
            case 'UPDATE_BARCODE':
                return <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><i className="fas fa-barcode"></i> Cód Barras</span>;
            default:
                return <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Otro</span>;
        }
    };

    const formatData = (operation, oldData, newData) => {
        const isExpected = operation.includes('EXPECTED');
        const isScanned = operation.includes('SCANNED');
        const isManual = operation === 'MANUAL_OVERRIDE';
        const isBarcodeUpdate = operation === 'UPDATE_BARCODE';

        if (isBarcodeUpdate) {
            return (
                <div className="flex flex-col items-end gap-1 text-xs">
                    <span className="text-gray-400 line-through truncate max-w-[120px]">{oldData?.barcode || 'Ninguno'}</span>
                    <span className="text-brand-blue font-bold truncate max-w-[120px]">{newData?.barcode}</span>
                </div>
            );
        }

        if (isManual) {
            return (
                <div className="flex flex-col items-end gap-1">
                    {newData.expected_quantity !== oldData.expected_quantity && (
                        <div className="text-xs">
                            <span className="text-gray-400 mr-1">Esp:</span>
                            <span className="text-red-600 line-through mr-1">{oldData?.expected_quantity}</span>
                            <span className="text-green-600 font-bold">{newData?.expected_quantity}</span>
                        </div>
                    )}
                    {newData.scanned_quantity !== oldData.scanned_quantity && (
                        <div className="text-xs">
                            <span className="text-gray-400 mr-1">Ctr:</span>
                            <span className="text-red-600 line-through mr-1">{oldData?.scanned_quantity}</span>
                            <span className="text-green-600 font-bold">{newData?.scanned_quantity}</span>
                        </div>
                    )}
                </div>
            );
        }

        const oldQty = isExpected ? oldData?.expected_quantity : (isScanned ? oldData?.scanned_quantity : null);
        const newQty = isExpected ? newData?.expected_quantity : (isScanned ? newData?.scanned_quantity : null);

        if (oldQty !== null && newQty !== null) {
            return (
                <div className="text-xs">
                    <span className="text-gray-400 line-through mr-1">{oldQty}</span>
                    <span className="text-brand-blue font-bold">{newQty}</span>
                </div>
            );
        }

        return <span className="text-xs font-bold text-brand-blue">{newQty || oldQty}</span>;
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">Historial de Ingreso</h3>
                <p className="text-sm text-gray-500">Registro detallado de cambios en este remito.</p>
            </div>

            {/* Mobile View */}
            <div className="md:hidden">
                {history.map((entry) => (
                    <div key={entry.id} className="p-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">
                                    {new Date(entry.changed_at).toLocaleString()}
                                </div>
                                <div className="font-bold text-gray-900 flex items-center gap-1.5">
                                    <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[10px]">👤</span>
                                    {entry.username}
                                </div>
                            </div>
                            {getActionBadge(entry.operation)}
                        </div>

                        <div className="mb-2">
                            <div className="text-sm text-gray-900 font-medium leading-tight">{entry.description}</div>
                            <div className="text-[10px] text-gray-400 font-bold font-mono py-0.5 px-1.5 bg-gray-50 rounded inline-block mt-1">
                                {entry.product_code}
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                            <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Cambio</span>
                            {formatData(entry.operation, entry.old_data, entry.new_data)}
                        </div>
                    </div>
                ))}
            </div>

            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha / Hora</th>
                            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Usuario</th>
                            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Operación</th>
                            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                            <th className="px-6 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Cantidades</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-50">
                        {history.map((entry) => (
                            <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                    {new Date(entry.changed_at).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                                            {entry.username.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-xs font-bold text-gray-900">{entry.username}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {getActionBadge(entry.operation)}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-xs font-bold text-gray-900 line-clamp-1">{entry.description}</div>
                                    <div className="text-[10px] text-gray-400 font-mono">{entry.product_code}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                    {formatData(entry.operation, entry.old_data, entry.new_data)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ReceiptHistory;
