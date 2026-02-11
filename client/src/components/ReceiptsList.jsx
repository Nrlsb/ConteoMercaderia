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
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Ingreso de Mercadería</h1>
                <button
                    onClick={() => setIsCreating(true)}
                    className="bg-brand-blue hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Nuevo Ingreso
                </button>
            </div>

            {isCreating && (
                <div className="mb-6 p-4 bg-white rounded shadow-md">
                    <h2 className="text-lg font-semibold mb-2">Nuevo Remito</h2>
                    <form onSubmit={handleCreate} className="flex gap-2">
                        <input
                            type="text"
                            value={newRemitoNumber}
                            onChange={(e) => setNewRemitoNumber(e.target.value)}
                            placeholder="Número de Remito"
                            className="flex-1 p-2 border rounded"
                            autoFocus
                        />
                        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                            Crear
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsCreating(false)}
                            className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                        >
                            Cancelar
                        </button>
                    </form>
                </div>
            )}

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
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
                                    <Link to={`/receipts/${receipt.id}`} className="text-blue-600 hover:text-blue-900">
                                        Ver Detalles
                                    </Link>
                                </td>
                            </tr>
                        ))}
                        {receipts.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-center">
                                    No hay ingresos registrados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ReceiptsList;
