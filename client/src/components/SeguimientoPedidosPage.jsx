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
  const [registeredUsers, setRegisteredUsers] = useState([]);

  // Formulario de Pedido
  const initialFormState = {
    fecha: new Date().toISOString().split('T')[0],
    quien_solicita: user?.sucursal_name || '',
    para_quien: '',
    nro_pedido_venta: '',
    proveedor_marca: '',
    nro_pedido: '',
    codigo_producto_proveed: '',
    urgencia: false,
    rotacion: false,
    transp_mercurio: false,
    otro_transporte: false,
    codigo_mercurio: '',
    descripcion: '',
    capacidad: '',
    cant_pedido: '',
    prev_entrada: '',
    nro_pedido_compra: '',
    recepcion_parcial: '',
    cant_recepcion_parcial: '',
    contacto_mercurio: user?.username || '',
    contacto_mercurio_fecha: '',
    contacto_proveedor: '',
    contacto_proveedor_fecha: '',
    estado: 'Pendiente'
  };
  const [formData, setFormData] = useState(initialFormState);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);

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

  const fetchUsers = async () => {
    try {
      const res = await api.get('/api/users/selector');
      setRegisteredUsers(res.data);
    } catch (error) {
      console.error('Error fetching users for selector:', error);
    }
  };

  useEffect(() => {
    fetchPedidos();
    fetchUsers();
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

  // Opciones de usuarios registrados para los selectores del formulario
  const userSelectOptions = useMemo(() => {
    const options = registeredUsers.map(u => u.username);
    if (formData.quien_solicita && !options.includes(formData.quien_solicita)) {
      options.push(formData.quien_solicita);
    }
    return options.sort();
  }, [registeredUsers, formData.quien_solicita]);

  const targetSelectOptions = useMemo(() => {
    const options = registeredUsers.map(u => u.username);
    if (formData.para_quien && !options.includes(formData.para_quien)) {
      options.push(formData.para_quien);
    }
    return options.sort();
  }, [registeredUsers, formData.para_quien]);

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

  // Buscar producto por código interno (Código Mercurio)
  const buscarProductoPorCodigo = async (codigo) => {
    if (!codigo || codigo.trim().length < 2) return;
    
    setIsSearchingProduct(true);
    try {
      const response = await api.get(`/api/products/${codigo.trim()}`);
      const product = response.data;
      
      if (product && (!Array.isArray(product) || product.length > 0)) {
        const prod = Array.isArray(product) ? product[0] : product;
        setFormData(prev => ({
          ...prev,
          descripcion: prod.description || prev.descripcion || '',
          capacidad: prod.real_weight || prod.capacity || prev.capacidad || ''
        }));
        toast.success(`Producto cargado: ${prod.description}`);
      } else {
        toast.error('Producto no encontrado en el catálogo');
      }
    } catch (error) {
      console.warn('Error al buscar producto:', error);
      toast.error('No se encontró el producto con ese código');
    } finally {
      setIsSearchingProduct(false);
    }
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

    // Parsear descripcion_capacidad en descripcion y capacidad
    let desc = '';
    let cap = '';
    if (pedido.descripcion_capacidad) {
      const parts = pedido.descripcion_capacidad.split(' - ');
      if (parts.length > 1) {
        cap = parts.pop();
        desc = parts.join(' - ');
      } else {
        desc = pedido.descripcion_capacidad;
      }
    }

    setFormData({
      fecha: pedido.fecha || '',
      quien_solicita: pedido.quien_solicita || '',
      para_quien: pedido.para_quien || '',
      nro_pedido_venta: pedido.nro_pedido_venta || '',
      proveedor_marca: pedido.proveedor_marca || '',
      nro_pedido: pedido.nro_pedido || '',
      codigo_producto_proveed: pedido.codigo_producto_proveed || '',
      urgencia: pedido.urgencia || false,
      rotacion: pedido.rotacion || false,
      transp_mercurio: pedido.transp_mercurio || false,
      otro_transporte: pedido.otro_transporte || false,
      codigo_mercurio: pedido.codigo_mercurio || '',
      descripcion: desc,
      capacidad: cap,
      cant_pedido: pedido.cant_pedido || '',
      prev_entrada: pedido.prev_entrada || '',
      nro_pedido_compra: pedido.nro_pedido_compra || '',
      recepcion_parcial: pedido.recepcion_parcial || '',
      cant_recepcion_parcial: pedido.cant_recepcion_parcial || '',
      contacto_mercurio: pedido.contacto_mercurio || '',
      contacto_mercurio_fecha: pedido.contacto_mercurio_fecha || '',
      contacto_proveedor: pedido.contacto_proveedor || '',
      contacto_proveedor_fecha: pedido.contacto_proveedor_fecha || '',
      estado: pedido.estado || 'Pendiente'
    });
    setIsModalOpen(true);
  };

  // Guardar Pedido (Crear o Editar)
  const handleSave = async (e) => {
    e.preventDefault();

    // Validar Recepción Parcial
    if (formData.estado === 'Recepción Parcial' && !formData.cant_recepcion_parcial) {
      toast.error('Debe ingresar la cantidad para la Recepción Parcial');
      return;
    }

    // Combinar descripción y capacidad
    const descCap = formData.descripcion && formData.capacidad
      ? `${formData.descripcion} - ${formData.capacidad}`
      : (formData.descripcion || formData.capacidad || '');

    const cleanFormData = {
      fecha: formData.fecha || new Date().toISOString().split('T')[0],
      quien_solicita: formData.quien_solicita,
      para_quien: formData.para_quien || '',
      nro_pedido_venta: formData.nro_pedido_venta || '',
      proveedor_marca: formData.proveedor_marca,
      nro_pedido: formData.nro_pedido || '',
      codigo_producto_proveed: formData.codigo_producto_proveed || '',
      urgencia: formData.urgencia || false,
      rotacion: formData.rotacion || false,
      transp_mercurio: formData.transp_mercurio || false,
      otro_transporte: formData.otro_transporte || false,
      codigo_mercurio: formData.codigo_mercurio || '',
      descripcion_capacidad: descCap,
      cant_pedido: formData.cant_pedido ? parseFloat(formData.cant_pedido) : null,
      prev_entrada: formData.prev_entrada || '',
      nro_pedido_compra: formData.nro_pedido_compra || '',
      recepcion_parcial: formData.recepcion_parcial || '',
      cant_recepcion_parcial: formData.cant_recepcion_parcial ? parseFloat(formData.cant_recepcion_parcial) : null,
      contacto_mercurio: formData.contacto_mercurio || '',
      contacto_mercurio_fecha: formData.contacto_mercurio_fecha || '',
      contacto_proveedor: formData.contacto_proveedor || '',
      contacto_proveedor_fecha: formData.contacto_proveedor_fecha || '',
      estado: formData.estado || 'Pendiente'
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
                          {pedido.contacto_mercurio && (
                            <span className="text-[10px] text-sky-700 font-medium mt-0.5" title="Contacto Mercurio">
                              Cont: {pedido.contacto_mercurio} {pedido.contacto_mercurio_fecha ? `(${pedido.contacto_mercurio_fecha})` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{pedido.proveedor_marca}</span>
                          {pedido.codigo_producto_proveed && (
                            <span className="text-[11px] font-mono text-gray-500">Cód: {pedido.codigo_producto_proveed}</span>
                          )}
                          {pedido.contacto_proveedor && (
                            <span className="text-[10px] text-rose-700 font-medium mt-0.5" title="Contacto Proveedor">
                              Cont: {pedido.contacto_proveedor} {pedido.contacto_proveedor_fecha ? `(${pedido.contacto_proveedor_fecha})` : ''}
                            </span>
                          )}
                        </div>
                      </td>
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
                          {pedido.estado === 'Recepción Parcial' && pedido.cant_recepcion_parcial && (
                            <p className="text-[11px] font-bold text-blue-600 mt-0.5">
                              Cant. Rec.: {pedido.cant_recepcion_parcial}
                            </p>
                          )}
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
                    {pedido.codigo_producto_proveed && (
                      <span className="inline-block text-[10px] bg-gray-100 text-gray-600 font-mono px-1.5 py-0.5 rounded">
                        Cód: {pedido.codigo_producto_proveed}
                      </span>
                    )}
                  </div>
                  <div>{getStatusBadge(pedido.estado)}</div>
                </div>

                <div className="border-t border-b border-gray-100 py-3 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Solicita</span>
                      <span className="font-semibold text-gray-800">{pedido.quien_solicita}</span>
                      {pedido.contacto_mercurio && (
                        <span className="text-[10px] text-sky-700 block mt-0.5">
                          {pedido.contacto_mercurio} {pedido.contacto_mercurio_fecha ? `(${pedido.contacto_mercurio_fecha})` : ''}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Para</span>
                      <span className="font-semibold text-gray-800">{pedido.para_quien || '-'}</span>
                      {pedido.contacto_proveedor && (
                        <span className="text-[10px] text-rose-700 block mt-0.5">
                          {pedido.contacto_proveedor} {pedido.contacto_proveedor_fecha ? `(${pedido.contacto_proveedor_fecha})` : ''}
                        </span>
                      )}
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

                  {pedido.nro_pedido_venta && (
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">N° Pedido Venta</span>
                      <span className="font-semibold text-gray-800">{pedido.nro_pedido_venta}</span>
                    </div>
                  )}

                  {(pedido.recepcion_parcial || (pedido.estado === 'Recepción Parcial' && pedido.cant_recepcion_parcial)) && (
                    <div>
                      <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Recep. Parcial</span>
                      {pedido.estado === 'Recepción Parcial' && pedido.cant_recepcion_parcial && (
                        <p className="font-bold text-blue-600">Cant. Recibida: {pedido.cant_recepcion_parcial}</p>
                      )}
                      {pedido.recepcion_parcial && (
                        <p className="text-gray-700 italic text-[11px]">{pedido.recepcion_parcial}</p>
                      )}
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
              <div className="p-6 space-y-6 overflow-y-auto flex-grow bg-gray-50/30">
                {/* Sector 1: Destinatario */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <div className="w-2.5 h-5 bg-blue-600 rounded-full"></div>
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Destinatario</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Quién Solicita a Logística?</label>
                      <select
                        name="quien_solicita"
                        value={formData.quien_solicita}
                        onChange={handleInputChange}
                        required
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-gray-800"
                      >
                        <option value="" disabled>Seleccione un usuario...</option>
                        {userSelectOptions.map(username => (
                          <option key={username} value={username}>{username}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Para quién es?</label>
                      <select
                        name="para_quien"
                        value={formData.para_quien}
                        onChange={handleInputChange}
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-gray-800"
                      >
                        <option value="">Seleccione un usuario (opcional)...</option>
                        {targetSelectOptions.map(username => (
                          <option key={username} value={username}>{username}</option>
                        ))}
                      </select>
                    </div>
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
                  </div>
                </div>

                {/* Sector 2: Proveedor */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <div className="w-2.5 h-5 bg-indigo-600 rounded-full"></div>
                    <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wider">Proveedor</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">N° de Pedido</label>
                      <input
                        type="text"
                        name="nro_pedido"
                        placeholder="Ej. DC-3000..."
                        value={formData.nro_pedido}
                        onChange={handleInputChange}
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Código Producto Proveed.</label>
                      <input
                        type="text"
                        name="codigo_producto_proveed"
                        placeholder="Ingrese código de proveedor..."
                        value={formData.codigo_producto_proveed}
                        onChange={handleInputChange}
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Sector 3 y 4: Clasificación y Transporte side-by-side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Sector 3: Clasificación */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                      <div className="w-2.5 h-5 bg-amber-500 rounded-full"></div>
                      <h4 className="text-sm font-bold text-amber-800 uppercase tracking-wider">Clasificación</h4>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Debe elegir una de las dos opciones</label>
                      <div className="flex gap-4 p-1.5 bg-gray-50 rounded-xl border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, urgencia: true, rotacion: false }))}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                            formData.urgencia 
                              ? 'bg-red-600 text-white shadow-sm' 
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          Urgencia (URG)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, urgencia: false, rotacion: true }))}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                            formData.rotacion 
                              ? 'bg-amber-500 text-white shadow-sm' 
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          Rotación (ROT)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sector 4: Transporte */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                      <div className="w-2.5 h-5 bg-purple-600 rounded-full"></div>
                      <h4 className="text-sm font-bold text-purple-900 uppercase tracking-wider">Transporte</h4>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Debe elegir una de las dos opciones</label>
                      <div className="flex gap-4 p-1.5 bg-gray-50 rounded-xl border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, transp_mercurio: true, otro_transporte: false }))}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                            formData.transp_mercurio 
                              ? 'bg-blue-600 text-white shadow-sm' 
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          Transp. Mercurio (MERC)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, transp_mercurio: false, otro_transporte: true }))}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                            formData.otro_transporte 
                              ? 'bg-purple-600 text-white shadow-sm' 
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          Otro Transporte
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sector 5: Producto */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <div className="w-2.5 h-5 bg-emerald-600 rounded-full"></div>
                    <h4 className="text-sm font-bold text-emerald-900 uppercase tracking-wider">Producto</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Código Mercurio</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="codigo_mercurio"
                          placeholder="Ej. 001100..."
                          value={formData.codigo_mercurio}
                          onChange={handleInputChange}
                          onBlur={(e) => buscarProductoPorCodigo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              buscarProductoPorCodigo(e.target.value);
                            }
                          }}
                          className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => buscarProductoPorCodigo(formData.codigo_mercurio)}
                          disabled={isSearchingProduct}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                          title="Buscar producto"
                        >
                          {isSearchingProduct ? (
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Descripción</label>
                      <input
                        type="text"
                        name="descripcion"
                        placeholder="Ej. Esmalte Sintetico, Latex..."
                        value={formData.descripcion}
                        onChange={handleInputChange}
                        required
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Capacidad</label>
                      <input
                        type="text"
                        name="capacidad"
                        placeholder="Ej. 20 LITROS, 1000 UNIDAD..."
                        value={formData.capacidad}
                        onChange={handleInputChange}
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Cant. Pedido</label>
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
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Prev. Entrada</label>
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
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">N° Pedido Compra</label>
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
                  </div>
                </div>

                {/* Sector 6 y 7: Contactos side-by-side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Sector 6: Contacto Mercurio */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                      <div className="w-2.5 h-5 bg-sky-500 rounded-full"></div>
                      <h4 className="text-sm font-bold text-sky-900 uppercase tracking-wider font-semibold">Contacto Mercurio</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Quién?</label>
                        <input
                          type="text"
                          name="contacto_mercurio"
                          placeholder="Nombre responsable..."
                          value={formData.contacto_mercurio}
                          onChange={handleInputChange}
                          className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Fechas?</label>
                        <input
                          type="text"
                          name="contacto_mercurio_fecha"
                          placeholder="Ej. 10/06, 12/06..."
                          value={formData.contacto_mercurio_fecha}
                          onChange={handleInputChange}
                          className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sector 7: Contacto Proveedor */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                      <div className="w-2.5 h-5 bg-rose-500 rounded-full"></div>
                      <h4 className="text-sm font-bold text-rose-950 uppercase tracking-wider">Contacto Proveedor</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Quién?</label>
                        <input
                          type="text"
                          name="contacto_proveedor"
                          placeholder="Contacto proveedor..."
                          value={formData.contacto_proveedor}
                          onChange={handleInputChange}
                          className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Fechas?</label>
                        <input
                          type="text"
                          name="contacto_proveedor_fecha"
                          placeholder="Ej. 14/06, 16/06..."
                          value={formData.contacto_proveedor_fecha}
                          onChange={handleInputChange}
                          className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sector 8: Estado */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <div className="w-2.5 h-5 bg-teal-600 rounded-full"></div>
                    <h4 className="text-sm font-bold text-teal-900 uppercase tracking-wider">Estado</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Estado del Pedido</label>
                      <select
                        name="estado"
                        value={formData.estado}
                        onChange={handleInputChange}
                        required
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-gray-800"
                      >
                        {!['Anulado', 'Recepción Parcial', 'Recepción Total'].includes(formData.estado) && (
                          <option value={formData.estado}>{formData.estado}</option>
                        )}
                        <option value="Anulado">Anulado</option>
                        <option value="Recepción Parcial">Recepción Parcial</option>
                        <option value="Recepción Total">Recepción Total</option>
                      </select>
                    </div>

                    {formData.estado === 'Recepción Parcial' && (
                      <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Cantidad Recibida *</label>
                        <input
                          type="number"
                          step="any"
                          name="cant_recepcion_parcial"
                          placeholder="Ej. 10, 50..."
                          value={formData.cant_recepcion_parcial}
                          onChange={handleInputChange}
                          required={formData.estado === 'Recepción Parcial'}
                          className="w-full p-2.5 rounded-xl border border-blue-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-semibold text-blue-900 placeholder-blue-300"
                        />
                      </div>
                    )}

                    <div className={formData.estado === 'Recepción Parcial' ? 'col-span-1' : 'col-span-2'}>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Detalles / Recepción Parcial (Comentarios)</label>
                      <input
                        type="text"
                        name="recepcion_parcial"
                        placeholder="Notas o historial de recepciones..."
                        value={formData.recepcion_parcial}
                        onChange={handleInputChange}
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      />
                    </div>
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
