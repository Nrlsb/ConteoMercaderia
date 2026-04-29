import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { db } from '../db';
import { Search, Filter, X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

const ReceiptsList = () => {
    const { user } = useAuth();
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newRemitoNumber, setNewRemitoNumber] = useState('');
    const [creationType, setCreationType] = useState('normal'); // 'normal' or 'overstock'
    const [uploading, setUploading] = useState(false);
    const [visibleCount, setVisibleCount] = useState(20); // Limit display to 20 initially
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all, open, finalized
    const [typeFilter, setTypeFilter] = useState('all'); // all, normal, overstock
    const [showFilters, setShowFilters] = useState(false);
    const fileInputRef = React.useRef(null);

    const canCreate = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || user?.permissions?.includes('upload_ingresos');
    const canDelete = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'branch_admin' || user?.permissions?.includes('delete_ingresos');

    useEffect(() => {
        fetchReceipts();
    }, []);

    // Global refresh polling (every 30 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            fetchReceipts();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchReceipts = async () => {
        try {
            const response = await api.get('/api/receipts');
            setReceipts(response.data);
            
            // Non-blocking cache update
            db.offline_caches.put({
                id: 'receipts_list',
                data: response.data,
                timestamp: Date.now()
            }).catch(err => console.error('Error caching receipts:', err));

        } catch (error) {
            console.error('Error fetching receipts:', error);
            // Try to load from IndexedDB cache
            try {
                const cache = await db.offline_caches.get('receipts_list');
                if (cache) {
                    setReceipts(cache.data);
                    toast.info('Mostrando datos offline');
                } else {
                    toast.error('Error al cargar los ingresos');
                }
            } catch (cacheError) {
                console.error('Cache read error:', cacheError);
                toast.error('Error al cargar los ingresos');
            }
        } finally {
            setLoading(false);
        }
    };

    const filteredReceipts = receipts.filter(receipt => {
        const matchesSearch = !searchTerm || receipt.remito_number.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || 
            (statusFilter === 'open' && receipt.status !== 'finalized') || 
            (statusFilter === 'finalized' && receipt.status === 'finalized');
        const matchesType = typeFilter === 'all' || receipt.type === typeFilter;
        
        return matchesSearch && matchesStatus && matchesType;
    });

    const activeFiltersCount = (statusFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);

    const clearFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
        setTypeFilter('all');
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newRemitoNumber.trim()) return;

        try {
            const response = await api.post('/api/receipts',
                { 
                    remitoNumber: newRemitoNumber,
                    type: creationType
                }
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

    const handleDelete = async (id) => {
        if (!window.confirm('¿Está seguro de que desea eliminar este ingreso?')) return;
        try {
            await api.delete(`/api/receipts/${id}`);
            toast.success('Ingreso eliminado correctamente');
            fetchReceipts();
        } catch (error) {
            console.error('Error deleting receipt:', error);
            toast.error('Error al eliminar el ingreso');
        }
    };

    const handlePdfUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const invalidFiles = files.filter(file => !file.name.toLowerCase().endsWith('.pdf'));
        if (invalidFiles.length > 0) {
            toast.error('Solo se permiten archivos PDF');
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('type', creationType); // Send 'normal' or 'overstock'
        
        if (newRemitoNumber.trim()) {
            formData.append('remitoNumber', newRemitoNumber.trim());
        }
        files.forEach(file => {
            formData.append('pdf', file);
        });

        try {
            const response = await api.post('/api/receipts/upload', formData, {
                timeout: 300000 // 5 minutes
            });
            const { results, receipt } = response.data;
            
            toast.success(`Ingreso ${receipt.remito_number} creado: ${results.success.length} productos cargados`);
            if (results.failed.length > 0) {
                toast.warning(`${results.failed.length} productos no encontrados`);
                console.log('Failed items:', results.failed);
            }
            
            setIsCreating(false);
            setNewRemitoNumber('');
            fetchReceipts();
        } catch (error) {
            console.error('Error uploading PDF:', error);
            const msg = error.response?.data?.message || 'Error al procesar el PDF';
            toast.error(msg);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center py-20 animate-in fade-in duration-700">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 bg-blue-50 rounded-full"></div>
                    </div>
                </div>
                <h2 className="mt-6 text-lg font-semibold text-gray-600 tracking-wide">Cargando Ingresos...</h2>
                <p className="text-sm text-gray-400 mt-2">Buscando remitos para vos</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 max-w-lg md:max-w-4xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Ingreso de Mercadería</h1>
                {canCreate && (
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => { setCreationType('normal'); setIsCreating(true); }}
                            className="flex-1 sm:flex-none bg-brand-blue hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-colors text-sm"
                        >
                            Nuevo Ingreso
                        </button>
                        <button
                            onClick={() => { setCreationType('overstock'); setIsCreating(true); }}
                            className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-colors text-sm"
                        >
                            Sobre-stock
                        </button>
                    </div>
                )}
            </div>

            {/* Búsqueda y Filtros */}
            <div className="mb-6 space-y-4">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar remito..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue outline-none transition-all text-sm"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="w-3 h-3 text-gray-400" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all shadow-sm text-sm font-medium ${
                            showFilters || activeFiltersCount > 0
                                ? 'bg-brand-blue/5 border-brand-blue text-brand-blue'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                    >
                        <Filter className="w-4 h-4" />
                        <span className="hidden sm:inline">Filtros</span>
                        {activeFiltersCount > 0 && (
                            <span className="flex items-center justify-center w-5 h-5 bg-brand-blue text-white text-[10px] font-bold rounded-full">
                                {activeFiltersCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Panel de Filtros Colapsable */}
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm transition-all duration-300 origin-top ${
                    showFilters ? 'scale-y-100 opacity-100' : 'hidden md:grid'
                }`}>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Estado del Remito</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { id: 'all', label: 'Todos' },
                                { id: 'open', label: 'Abiertos' },
                                { id: 'finalized', label: 'Finalizados' }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setStatusFilter(opt.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                        statusFilter === opt.id
                                            ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tipo de Ingreso</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { id: 'all', label: 'Todos' },
                                { id: 'normal', label: 'Normal' },
                                { id: 'overstock', label: 'Sobre-stock' }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setTypeFilter(opt.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                        typeFilter === opt.id
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {(activeFiltersCount > 0 || searchTerm) && (
                        <div className="md:col-span-2 pt-2 border-t border-gray-50 flex justify-end">
                            <button
                                onClick={clearFilters}
                                className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-600 transition-colors"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Limpiar Filtros
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {isCreating && (
                <div className={`mb-6 p-4 bg-white rounded-lg shadow-lg border-l-4 ${creationType === 'overstock' ? 'border-purple-600' : 'border-brand-blue'}`}>
                    <h2 className="text-lg font-semibold mb-3">
                        {creationType === 'overstock' ? 'Nuevo Remito de Sobrestock' : 'Nuevo Remito'}
                    </h2>
                    <div className="space-y-4">
                        <div 
                            onClick={() => !uploading && fileInputRef.current?.click()}
                            className={`p-8 border-2 border-dashed rounded-xl transition-all cursor-pointer text-center ${uploading ? 'bg-gray-50 border-gray-200' : (creationType === 'overstock' ? 'bg-purple-50 border-purple-200 hover:border-purple-400 hover:bg-purple-100/50' : 'bg-blue-50 border-blue-200 hover:border-blue-400 hover:bg-blue-100/50')}`}
                        >
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".pdf"
                                multiple
                                onChange={handlePdfUpload}
                            />
                            {uploading ? (
                                <div className="flex flex-col items-center">
                                    <div className={`w-8 h-8 border-4 rounded-full animate-spin mb-2 ${creationType === 'overstock' ? 'border-purple-200 border-t-purple-600' : 'border-blue-200 border-t-blue-600'}`}></div>
                                    <p className={`${creationType === 'overstock' ? 'text-purple-700' : 'text-blue-700'} font-medium`}>Procesando PDF con IA...</p>
                                </div>
                            ) : (
                                <>
                                    <svg className={`w-12 h-12 mx-auto mb-2 ${creationType === 'overstock' ? 'text-purple-300' : 'text-blue-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                    </svg>
                                    <p className={`${creationType === 'overstock' ? 'text-purple-700' : 'text-blue-700'} font-bold`}>
                                        Hacé clic para subir el PDF {creationType === 'overstock' ? 'de Sobrestock' : 'del Proveedor'}
                                    </p>
                                    <p className={`${creationType === 'overstock' ? 'text-purple-500' : 'text-blue-500'} text-xs mt-1`}>
                                        {creationType === 'overstock' ? 'Se utilizará código interno para vincular' : 'Se utilizará IA para extraer y vincular por código de proveedor'}
                                    </p>
                                </>
                            )}
                        </div>
                        
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-gray-200"></div>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-gray-500">O crear manualmente</span>
                            </div>
                        </div>

                        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
                            <input
                                type="text"
                                value={newRemitoNumber}
                                onChange={(e) => setNewRemitoNumber(e.target.value)}
                                placeholder="Número de Remito manual"
                                className={`flex-1 p-2.5 border rounded-lg outline-none focus:ring-2 ${creationType === 'overstock' ? 'focus:ring-purple-500' : 'focus:ring-blue-500'}`}
                            />
                            <div className="flex gap-2">
                                <button type="submit" className={`flex-1 sm:flex-none text-white px-6 py-2.5 rounded-lg font-bold transition-colors ${creationType === 'overstock' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                    Crear
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="flex-1 sm:flex-none bg-brand-gray text-white px-4 py-2.5 rounded-lg font-bold hover:bg-brand-gray/80 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
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
                        {filteredReceipts.slice(0, visibleCount).map(receipt => (
                            <tr key={receipt.id}>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                    <div className="flex flex-col">
                                        <p className="text-gray-900 whitespace-no-wrap font-bold">{receipt.remito_number}</p>
                                        {receipt.type === 'overstock' && (
                                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold w-fit uppercase">
                                                Sobrestock
                                            </span>
                                        )}
                                    </div>
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
                                    <div className="flex gap-3 items-center">
                                        <Link to={`/receipts/${receipt.id}`} className="text-blue-600 hover:text-blue-900 font-bold">
                                            Ver Detalles
                                        </Link>
                                        {canDelete && (
                                            <button
                                                onClick={() => handleDelete(receipt.id)}
                                                className="text-red-600 hover:text-red-900 font-bold"
                                            >
                                                Eliminar
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Vista Mobile (Tarjetas) */}
            <div className="md:hidden space-y-4">
                {filteredReceipts.slice(0, visibleCount).map(receipt => (
                    <Link
                        to={`/receipts/${receipt.id}`}
                        key={receipt.id}
                        className="block bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
                    >
                        <div className="flex justify-between items-start gap-4 mb-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <h3 className="text-lg font-bold text-gray-900 break-words leading-tight">{receipt.remito_number}</h3>
                                    {receipt.type === 'overstock' && (
                                        <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                                            Sobrestock
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-brand-gray">
                                    {new Date(receipt.date).toLocaleDateString()} - {new Date(receipt.date).toLocaleTimeString()}
                                </p>
                            </div>
                            <span className={`shrink-0 inline-block px-2.5 py-1 text-xs font-bold rounded-full ${receipt.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {receipt.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                            </span>
                        </div>
                        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap justify-between items-center gap-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs text-gray-500 whitespace-nowrap">Por:</span>
                                <span className="text-xs font-bold text-gray-700 truncate">{receipt.created_by}</span>
                            </div>
                            <div className="flex items-center gap-4 ml-auto">
                                {canDelete && (
                                    <button
                                        onClick={(e) => { e.preventDefault(); handleDelete(receipt.id); }}
                                        className="text-red-600 hover:text-red-700 text-xs font-bold whitespace-nowrap transition-colors"
                                    >
                                        Eliminar
                                    </button>
                                )}
                                <span className="text-brand-blue font-bold text-sm whitespace-nowrap">Ver detalles →</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Pagination / Load More */}
            {filteredReceipts.length > visibleCount && (
                <div className="mt-8 mb-12 flex justify-center">
                    <button
                        onClick={() => setVisibleCount(prev => prev + 20)}
                        className="bg-white hover:bg-gray-50 text-brand-blue font-bold py-3 px-8 rounded-xl border-2 border-brand-blue/20 hover:border-brand-blue transition-all shadow-sm flex items-center gap-2"
                    >
                        <span>Cargar más remitos</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>
            )}

            {filteredReceipts.length === 0 && (
                <div className="bg-white p-8 text-center rounded-lg shadow-inner text-gray-500 italic">
                    No se encontraron ingresos con los filtros aplicados.
                </div>
            )}
        </div>
    );
};

export default ReceiptsList;
