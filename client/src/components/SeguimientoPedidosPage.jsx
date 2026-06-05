import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, Download, Trash2, Edit, Calendar, Truck,
  AlertCircle, CheckCircle2, Clock, Users, Package, Filter, X, Upload, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const formatLocalDate = (dateStr) => {
  if (!dateStr) return '-';
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (regex.test(dateStr)) {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const SeguimientoPedidosPage = () => {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Filtros
  const [activeTab, setActiveTab] = useState('activos'); // 'activos' | 'historial'
  const [selectedEstado, setSelectedEstado] = useState('Todos');
  const [selectedSolicitante, setSelectedSolicitante] = useState('Todos');
  const [selectedProveedor, setSelectedProveedor] = useState('Todos');
  const [showFilters, setShowFilters] = useState(false);

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPedido, setEditingPedido] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [viewingPedido, setViewingPedido] = useState(null);

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
    estado: 'Pendiente',
    abonado: true
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

  const contactoMercurioSelectOptions = useMemo(() => {
    const options = registeredUsers.map(u => u.username);
    if (formData.contacto_mercurio && !options.includes(formData.contacto_mercurio)) {
      options.push(formData.contacto_mercurio);
    }
    return options.sort();
  }, [registeredUsers, formData.contacto_mercurio]);

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

  // Filtrar pedidos por la pestaña activa
  const pedidosPorPestaña = useMemo(() => {
    return pedidos.filter(p => {
      const lowerEstado = p.estado?.toLowerCase() || '';
      const isFinalizado =
        lowerEstado.includes('recibido') ||
        lowerEstado.includes('total') ||
        lowerEstado.includes('anulado') ||
        lowerEstado.includes('entregado');

      if (activeTab === 'historial') {
        return isFinalizado;
      } else {
        return !isFinalizado;
      }
    });
  }, [pedidos, activeTab]);

  // Filtrado de pedidos
  const filteredPedidos = useMemo(() => {
    return pedidosPorPestaña.filter(p => {
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
  }, [pedidosPorPestaña, searchQuery, selectedEstado, selectedSolicitante, selectedProveedor]);

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
      estado: pedido.estado || 'Pendiente',
      abonado: pedido.abonado !== undefined ? pedido.abonado : true
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
      estado: formData.estado || 'Pendiente',
      abonado: formData.abonado
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
  const canManage = user?.role === 'superadmin' || 
                    (user?.permissions && user.permissions.includes('manage_seguimiento_pedidos'));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-800">
            Seguimiento de Pedidos
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Visualiza, gestiona y controla los pedidos del año. Importa planillas y gestiona el flujo de recepción.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canManage && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" /> Registrar Pedido
            </button>
          )}

          {canManage && (
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
          )}

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Pestañas (Tabs) Activos / Historial */}
      <div className="flex overflow-x-auto no-scrollbar border-b border-gray-200 bg-white p-1 rounded-2xl border border-gray-100 shadow-sm gap-2">
        <button
          onClick={() => setActiveTab('activos')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-3 sm:px-6 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 whitespace-nowrap ${
            activeTab === 'activos'
              ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
          }`}
        >
          <Clock className="w-4.5 h-4.5" />
          Pedidos Activos
          <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
            activeTab === 'activos' ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {pedidos.filter(p => {
              const le = p.estado?.toLowerCase() || '';
              return !(le.includes('recibido') || le.includes('total') || le.includes('anulado') || le.includes('entregado'));
            }).length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('historial')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-3 sm:px-6 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 whitespace-nowrap ${
            activeTab === 'historial'
              ? 'bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
          }`}
        >
          <CheckCircle2 className="w-4.5 h-4.5" />
          Historial / Finalizados
          <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
            activeTab === 'historial' ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {pedidos.filter(p => {
              const le = p.estado?.toLowerCase() || '';
              return le.includes('recibido') || le.includes('total') || le.includes('anulado') || le.includes('entregado');
            }).length}
          </span>
        </button>
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
            className={`flex items-center justify-center gap-2 border px-4 py-3 rounded-xl text-sm font-medium transition-all ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
                    <th className="py-3.5 px-4">Producto</th>
                    <th className="py-3.5 px-4">Estado</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredPedidos.map((pedido) => (
                    <tr 
                      key={pedido.id} 
                      onClick={() => setViewingPedido(pedido)}
                      className="hover:bg-blue-50/30 transition-all duration-150 cursor-pointer"
                    >
                      <td className="py-4 px-4 whitespace-nowrap text-gray-600 font-medium">
                        {pedido.fecha ? new Date(pedido.fecha).toLocaleDateString('es-AR') : '-'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{pedido.para_quien || '-'}</span>
                          <span className="text-[11px] text-gray-400">De: {pedido.quien_solicita}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="max-w-[400px]">
                          <p className="font-semibold text-gray-800 truncate" title={pedido.descripcion_capacidad}>
                            {pedido.descripcion_capacidad}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {pedido.codigo_mercurio && (
                              <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-semibold">
                                Cód: {pedido.codigo_mercurio}
                              </span>
                            )}
                            <span className="text-xs text-gray-500 font-medium">
                              Cant: <span className="font-bold text-gray-900">{pedido.cant_pedido || '-'}</span>
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                              pedido.abonado 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                            }`}>
                              {pedido.abonado ? 'Abonado' : 'No Abonado'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">{getStatusBadge(pedido.estado)}</td>
                      <td className="py-4 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewingPedido(pedido)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Ver detalles completos"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => handleOpenEdit(pedido)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                              title="Editar pedido"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && canManage && (
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
              <div 
                key={pedido.id} 
                onClick={() => setViewingPedido(pedido)}
                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3 hover:border-blue-200 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-gray-400">
                      {pedido.fecha ? new Date(pedido.fecha).toLocaleDateString('es-AR') : '-'}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Origen / Destino</span>
                      <span className="font-bold text-gray-900">{pedido.para_quien || '-'}</span>
                      <span className="text-[11px] text-gray-400">De: {pedido.quien_solicita}</span>
                    </div>
                  </div>
                  <div>{getStatusBadge(pedido.estado)}</div>
                </div>

                <div className="border-t border-gray-100 pt-3 text-xs">
                  <span className="text-gray-400 block uppercase tracking-wider text-[9px] font-bold">Producto</span>
                  <span className="font-semibold text-gray-800 block truncate">
                    {pedido.codigo_mercurio ? `[${pedido.codigo_mercurio}] ` : ''}
                    {pedido.descripcion_capacidad}
                  </span>
                  <span className="text-[10px] text-gray-500 font-semibold">Cant. Pedida: {pedido.cant_pedido || '-'}</span>
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold border inline-block ${
                    pedido.abonado 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                      : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}>
                    {pedido.abonado ? 'Abonado' : 'No Abonado'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] sm:text-xs font-semibold pt-1.5 border-t border-gray-100/50" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setViewingPedido(pedido)}
                    className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ver Detalle
                  </button>
                  {canManage && (
                    <button
                      onClick={() => handleOpenEdit(pedido)}
                      className="flex items-center gap-1 text-amber-600 hover:bg-amber-50 px-2.5 py-1.5 rounded-lg transition-all"
                    >
                      <Edit className="w-3.5 h-3.5" /> Editar
                    </button>
                  )}
                  {isAdmin && canManage && (
                    <button
                      onClick={() => handleDelete(pedido.id)}
                      className="flex items-center gap-1 text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-all"
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
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-gray-800"
                      >
                        <option value="">Seleccione un usuario/sucursal (opcional)...</option>
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
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Proveedor / Marca</label>
                      <input
                        type="text"
                        name="proveedor_marca"
                        placeholder="Ej. Saint Gobain, Tersuave..."
                        value={formData.proveedor_marca}
                        onChange={handleInputChange}
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
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Abonado?</label>
                      <div className="flex p-1 bg-gray-50 rounded-xl border border-gray-200 h-[42px] items-center">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, abonado: true }))}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all h-full ${
                            formData.abonado
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          SÍ
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, abonado: false }))}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all h-full ${
                            !formData.abonado
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          NO
                        </button>
                      </div>
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
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${formData.urgencia
                              ? 'bg-red-600 text-white shadow-sm'
                              : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                          Urgencia (URG)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, urgencia: false, rotacion: true }))}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${formData.rotacion
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
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${formData.transp_mercurio
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                          Transp. Mercurio (MERC)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, transp_mercurio: false, otro_transporte: true }))}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${formData.otro_transporte
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
                        <select
                          name="contacto_mercurio"
                          value={formData.contacto_mercurio}
                          onChange={handleInputChange}
                          className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-gray-800"
                        >
                          <option value="">Seleccione un usuario (opcional)...</option>
                          {contactoMercurioSelectOptions.map(username => (
                            <option key={username} value={username}>{username}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">¿Fechas?</label>
                        <input
                          type="date"
                          name="contacto_mercurio_fecha"
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
                          type="date"
                          name="contacto_proveedor_fecha"
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

      {/* Modal Detalle de Pedido */}
      {viewingPedido && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Package className="w-5 h-5" /> Ficha de Pedido Detallada
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  Pedido del {viewingPedido.fecha ? new Date(viewingPedido.fecha).toLocaleDateString('es-AR') : '-'}
                </p>
              </div>
              <button
                onClick={() => setViewingPedido(null)}
                className="p-1 rounded-full hover:bg-white/10 transition-all text-white/80 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-grow bg-gray-50/30">
              {/* Estado y Clasificación */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Estado:</span>
                  {getStatusBadge(viewingPedido.estado)}
                </div>
                <div className="flex gap-2">
                  {viewingPedido.urgencia && (
                    <span className="px-2.5 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-full uppercase border border-red-200">
                      Urgente (URG)
                    </span>
                  )}
                  {viewingPedido.rotacion && (
                    <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-700 rounded-full uppercase border border-amber-200">
                      Rotación (ROT)
                    </span>
                  )}
                  {viewingPedido.transp_mercurio && (
                    <span className="px-2.5 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded-full uppercase border border-blue-200">
                      Transporte Mercurio (MERC)
                    </span>
                  )}
                  {viewingPedido.otro_transporte && (
                    <span className="px-2.5 py-1 text-xs font-bold bg-purple-100 text-purple-700 rounded-full uppercase border border-purple-200">
                      Otro Transporte
                    </span>
                  )}
                </div>
              </div>

              {/* Destinatario y Solicitante */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Solicitud y Destino</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-xs text-gray-400 block">Quién Solicita:</span>
                      <span className="font-semibold text-gray-800">{viewingPedido.quien_solicita || '-'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 block">Para Quién:</span>
                      <span className="font-semibold text-gray-800">{viewingPedido.para_quien || '-'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 block">Nro Pedido Venta:</span>
                      <span className="font-mono text-gray-800 font-medium">{viewingPedido.nro_pedido_venta || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Proveedor y Compra */}
                <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <Truck className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wider">Proveedor y Compra</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-xs text-gray-400 block">Proveedor / Marca:</span>
                      <span className="font-semibold text-gray-805">{viewingPedido.proveedor_marca || '-'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-xs text-gray-400 block">N° Pedido Prov:</span>
                        <span className="font-semibold text-gray-800">{viewingPedido.nro_pedido || '-'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 block">Cód Prod Prov:</span>
                        <span className="font-mono text-gray-700 text-xs">{viewingPedido.codigo_producto_proveed || '-'}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-xs text-gray-400 block">N° Pedido Compra (OC):</span>
                        <span className="font-mono text-blue-600 font-semibold">{viewingPedido.nro_pedido_compra || '-'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 block">¿Abonado?:</span>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold border ${
                          viewingPedido.abonado 
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                            : 'bg-rose-100 text-rose-800 border-rose-200'
                        }`}>
                          {viewingPedido.abonado ? 'SÍ' : 'NO'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Producto */}
              <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-emerald-950 uppercase tracking-wider">Producto y Cantidad</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="md:col-span-2">
                    <span className="text-xs text-gray-400 block">Descripción y Capacidad:</span>
                    <span className="font-bold text-gray-800 text-base">{viewingPedido.descripcion_capacidad || '-'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Código Mercurio:</span>
                    <span className="font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs inline-block font-semibold">
                      {viewingPedido.codigo_mercurio || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Cantidad Pedida:</span>
                    <span className="font-bold text-gray-900 text-lg">{viewingPedido.cant_pedido || '-'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Prev. Entrada:</span>
                    <span className="font-semibold text-gray-800">{viewingPedido.prev_entrada || '-'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Fecha de Registro:</span>
                    <span className="font-semibold text-gray-800">
                      {viewingPedido.fecha ? new Date(viewingPedido.fecha).toLocaleDateString('es-AR') : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contactos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contacto Mercurio */}
                <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <div className="w-2 h-2 bg-sky-500 rounded-full"></div>
                    <h4 className="text-xs font-bold text-sky-900 uppercase tracking-wider">Contacto Mercurio</h4>
                  </div>
                  <div className="text-sm space-y-2">
                    <div>
                      <span className="text-xs text-gray-400 block">Responsable:</span>
                      <span className="font-semibold text-gray-850">{viewingPedido.contacto_mercurio || '-'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 block">Fechas de contacto:</span>
                      <span className="font-medium text-gray-700">{formatLocalDate(viewingPedido.contacto_mercurio_fecha)}</span>
                    </div>
                  </div>
                </div>

                {/* Contacto Proveedor */}
                <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
                    <h4 className="text-xs font-bold text-rose-950 uppercase tracking-wider">Contacto Proveedor</h4>
                  </div>
                  <div className="text-sm space-y-2">
                    <div>
                      <span className="text-xs text-gray-400 block">Responsable:</span>
                      <span className="font-semibold text-gray-850">{viewingPedido.contacto_proveedor || '-'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 block">Fechas de contacto:</span>
                      <span className="font-medium text-gray-700">{formatLocalDate(viewingPedido.contacto_proveedor_fecha)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recepción y comentarios */}
              {(viewingPedido.recepcion_parcial || viewingPedido.cant_recepcion_parcial) && (
                <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-3">
                  <div className="flex items-center gap-2 border-b border-blue-100 pb-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Detalles de Recepción</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    {viewingPedido.cant_recepcion_parcial && (
                      <div>
                        <span className="text-xs text-blue-700 block">Cantidad Recibida:</span>
                        <span className="font-bold text-blue-900 text-lg">{viewingPedido.cant_recepcion_parcial}</span>
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <span className="text-xs text-blue-700 block">Comentarios / Historial:</span>
                      <span className="font-semibold text-blue-950">{viewingPedido.recepcion_parcial || '-'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100 shrink-0">
              <div className="flex gap-2">
                {canManage && (
                  <button
                    onClick={() => {
                      handleOpenEdit(viewingPedido);
                      setViewingPedido(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-bold transition-all"
                  >
                    <Edit className="w-4 h-4" /> Editar Pedido
                  </button>
                )}
                {isAdmin && canManage && (
                  <button
                    onClick={() => {
                      handleDelete(viewingPedido.id);
                      setViewingPedido(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-sm font-bold transition-all"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                )}
              </div>
              <button
                onClick={() => setViewingPedido(null)}
                className="px-5 py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-sm font-semibold text-gray-700 transition-all border border-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeguimientoPedidosPage;
