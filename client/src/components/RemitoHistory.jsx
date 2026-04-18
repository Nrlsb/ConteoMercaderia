import React, { useState, useEffect } from 'react';
import api from '../api';

const RemitoHistory = ({ remitoNumber }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

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

    const filteredHistory = history.filter(entry => {
        const cleanTerm = searchTerm.trim().toLowerCase();
        if (!cleanTerm) return true;
        
        const code = String(entry.code || '').toLowerCase();
        const description = String(entry.description || '').toLowerCase();
        
        return code.includes(cleanTerm) || description.includes(cleanTerm);
    });

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
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Historial de Cambios</h3>
                    <p className="text-sm text-gray-500">Registro de todas las acciones realizadas sobre este conteo.</p>
                </div>

                <div className="relative flex-1 max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar producto..."
                        className="block w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-blue focus:border-brand-blue sm:text-sm transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            {/* Mobile Card View */}
            <div className="md:hidden">
                {filteredHistory.length > 0 ? (
                    filteredHistory.map((entry) => (
                        <div key={entry.history_id} className="p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-xs text-gray-500 mb-1">{new Date(entry.changed_at).toLocaleString()}</div>
                                    <div className="font-bold text-gray-900">{entry.username}</div>
                                </div>
                                {getActionBadge(entry.operation)}
                            </div>

                            <div className="mt-1">
                                <div className="text-sm text-gray-900 font-medium">{entry.description}</div>
                                <div className="text-xs text-gray-400 font-mono">{entry.code}</div>
                            </div>

                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
                                <span className="text-xs text-gray-500 uppercase font-bold">Cambio</span>
                                {formatData(entry.operation, entry.old_data, entry.new_data)}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center text-gray-500 italic">No se encontraron movimientos para "{searchTerm}"</div>
                )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
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
                        {filteredHistory.length > 0 ? (
                            filteredHistory.map((entry) => (
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
                            ))
                        ) : (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center text-gray-500 italic">
                                    No se encontraron movimientos para "{searchTerm}"
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default RemitoHistory;
