import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Download, Trash2, Edit, Calendar, Truck, 
  AlertCircle, CheckCircle2, Clock, Users, Package, Filter, X, Upload
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const SeguimientoPedidosPage = () => {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filtros
  const [selectedEstado, setSelectedEstado] = useState('Todos');
  const [selectedSolicitante, setSelectedSolicitante] = useState('Todos');
  const [selectedProveedor, setSelectedProveedor] = useState('Todos');
  const [showFilters, setShowFilters] = useState(false);

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPedido, setEditingPedido] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  // Formulario de Pedido
  const initialFormState = {
    fecha: new Date().toISOString().split('T')[0],
    quien_solicita: user?.sucursal_name || '',
    para_quien: '',
    nro_pedido_venta: '',
    proveedor_marca: '',
    nro_pedido: '',
    urgencia: false,
    rotacion: false,
    transp_mercurio: false,
    otro_transporte: false,
    codigo_mercurio: '',
    descripcion_capacidad: '',
    cant_pedido: '',
    prev_entrada: '',
    nro_pedido_compra: '',
    recepcion_parcial: '',
    contacto_mercurio: user?.username || '',
    contacto_proveedor: '',
    estado: 'Pendiente'
  };
  const [formData, setFormData] = useState(initialFormState);

  // Cargar Pedidos
  const fetchPedidos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/seguimiento-pedidos');
      setPedidos(res.data);
    } catch (error) {
      console.error('Error fetching pedidos:', error);
      toast.error('Error al cargar la lista de pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPedidos();
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  // Opciones de filtros dinámicos basados en los datos
  const filterOptions = useMemo(() => {
    const solicitantes = new Set();
    const proveedores = new Set();
    
    pedidos.forEach(p => {
      if (p.quien_solicita) solicitantes.add(p.quien_solicita);
      if (p.proveedor_marca) proveedores.add(p.proveedor_marca);
    });

    return {
      solicitantes: ['Todos', ...Array.from(solicitantes)],
      proveedores: ['Todos', ...Array.from(proveedores)],
      estados: ['Todos', 'Pendiente', 'Recibido', 'Recepción Parcial']
    };
  }, [pedidos]);

  // Filtrado de pedidos
  const filteredPedidos = useMemo(() => {
    return pedidos.filter(p => {
      const matchesSearch = 
        (p.descripcion_capacidad?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.codigo_mercurio?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.proveedor_marca?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.nro_pedido?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.nro_pedido_compra?.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesEstado = selectedEstado === 'Todos' || 
        (selectedEstado === 'Pendiente' && p.estado?.toLowerCase().includes('pendiente')) ||
        (selectedEstado === 'Recibido' && p.estado?.toLowerCase().includes('recibido')) ||
        (selectedEstado === 'Recepción Parcial' && p.estado?.toLowerCase().includes('parcial'));

      const matchesSolicitante = selectedSolicitante === 'Todos' || p.quien_solicita === selectedSolicitante;
      const matchesProveedor = selectedProveedor === 'Todos' || p.proveedor_marca === selectedProveedor;

      return matchesSearch && matchesEstado && matchesSolicitante && matchesProveedor;
    });
  }, [pedidos, searchQuery, selectedEstado, selectedSolicitante, selectedProveedor]);

  // Manejar cambios en el formulario
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Abrir Modal para crear
  const handleOpenCreate = () => {
    setEditingPedido(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  // Abrir Modal para editar
  const handleOpenEdit = (pedido) => {
    setEditingPedido(pedido);
    setFormData({
      fecha: pedido.fecha || '',
      quien_solicita: pedido.quien_solicita || '',
      para_quien: pedido.para_quien || '',
      nro_pedido_venta: pedido.nro_pedido_venta || '',
      proveedor_marca: pedido.proveedor_marca || '',
      nro_pedido: pedido.nro_pedido || '',
      urgencia: pedido.urgencia || false,
      rotacion: pedido.rotacion || false,
      transp_mercurio: pedido.transp_mercurio || false,
      otro_transporte: pedido.otro_transporte || false,
      codigo_mercurio: pedido.codigo_mercurio || '',
      descripcion_capacidad: pedido.descripcion_capacidad || '',
      cant_pedido: pedido.cant_pedido || '',
      prev_entrada: pedido.prev_entrada || '',
      nro_pedido_compra: pedido.nro_pedido_compra || '',
      recepcion_parcial: pedido.recepcion_parcial || '',
      contacto_mercurio: pedido.contacto_mercurio || '',
      contacto_proveedor: pedido.contacto_proveedor || '',
      estado: pedido.estado || 'Pendiente'
    });
    setIsModalOpen(true);
  };

  // Guardar Pedido (Crear o Editar)
  const handleSave = async (e) => {
    e.preventDefault();
    const cleanFormData = {
      ...formData,
      cant_pedido: formData.cant_pedido ? parseFloat(formData.cant_pedido) : null
    };

    const toastId = toast.loading(editingPedido ? 'Actualizando pedido...' : 'Registrando pedido...');
    try {
      if (editingPedido) {
        await api.put(`/api/seguimiento-pedidos/${editingPedido.id}`, cleanFormData);
        toast.success('Pedido actualizado correctamente', { id: toastId });
      } else {
        await api.post('/api/seguimiento-pedidos', cleanFormData);
        toast.success('Pedido registrado correctamente', { id: toastId });
      }
      setIsModalOpen(false);
      fetchPedidos();
    } catch (error) {
      console.error('Error saving pedido:', error);
      toast.error('Error al guardar el pedido', { id: toastId });
    }
  };

  // Eliminar Pedido
  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este registro de seguimiento de pedido?')) return;
    const toastId = toast.loading('Eliminando pedido...');
    try {
      await api.delete(`/api/seguimiento-pedidos/${id}`);
      toast.success('Pedido eliminado correctamente', { id: toastId });
      fetchPedidos();
    } catch (error) {
      console.error('Error deleting pedido:', error);
      toast.error('Error al eliminar el pedido', { id: toastId });
    }
  };

  // Subir / Importar PDF
  const handleImportPdf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsImporting(true);
    const toastId = toast.loading('Procesando PDF e importando pedidos...');
    try {
      const res = await api.post('/api/seguimiento-pedidos/import-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(res.data.message || 'Pedidos importados correctamente', { id: toastId });
      fetchPedidos();
    } catch (error) {
      console.error('Error importing PDF:', error);
      toast.error(error.response?.data?.message || 'Error al procesar el PDF', { id: toastId });
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Limpiar file input
    }
  };

  // Exportar Excel
  const handleExportExcel = async () => {
    const toastId = toast.loading('Generando reporte Excel...');
    try {
      const response = await api.get('/api/seguimiento-pedidos/export', {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Seguimiento_Pedidos_2025.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Excel descargado con éxito', { id: toastId });
    } catch (error) {
      console.error('Error exporting Excel:', error);
      toast.error('Error al descargar el archivo Excel', { id: toastId });
    }
  };

  // Badge de Estado
  const getStatusBadge = (estado) => {
    const lower = estado?.toLowerCase() || '';
    if (lower.includes('recibido') && lower.includes('entregado')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" /> Recibido y Entregado
        </span>
      );
    }
    if (lower.includes('recibido') || lower.includes('recicbido') || lower.includes('resibido')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
          <CheckCircle2 className="w-3.5 h-3.5" /> Recibido
        </span>
      );
    }
    if (lower.includes('parcial')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
          <Clock className="w-3.5 h-3.5" /> Rec. Parcial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
        <Clock className="w-3.5 h-3.5" /> {estado || 'Pendiente'}
      </span>
    );
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-gray-100 shadow-sm gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-800">
            Seguimiento de Pedidos 2025
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Visualiza, gestiona y controla los pedidos del año. Importa planillas y gestiona el flujo de recepción.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" /> Registrar Pedido
          </button>
          
          <label className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer">
            <Upload className="w-4 h-4" /> Importar PDF
            <input 
              type="file" 
              accept=".pdf" 
              className="hidden" 
              onChange={handleImportPdf}
              disabled={isImporting}
            />
          </label>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Control / Buscador y Filtros */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por descripción, código, proveedor, N° pedido..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50/50"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-2 border px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4.5 h-4.5" /> Filtros
          </button>
        </div>

        {/* Panel de Filtros Adicionales */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Estado</label>
              <select
                value={selectedEstado}
                onChange={(e) => setSelectedEstado(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none"
              >
                {filterOptions.estados.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Quién Solicita</label>
              <select
                value={selectedSolicitante}
                onChange={(e) => setSelectedSolicitante(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none"
              >
                {filterOptions.solicitantes.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Proveedor / Marca</label>
              <select
                value={selectedProveedor}
                onChange={(e) => setSelectedProveedor(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none"
              >
                {filterOptions.proveedores.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Listado / Tabla */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="mt-4 text-sm text-gray-500">Cargando pedidos de seguimiento...</p>
        </div>
      ) : filteredPedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm text-center px-4">
          <Package className="w-14 h-14 text-gray-300 mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-gray-800">No se encontraron pedidos</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md">
            Intenta cambiar los filtros de búsqueda o registra un nuevo pedido de seguimiento en el panel superior.
          </p>
        </div>
      ) : (
        <>
          {/* Tabla Desktop */}
          <div className="hidden xl:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-[11px] font-bold uppercase tracking-wider border-b border-gray-100">
                    <th className="py-3.5 px-4">Fecha</th>
                    <th className="py-3.5 px-4">Origen / Destino</th>
                    <th className="py-3.5 px-4">Proveedor</th>
                    <th className="py-3.5 px-4">N° Pedido Venta</th>
                    <th className="py-3.5 px-4">Ref. / Compra</th>
                    <th className="py-3.5 px-4">Indicadores</th>
                    <th className="py-3.5 px-4">Cód. Merc.</th>
                    <th className="py-3.5 px-4">Descripción / Cant.</th>
                    <th className="py-3.5 px-4">Prev. Entrada</th>
                    <th className="py-3.5 px-4">Parcial / Total</th>
                    <th className="py-3.5 px-4">Estado</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredPedidos.map((pedido) => (
                    <tr key={pedido.id} className="hover:bg-blue-50/20 transition-all duration-150">
                      <td className="py-4 px-4 whitespace-nowrap text-gray-600 font-medium">
                        {pedido.fecha ? new Date(pedido.fecha).toLocaleDateString('es-AR') : '-'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{pedido.quien_solicita}</span>
                          <span className="text-[11px] text-gray-400">Para: {pedido.para_quien || '-'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-medium text-gray-800">{pedido.proveedor_marca}</td>
                      <td className="py-4 px-4 whitespace-nowrap text-xs font-mono text-gray-600">
                        {pedido.nro_pedido_venta || '-'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-gray-800">Ped. Prov: {pedido.nro_pedido || '-'}</span>
                          <span className="text-[11px] font-medium text-blue-600">OC: {pedido.nro_pedido_compra || '-'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1">
                          {pedido.urgencia && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-100 text-red-700 rounded uppercase">Urg</span>
                          )}
                          {pedido.rotacion && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded uppercase">Rot</span>
                          )}
                          {pedido.transp_mercurio && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded uppercase">Merc</span>
                          )}
                          {pedido.otro_transporte && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-700 rounded uppercase">Otro</span>
                          )}
                          {!pedido.urgencia && !pedido.rotacion && !pedido.transp_mercurio && !pedido.otro_transporte && (
                            <span className="text-gray-300">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-xs font-mono font-medium text-gray-600">{pedido.codigo_mercurio || '-'}</td>
                      <td className="py-4 px-4">
                        <div className="max-w-[200px]">
                          <p className="font-semibold text-gray-800 truncate" title={pedido.descripcion_capacidad}>
                            {pedido.descripcion_capacidad}
                          </p>
                          <p className="text-xs text-gray-500 font-medium mt-0.5">
                            Cant: <span className="font-bold text-gray-900">{pedido.cant_pedido || '-'}</span>
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-xs text-gray-600 font-medium">{pedido.prev_entrada || '-'}</td>
                      <td className="py-4 px-4">
                        <div className="max-w-[150px] text-xs">
                          <p className="text-gray-700 line-clamp-1" title={pedido.recepcion_parcial}>
                            {pedido.recepcion_parcial || '-'}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">{getStatusBadge(pedido.estado)}</td>
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(pedido)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Editar pedido"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(pedido.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Eliminar pedido"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tarjetas / Grid responsivo para pantallas medianas/móviles */}
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPedidos.map((pedido) => (
              <div key={pedido.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 hover:border-blue-200 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-gray-400">
                      {pedido.fecha ? new Date(pedido.fecha).toLocaleDateString('es-AR') : '-'}
                    </span>
                    <h4 className="font-bold text-gray-900">{pedido.proveedor_marca}</h4>
                  </div>
                  <div>{getStatusBadge(pedido.estado)}</div>
                </div>

                <div className="border-t border-b border-gray-100 py-3 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Solicita</span>
                      <span className="font-semibold text-gray-800">{pedido.quien_solicita}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Para</span>
                      <span className="font-semibold text-gray-800">{pedido.para_quien || '-'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Producto / Cantidad</span>
                    <span className="font-semibold text-gray-800 block truncate">
                      {pedido.codigo_mercurio ? `[${pedido.codigo_mercurio}] ` : ''}
                      {pedido.descripcion_capacidad}
                    </span>
                    <span className="text-[10px] text-gray-500 font-semibold">Cant. Pedida: {pedido.cant_pedido || '-'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Ped. Prov / Compra</span>
                      <span className="font-mono text-gray-800 font-medium">
                        {pedido.nro_pedido || '-'} / {pedido.nro_pedido_compra || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Prev. Entrada</span>
                      <span className="font-semibold text-gray-800">{pedido.prev_entrada || '-'}</span>
                    </div>
                  </div>

                  {pedido.recepcion_parcial && (
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Recep. Parcial</span>
                      <p className="text-gray-700 italic text-[11px]">{pedido.recepcion_parcial}</p>
                    </div>
                  )}

                  <div className="flex gap-1.5 pt-1">
                    {pedido.urgencia && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-100 text-red-700 rounded uppercase">Urg</span>
                    )}
                    {pedido.rotacion && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded uppercase">Rot</span>
                    )}
                    {pedido.transp_mercurio && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded uppercase">Merc</span>
                    )}
                    {pedido.otro_transporte && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-700 rounded uppercase">Otro</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 text-xs font-semibold pt-1">
                  <button
                    onClick={() => handleOpenEdit(pedido)}
                    className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Edit className="w-3.5 h-3.5" /> Editar
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(pedido.id)}
                      className="flex items-center gap-1 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Crear / Editar Pedido */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div>
                <h3 className="text-lg font-bold">
                  {editingPedido ? 'Editar Registro de Pedido' : 'Registrar Nuevo Pedido'}
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">Completa los campos para hacer el seguimiento.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 transition-all text-white/80 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="flex flex-col flex-grow overflow-hidden">
              <div className="p-6 space-y-6 overflow-y-auto flex-grow">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Primera Fila */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Fecha de Registro</label>
                    <input
                      type="date"
                      name="fecha"
                      value={formData.fecha}
                      onChange={handleInputChange}
                      required
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Quién solicita?</label>
                    <input
                      type="text"
                      name="quien_solicita"
                      placeholder="Ej. Sucursal 02, Compras..."
                      value={formData.quien_solicita}
                      onChange={handleInputChange}
                      required
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Para quién es?</label>
                    <input
                      type="text"
                      name="para_quien"
                      placeholder="Ej. Sucursal 02, Stock..."
                      value={formData.para_quien}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>

                  {/* Segunda Fila */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">N° Pedido de Venta</label>
                    <input
                      type="text"
                      name="nro_pedido_venta"
                      placeholder="Ingrese número si aplica..."
                      value={formData.nro_pedido_venta}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Proveedor / Marca</label>
                    <input
                      type="text"
                      name="proveedor_marca"
                      placeholder="Ej. Saint Gobain, Tersuave..."
                      value={formData.proveedor_marca}
                      onChange={handleInputChange}
                      required
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">N° Pedido del Proveedor</label>
                    <input
                      type="text"
                      name="nro_pedido"
                      placeholder="Ej. DC-3000..."
                      value={formData.nro_pedido}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>

                  {/* Tercera Fila */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Código Mercurio</label>
                    <input
                      type="text"
                      name="codigo_mercurio"
                      placeholder="Ej. 001100..."
                      value={formData.codigo_mercurio}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Descripción / Capacidad</label>
                    <input
                      type="text"
                      name="descripcion_capacidad"
                      placeholder="Ej. 1,000 UNIDAD, 20 LITROS..."
                      value={formData.descripcion_capacidad}
                      onChange={handleInputChange}
                      required
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Cantidad Pedida</label>
                    <input
                      type="number"
                      step="any"
                      name="cant_pedido"
                      placeholder="Ej. 20, 100..."
                      value={formData.cant_pedido}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>

                  {/* Cuarta Fila */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">N° Pedido Compra (OC)</label>
                    <input
                      type="text"
                      name="nro_pedido_compra"
                      placeholder="Ej. 175, 2664..."
                      value={formData.nro_pedido_compra}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Prev. Entrada / Fechas</label>
                    <input
                      type="text"
                      name="prev_entrada"
                      placeholder="Ej. 12/05, 15/5..."
                      value={formData.prev_entrada}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Estado del Pedido</label>
                    <select
                      name="estado"
                      value={formData.estado}
                      onChange={handleInputChange}
                      required
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="Recepción Parcial">Recepción Parcial</option>
                      <option value="Recibido">Recibido</option>
                      <option value="Recibido y entregado">Recibido y entregado</option>
                    </select>
                  </div>
                </div>

                {/* Indicadores / Checkboxes */}
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                  <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Características Especiales</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        name="urgencia"
                        checked={formData.urgencia}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      Urgencia (URG)
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        name="rotacion"
                        checked={formData.rotacion}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      Rotación (ROT)
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        name="transp_mercurio"
                        checked={formData.transp_mercurio}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      Transp. Mercurio (MERC)
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        name="otro_transporte"
                        checked={formData.otro_transporte}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      Otro Transporte
                    </label>
                  </div>
                </div>

                {/* Detalles Adicionales */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Detalles / Recepción Parcial (Comentarios)</label>
                    <input
                      type="text"
                      name="recepcion_parcial"
                      placeholder="Notas o historial de recepciones..."
                      value={formData.recepcion_parcial}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Contacto Mercurio</label>
                    <input
                      type="text"
                      name="contacto_mercurio"
                      placeholder="Nombre del responsable..."
                      value={formData.contacto_mercurio}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Contacto Proveedor / Notas adicionales</label>
                    <input
                      type="text"
                      name="contacto_proveedor"
                      placeholder="Nombre del contacto en el proveedor o comentarios extra..."
                      value={formData.contacto_proveedor}
                      onChange={handleInputChange}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                    />
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                >
                  {editingPedido ? 'Guardar Cambios' : 'Registrar Pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeguimientoPedidosPage;
