import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const ReceiptsList = () => {
    const { token } = useAuth();
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newRemitoNumber, setNewRemitoNumber] = useState('');

    useEffect(() => {
        fetchReceipts();
    }, []);

    const fetchReceipts = async () => {
        try {
            const response = await api.get('/api/receipts');
            setReceipts(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching receipts:', error);
            toast.error('Error al cargar los ingresos');
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newRemitoNumber.trim()) return;

        try {
            const response = await api.post('/api/receipts',
                { remitoNumber: newRemitoNumber }
            );
            toast.success('Ingreso creado correctamente');
            setNewRemitoNumber('');
            setIsCreating(false);
            fetchReceipts();
        } catch (error) {
            console.error('Error creating receipt:', error);
            toast.error('Error al crear el ingreso');
        }
    };

    if (loading) return <div className="p-4 text-center">Cargando...</div>;

    return (
        <div className="container mx-auto p-4 max-w-lg md:max-w-4xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Ingreso de Mercadería</h1>
                <button
                    onClick={() => setIsCreating(true)}
                    className="w-full sm:w-auto bg-brand-blue hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-colors"
                >
                    Nuevo Ingreso
                </button>
            </div>

            {isCreating && (
                <div className="mb-6 p-4 bg-white rounded-lg shadow-lg border-l-4 border-brand-blue">
                    <h2 className="text-lg font-semibold mb-3">Nuevo Remito</h2>
                    <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            value={newRemitoNumber}
                            onChange={(e) => setNewRemitoNumber(e.target.value)}
                            placeholder="Número de Remito"
                            className="flex-1 p-2.5 border rounded-lg focus:ring-2 focus:ring-brand-blue outline-none"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button type="submit" className="flex-1 sm:flex-none bg-green-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-green-700 transition-colors">
                                Crear
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsCreating(false)}
                                className="flex-1 sm:flex-none bg-gray-400 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-gray-500 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Vista de Escritorio (Tabla) */}
            <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden">
                <table className="min-w-full leading-normal">
                    <thead>
                        <tr>
                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Remito
                            </th>
                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Fecha
                            </th>
                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Estado
                            </th>
                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Creado Por
                            </th>
                            <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {receipts.map(receipt => (
                            <tr key={receipt.id}>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                    <p className="text-gray-900 whitespace-no-wrap font-bold">{receipt.remito_number}</p>
                                </td>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                    <p className="text-gray-900 whitespace-no-wrap">
                                        {new Date(receipt.date).toLocaleDateString()} {new Date(receipt.date).toLocaleTimeString()}
                                    </p>
                                </td>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                    <span className={`relative inline-block px-3 py-1 font-semibold text-green-900 leading-tight`}>
                                        <span aria-hidden className={`absolute inset-0 ${receipt.status === 'finalized' ? 'bg-green-200' : 'bg-yellow-200'} opacity-50 rounded-full`}></span>
                                        <span className="relative">{receipt.status === 'finalized' ? 'Finalizado' : 'Abierto'}</span>
                                    </span>
                                </td>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                    <p className="text-gray-900 whitespace-no-wrap">{receipt.created_by}</p>
                                </td>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                    <Link to={`/receipts/${receipt.id}`} className="text-blue-600 hover:text-blue-900 font-bold">
                                        Ver Detalles
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Vista Mobile (Tarjetas) */}
            <div className="md:hidden space-y-4">
                {receipts.map(receipt => (
                    <Link
                        to={`/receipts/${receipt.id}`}
                        key={receipt.id}
                        className="block bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{receipt.remito_number}</h3>
                                <p className="text-xs text-brand-gray">
                                    {new Date(receipt.date).toLocaleDateString()} - {new Date(receipt.date).toLocaleTimeString()}
                                </p>
                            </div>
                            <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-full ${receipt.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {receipt.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Por: <span className="font-medium">{receipt.created_by}</span></span>
                            <span className="text-brand-blue font-bold">Ver detalles →</span>
                        </div>
                    </Link>
                ))}
            </div>

            {receipts.length === 0 && (
                <div className="bg-white p-8 text-center rounded-lg shadow-inner text-gray-500 italic">
                    No hay ingresos registrados.
                </div>
            )}
        </div>
    );
};

export default ReceiptsList;
