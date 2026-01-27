import React, { useState, useEffect } from 'react';
import api from '../api';

const RemitoHistory = ({ remitoNumber }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await api.get(`/api/history/${remitoNumber}`);
                setHistory(response.data);
            } catch (err) {
                console.error('Error fetching history:', err);
                setError('No se pudo cargar el historial.');
            } finally {
                setLoading(false);
            }
        };

        if (remitoNumber) {
            fetchHistory();
        }
    }, [remitoNumber]);

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
            case 'INSERT': return <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-bold">CREADO</span>;
            case 'UPDATE': return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold">MODIFICADO</span>;
            case 'DELETE': return <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-bold">ELIMINADO</span>;
            default: return <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs">UNK</span>;
        }
    };

    const formatData = (operation, oldData, newData) => {
        if (operation === 'UPDATE') {
            return (
                <div className="text-xs">
                    <span className="text-red-600 font-medium">{oldData?.quantity}</span>
                    <span className="mx-1 text-gray-400">→</span>
                    <span className="text-green-600 font-medium">{newData?.quantity}</span>
                </div>
            );
        }
        return <span className="text-xs font-medium">{newData?.quantity || oldData?.quantity}</span>;
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">Historial de Cambios</h3>
                <p className="text-sm text-gray-500">Registro de todas las acciones realizadas sobre este conteo.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cambio</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {history.map((entry) => (
                            <tr key={entry.history_id} className="hover:bg-gray-50 text-sm">
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                    {new Date(entry.changed_at).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                    {entry.username}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {getActionBadge(entry.operation)}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-gray-900 font-medium truncate max-w-xs">{entry.description}</div>
                                    <div className="text-gray-400 font-mono text-xs">{entry.code}</div>
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

export default RemitoHistory;
