import React, { useState } from 'react';
import api from '../api';
import { toast } from 'sonner';
import { 
    Search, 
    FileText, 
    TrendingUp, 
    TrendingDown, 
    DollarSign, 
    AlertCircle, 
    CheckCircle, 
    Download, 
    RefreshCw, 
    Calendar, 
    User, 
    MapPin,
    Tag
} from 'lucide-react';

const ValorizacionPage = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [remitoData, setRemitoData] = useState(null);
    const [error, setError] = useState(null);

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        
        const cleanTerm = searchTerm.trim();
        if (!cleanTerm) {
            toast.warning('Por favor ingrese un número de remito para buscar');
            return;
        }

        setLoading(true);
        setError(null);
        setRemitoData(null);

        try {
            const response = await api.get(`/api/valorizacion/${encodeURIComponent(cleanTerm)}`);
            setRemitoData(response.data);
            toast.success('Remito encontrado y valorizado correctamente');
        } catch (err) {
            console.error('Error buscando remito:', err);
            const msg = err.response?.data?.message || 'Error al buscar el remito. Verifique el número ingresado.';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (!remitoData) return;

        try {
            toast.promise(
                api.get(`/api/valorizacion/${encodeURIComponent(remitoData.number)}/export`, { responseType: 'blob' }),
                {
                    loading: 'Generando archivo Excel...',
                    success: (response) => {
                        const blob = new Blob([response.data], { 
                            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                        });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Valorizacion_${remitoData.type.toUpperCase()}_${remitoData.number}.xlsx`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        return 'Excel descargado con éxito';
                    },
                    error: 'Error al generar el archivo Excel'
                }
            );
        } catch (err) {
            console.error('Export error:', err);
            toast.error('Ocurrió un error al intentar exportar');
        }
    };

    // Formateadores
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        }).format(value);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-AR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Header del módulo */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-blue-900 to-blue-600">
                    Valorización de Remitos
                </h1>
                <p className="text-sm text-gray-500 mt-2">
                    Busca un remito finalizado en la base de datos local para calcular y auditar su valor de costo.
                </p>
            </div>

            {/* Panel de Búsqueda */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8 transition-all hover:shadow-md">
                <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-grow w-full">
                        <label htmlFor="remito-search" className="block text-sm font-semibold text-gray-700 mb-2">
                            Número de Remito / Referencia
                        </label>
                        <div className="relative rounded-xl shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                id="remito-search"
                                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all focus:bg-white"
                                placeholder="Ej: 003700000003 o SUCURSAL 02 003700000003..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                        {loading ? (
                            <>
                                <RefreshCw className="w-5 h-5 animate-spin" />
                                Buscando...
                            </>
                        ) : (
                            <>
                                <Search className="w-5 h-5" />
                                Buscar Remito
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* Spinner de Carga */}
            {loading && (
                <div className="flex flex-col justify-center items-center py-24">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 bg-blue-50/50 rounded-full backdrop-blur-sm"></div>
                        </div>
                    </div>
                    <h3 className="mt-6 text-lg font-bold text-gray-700">Analizando base de datos local</h3>
                    <p className="text-sm text-gray-400 mt-2">Buscando productos y calculando valorizaciones de costos...</p>
                </div>
            )}

            {/* Alerta de Error */}
            {error && !loading && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl mb-8 flex items-start gap-3 animate-in fade-in duration-300">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold text-red-800">No se pudo obtener la información</h3>
                        <p className="text-sm text-red-700 mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Detalle y Reporte de Costos */}
            {remitoData && !loading && (
                <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
                    
                    {/* Tarjeta de Metadatos */}
                    <div className="bg-gradient-to-br from-blue-900 to-blue-950 rounded-2xl text-white p-6 shadow-lg border border-blue-800 flex flex-col md:flex-row justify-between gap-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full tracking-wider ${
                                    remitoData.type === 'egreso' 
                                        ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30' 
                                        : 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30'
                                }`}>
                                    {remitoData.type === 'egreso' ? 'Egreso PDF' : 'Conteo Historial'}
                                </span>
                                <span className="text-blue-300 font-mono font-semibold">{remitoData.id?.substring(0, 8)}</span>
                            </div>
                            
                            <h2 className="text-xl md:text-2xl font-bold tracking-tight font-mono">{remitoData.number}</h2>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 text-sm text-blue-100/80">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-blue-400" />
                                    <span>Fecha: {formatDate(remitoData.date)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-blue-400" />
                                    <span>Operador: {remitoData.created_by || 'Sistema'}</span>
                                </div>
                                {remitoData.sucursal_name && remitoData.sucursal_name !== '-' && (
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-blue-400" />
                                        <span>Destino: {remitoData.sucursal_name}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col md:items-end justify-between gap-4">
                            <span className={`px-4 py-1.5 text-xs font-bold uppercase rounded-xl border w-fit ${
                                remitoData.status === 'finalized' || remitoData.status === 'processed'
                                    ? 'bg-green-500/10 text-green-300 border-green-500/30'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            }`}>
                                {remitoData.status === 'finalized' || remitoData.status === 'processed' ? 'Finalizado' : 'Abierto'}
                            </span>

                            <button
                                onClick={handleExportExcel}
                                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 border border-green-500"
                            >
                                <Download className="w-4 h-4" />
                                Exportar Excel
                            </button>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Costo Esperado */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between hover:shadow-md transition-all">
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Costo Esperado</span>
                                <h3 className="text-2xl font-extrabold text-gray-900">{formatCurrency(remitoData.totals.total_esperado)}</h3>
                                <p className="text-xs text-gray-400">Según documento cargado</p>
                            </div>
                            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl">
                                <FileText className="w-6 h-6" />
                            </div>
                        </div>

                        {/* Costo Controlado */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between hover:shadow-md transition-all">
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Costo Controlado</span>
                                <h3 className="text-2xl font-extrabold text-gray-900">{formatCurrency(remitoData.totals.total_controlado)}</h3>
                                <p className="text-xs text-gray-400">Según stock real escaneado</p>
                            </div>
                            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                        </div>

                        {/* Desviación */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between hover:shadow-md transition-all">
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Diferencia de Costo</span>
                                <h3 className={`text-2xl font-extrabold ${
                                    remitoData.totals.diferencia_costo < 0 
                                        ? 'text-red-600' 
                                        : remitoData.totals.diferencia_costo > 0 
                                            ? 'text-green-600' 
                                            : 'text-gray-900'
                                }`}>
                                    {formatCurrency(remitoData.totals.diferencia_costo)}
                                </h3>
                                <p className="text-xs text-gray-400">Diferencia neta de valor</p>
                            </div>
                            <div className={`p-3.5 rounded-2xl ${
                                remitoData.totals.diferencia_costo < 0 
                                    ? 'bg-red-50 text-red-600' 
                                    : remitoData.totals.diferencia_costo > 0 
                                        ? 'bg-green-50 text-green-600' 
                                        : 'bg-gray-50 text-gray-600'
                            }`}>
                                {remitoData.totals.diferencia_costo < 0 ? (
                                    <TrendingDown className="w-6 h-6" />
                                ) : (
                                    <TrendingUp className="w-6 h-6" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Artículos */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Tag className="w-5 h-5 text-blue-600" />
                                Detalle de Artículos Valorizados
                            </h3>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                {remitoData.items.length} productos
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Artículo</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción</th>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Esperado</th>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Controlado</th>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Dif.</th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Costo Unit.</th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Costo Esperado</th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Costo Controlado</th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Diferencia ($)</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {remitoData.items.map((item, idx) => {
                                        const hasDiff = item.difference !== 0;
                                        return (
                                            <tr 
                                                key={item.code + idx} 
                                                className={`hover:bg-gray-50 transition-colors ${
                                                    item.difference < 0 
                                                        ? 'bg-red-50/20' 
                                                        : item.difference > 0 
                                                            ? 'bg-green-50/20' 
                                                            : ''
                                                }`}
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold font-mono text-gray-900">
                                                    {item.code}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate" title={item.description}>
                                                    <div>{item.description}</div>
                                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">Barras: {item.barcode}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-gray-600">
                                                    {item.expected_quantity}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-gray-900">
                                                    {item.scanned_quantity}
                                                </td>
                                                <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-bold ${
                                                    item.difference < 0 
                                                        ? 'text-red-600' 
                                                        : item.difference > 0 
                                                            ? 'text-green-600' 
                                                            : 'text-gray-400'
                                                }`}>
                                                    {item.difference > 0 ? `+${item.difference}` : item.difference}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 font-mono">
                                                    {formatCurrency(item.cost_price)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 font-mono">
                                                    {formatCurrency(item.subtotal_esperado)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 font-mono">
                                                    {formatCurrency(item.subtotal_controlado)}
                                                </td>
                                                <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold font-mono ${
                                                    item.difference_cost < 0 
                                                        ? 'text-red-600' 
                                                        : item.difference_cost > 0 
                                                            ? 'text-green-600' 
                                                            : 'text-gray-400'
                                                }`}>
                                                    {formatCurrency(item.difference_cost)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200">
                                    <tr>
                                        <td colSpan="2" className="px-6 py-4 text-sm text-gray-900">TOTALES</td>
                                        <td className="px-6 py-4 text-center text-sm text-gray-600">
                                            {remitoData.items.reduce((sum, item) => sum + item.expected_quantity, 0)}
                                        </td>
                                        <td className="px-6 py-4 text-center text-sm text-gray-900">
                                            {remitoData.items.reduce((sum, item) => sum + item.scanned_quantity, 0)}
                                        </td>
                                        <td className={`px-6 py-4 text-center text-sm ${
                                            remitoData.items.reduce((sum, item) => sum + item.difference, 0) < 0 
                                                ? 'text-red-600' 
                                                : remitoData.items.reduce((sum, item) => sum + item.difference, 0) > 0 
                                                    ? 'text-green-600' 
                                                    : 'text-gray-900'
                                        }`}>
                                            {remitoData.items.reduce((sum, item) => sum + item.difference, 0)}
                                        </td>
                                        <td className="px-6 py-4"></td>
                                        <td className="px-6 py-4 text-right text-sm text-gray-600 font-mono">
                                            {formatCurrency(remitoData.totals.total_esperado)}
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm text-gray-900 font-mono">
                                            {formatCurrency(remitoData.totals.total_controlado)}
                                        </td>
                                        <td className={`px-6 py-4 text-right text-sm font-extrabold font-mono ${
                                            remitoData.totals.diferencia_costo < 0 
                                                ? 'text-red-600' 
                                                : remitoData.totals.diferencia_costo > 0 
                                                    ? 'text-green-600' 
                                                    : 'text-gray-900'
                                        }`}>
                                            {formatCurrency(remitoData.totals.diferencia_costo)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default ValorizacionPage;
