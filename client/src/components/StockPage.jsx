import React, { useState, useEffect } from 'react';
import axios from '../api';
import { toast } from 'sonner';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

const StockPage = () => {
    const [data, setData] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const limit = 50;

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1); // Reset to page 1 on search change
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        fetchStockMatrix();
    }, [page, debouncedSearch]);

    const fetchStockMatrix = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/stock/matrix', {
                params: {
                    page,
                    limit,
                    search: debouncedSearch
                }
            });
            setData(response.data.data);
            setBranches(response.data.branches);
            setTotalPages(Math.ceil(response.data.total / limit));
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar tabla de stock');
        } finally {
            setLoading(false);
        }
    };

    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Stock por Sucursal</h1>

            <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
                {/* Controls */}
                <div className="flex justify-between items-center mb-4">
                    <div className="relative w-full md:w-1/3">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar por código o descripción..."
                            value={searchTerm}
                            onChange={handleSearchChange}
                            className="pl-10 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 text-sm">
                        <thead>
                            <tr className="bg-gray-100 text-gray-600 uppercase leading-normal">
                                <th className="py-3 px-6 text-left">Código</th>
                                <th className="py-3 px-6 text-left">Descripción</th>
                                {branches.map(branch => (
                                    <th key={branch.id} className="py-3 px-6 text-center bg-blue-50 text-blue-800 font-bold border-l border-blue-100">
                                        {branch.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {loading ? (
                                <tr>
                                    <td colSpan={2 + branches.length} className="py-4 text-center">Cargando datos...</td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={2 + branches.length} className="py-4 text-center">No se encontraron productos</td>
                                </tr>
                            ) : (
                                data.map((row) => (
                                    <tr key={row.code} className="border-b border-gray-200 hover:bg-gray-50">
                                        <td className="py-3 px-6 text-left whitespace-nowrap font-medium text-gray-900">{row.code}</td>
                                        <td className="py-3 px-6 text-left">{row.description}</td>
                                        {branches.map(branch => {
                                            const qty = row.stocks[branch.id];
                                            return (
                                                <td key={branch.id} className={`py-3 px-6 text-center font-bold border-l border-gray-100 ${qty > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                                                    {qty}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex justify-between items-center mt-4">
                    <span className="text-sm text-gray-600">
                        Página {page} de {totalPages || 1}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-l disabled:opacity-50"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loading}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-r disabled:opacity-50"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockPage;
