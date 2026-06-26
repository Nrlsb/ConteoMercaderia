import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { 
    RefreshCw, 
    TrendingUp, 
    TrendingDown, 
    AlertCircle, 
    Search, 
    Calendar, 
    Clock, 
    ArrowRight,
    SlidersHorizontal,
    Inbox,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

const StockRegistryPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

    // State
    const [comparisons, setComparisons] = useState([]);
    const [selectedComparison, setSelectedComparison] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    
    // Filtering and Pagination
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all', 'increase', 'decrease'
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Fetch comparisons
    const fetchComparisons = async (selectLatest = false) => {
        try {
            setLoading(true);
            const response = await api.get('/api/stock/snapshots/comparisons?limit=50');
            const data = response.data?.data || [];
            setComparisons(data);
            
            if (data.length > 0) {
                if (selectLatest || !selectedComparison) {
                    setSelectedComparison(data[0]);
                } else {
                    // Refresh current selection if it exists
                    const refreshed = data.find(c => c.id === selectedComparison.id);
                    setSelectedComparison(refreshed || data[0]);
                }
            }
        } catch (error) {
            console.error('Error fetching stock comparisons:', error);
            toast.error('No se pudo cargar el historial de comparaciones de stock.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchComparisons();
    }, []);

    // Handle Manual Trigger Sincronización
    const handleManualSync = async () => {
        if (syncing) return;
        setSyncing(true);
        const toastId = toast.loading('Sincronizando stock actual con Protheus y calculando diferencias. Esto puede demorar unos 15 segundos...');
        
        try {
            const response = await api.post('/api/stock/snapshots/trigger');
            if (response.data?.success) {
                toast.success('Sincronización y comparación de stock completada con éxito.', { id: toastId });
                await fetchComparisons(true);
            } else {
                throw new Error(response.data?.message || 'Error desconocido');
            }
        } catch (error) {
            console.error('Error in manual sync:', error);
            const errMsg = error.response?.data?.details || error.message || 'Error de conexión';
            toast.error(`Error en la sincronización: ${errMsg}`, { id: toastId });
        } finally {
            setSyncing(false);
        }
    };

    // Date formatting helper
    const formatDateTime = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDateOnly = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    // Calculate metrics for current selection
    const differences = selectedComparison?.differences || [];
    const totalDiffCount = differences.length;
    const increasesCount = differences.filter(d => d.diff > 0).length;
    const decreasesCount = differences.filter(d => d.diff < 0).length;

    // Filtered differences
    const filteredDiffs = differences.filter(diff => {
        const matchesSearch = 
            diff.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (diff.description && diff.description.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesType = 
            filterType === 'all' ||
            (filterType === 'increase' && diff.diff > 0) ||
            (filterType === 'decrease' && diff.diff < 0);

        return matchesSearch && matchesType;
    });

    // Pagination logic
    const totalPages = Math.ceil(filteredDiffs.length / itemsPerPage);
    const paginatedDiffs = filteredDiffs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset page when filter or search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterType]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900">Registro y Comparación de Stock</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Monitoreo de variaciones de stock (local 00, filial 010100) de Protheus.
                    </p>
                </div>
                {isAdmin && (
                    <button
                        onClick={handleManualSync}
                        disabled={syncing}
                        className={`flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none`}
                    >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        <span>{syncing ? 'Sincronizando...' : 'Sincronizar Stock'}</span>
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex flex-col justify-center items-center h-96 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                    </div>
                    <span className="text-gray-500 font-medium mt-4">Cargando datos de stock...</span>
                </div>
            ) : comparisons.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-96 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                        <Inbox className="w-8 h-8 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">No hay registros de stock aún</h3>
                    <p className="text-gray-500 max-w-sm mt-1">
                        Las capturas automáticas corren a las 19:00 hs y a las 05:30 hs. {isAdmin && 'Puedes iniciar una sincronización manual para generar la primera comparativa.'}
                    </p>
                    {isAdmin && (
                        <button
                            onClick={handleManualSync}
                            className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 active:scale-95 transition-all duration-200"
                        >
                            <RefreshCw className="w-4 h-4" />
                            <span>Sincronizar Primer Stock</span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Left Sidebar - Comparisons History List */}
                    <div className="lg:col-span-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col h-[600px]">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> Historial de Capturas
                        </h3>
                        <div className="flex-grow overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            {comparisons.map((c) => {
                                const isSelected = selectedComparison?.id === c.id;
                                const isNocturno = c.period_type === 'nocturno';
                                const isDiurno = c.period_type === 'diurno';
                                
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => setSelectedComparison(c)}
                                        className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 ${
                                            isSelected
                                                ? 'border-blue-600 bg-blue-50/50 shadow-inner'
                                                : 'border-gray-100 hover:border-gray-300 bg-white hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                                isNocturno
                                                    ? 'bg-purple-100 text-purple-700'
                                                    : isDiurno
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-gray-100 text-gray-700'
                                            }`}>
                                                {c.period_type === 'nocturno' ? 'Nocturno' : c.period_type === 'diurno' ? 'Diurno' : 'Manual'}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-medium">
                                                {formatDateOnly(c.end_time)}
                                            </span>
                                        </div>
                                        <div className="text-sm font-bold text-gray-800 truncate">
                                            Comparación de Stock
                                        </div>
                                        <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>
                                                {new Date(c.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <ArrowRight className="w-3 h-3" />
                                            <span>
                                                {new Date(c.end_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-[11px] text-gray-400">
                                            Variaciones: <strong className="text-gray-700">{c.differences?.length || 0}</strong>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Main Content - Comparison Details & Dashboard */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Selected Comparison Header */}
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-gray-100 pb-4 mb-4">
                                <div>
                                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                                        Período Seleccionado: {selectedComparison?.period_type === 'nocturno' ? 'Nocturno (19:00 -> 05:30)' : selectedComparison?.period_type === 'diurno' ? 'Diurno (05:30 -> 19:00)' : 'Sincronización Manual'}
                                    </span>
                                    <h3 className="text-lg font-bold text-gray-900 mt-0.5">
                                        Diferencias de Stock del {formatDateOnly(selectedComparison?.end_time)}
                                    </h3>
                                </div>
                                <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                    <strong>Inicio:</strong> {formatDateTime(selectedComparison?.start_time)}<br />
                                    <strong>Corte:</strong> {formatDateTime(selectedComparison?.end_time)}
                                </div>
                            </div>

                            {/* Metrics Dashboard */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Total Differences */}
                                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                                    <div>
                                        <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Productos Variados</span>
                                        <h4 className="text-2xl font-black text-indigo-900 mt-1">{totalDiffCount}</h4>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 border border-indigo-500/10">
                                        <AlertCircle className="w-5 h-5" />
                                    </div>
                                </div>

                                {/* Increases */}
                                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 rounded-xl border border-emerald-100 flex items-center justify-between">
                                    <div>
                                        <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Aumentos de Stock</span>
                                        <h4 className="text-2xl font-black text-emerald-900 mt-1">{increasesCount}</h4>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 border border-emerald-500/10">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                </div>

                                {/* Decreases */}
                                <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 p-4 rounded-xl border border-rose-100 flex items-center justify-between">
                                    <div>
                                        <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Disminuciones</span>
                                        <h4 className="text-2xl font-black text-rose-900 mt-1">{decreasesCount}</h4>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-600 border border-rose-500/10">
                                        <TrendingDown className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Differences Table Container */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            {/* Table Controls (Search and Filters) */}
                            <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-col md:flex-row gap-3 justify-between items-center">
                                {/* Search */}
                                <div className="relative w-full md:w-80">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por código o descripción..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                                    />
                                </div>

                                {/* Filters */}
                                <div className="flex gap-2 w-full md:w-auto">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider mr-2">
                                        <SlidersHorizontal className="w-3.5 h-3.5" /> Filtrar:
                                    </div>
                                    <button
                                        onClick={() => setFilterType('all')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                            filterType === 'all'
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={() => setFilterType('increase')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                            filterType === 'increase'
                                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        Aumentos
                                    </button>
                                    <button
                                        onClick={() => setFilterType('decrease')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                            filterType === 'decrease'
                                                ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        Bajas
                                    </button>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-[11px] text-gray-400 uppercase bg-gray-50 tracking-wider font-bold">
                                        <tr>
                                            <th className="px-6 py-3">Código</th>
                                            <th className="px-6 py-3">Descripción</th>
                                            <th className="px-6 py-3 text-center">Stock Inicial</th>
                                            <th className="px-6 py-3 text-center">Stock Final</th>
                                            <th className="px-6 py-3 text-right">Variación</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {paginatedDiffs.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="px-6 py-12 text-center text-gray-400 font-medium">
                                                    No se encontraron discrepancias de stock con los filtros aplicados.
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedDiffs.map((diff, index) => {
                                                const isIncrease = diff.diff > 0;
                                                return (
                                                    <tr key={index} className="hover:bg-gray-50/50 transition-all">
                                                        <td className="px-6 py-3.5 font-mono text-xs text-gray-600 font-bold select-all">
                                                            {diff.code}
                                                        </td>
                                                        <td className="px-6 py-3.5 text-gray-800 font-medium">
                                                            {diff.description || 'Sin descripción'}
                                                        </td>
                                                        <td className="px-6 py-3.5 text-center text-gray-500 font-semibold font-mono">
                                                            {diff.qty_start}
                                                        </td>
                                                        <td className="px-6 py-3.5 text-center text-gray-900 font-bold font-mono">
                                                            {diff.qty_end}
                                                        </td>
                                                        <td className="px-6 py-3.5 text-right font-mono">
                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${
                                                                isIncrease
                                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                                    : 'bg-rose-50 text-rose-700 border border-rose-100'
                                                            }`}>
                                                                {isIncrease ? '+' : ''}{diff.diff}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table Pagination Footer */}
                            {totalPages > 1 && (
                                <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                                    <span className="text-xs text-gray-500 font-medium">
                                        Mostrando página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({filteredDiffs.length} resultados)
                                    </span>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:pointer-events-none transition-all"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:pointer-events-none transition-all"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockRegistryPage;
