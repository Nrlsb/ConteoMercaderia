import React, { useState, useEffect } from 'react';
import { 
    Search, 
    Plus, 
    Edit2, 
    X, 
    Check, 
    FileText, 
    AlertCircle, 
    Package, 
    Info, 
    BarChart, 
    Scale, 
    Layers,
    DollarSign
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const ProductsPage = () => {
    const { user } = useAuth();
    
    // Permission checks
    const isSuperAdmin = user?.role === 'superadmin';
    const isAdminLike = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'branch_admin';
    const userPermissions = user?.permissions || [];
    
    const canCreate = isSuperAdmin || isAdminLike || userPermissions.includes('create_products');
    const canEdit = isSuperAdmin || isAdminLike || userPermissions.includes('edit_products');

    // States
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
    const [selectedProductId, setSelectedProductId] = useState(null);
    
    // Form state
    const [formData, setFormData] = useState({
        code: '',
        description: '',
        barcode: '',
        barcode_secondary: '',
        brand: '',
        primary_unit: 'UN',
        secondary_unit: '',
        conversion_factor: '',
        conversion_type: 'multiplicar', // 'multiplicar' | 'dividir'
        counting_category: '',
        capacity: '',
        real_weight: '',
        provider_code: '',
        provider_description: '',
        cost_price: '',
        lista001: '',
        lista500: '',
        moneda: 'ARS'
    });

    // Handle search query changes with a simple debounce
    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setProducts([]);
            return;
        }

        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const res = await api.get(`/api/products/search?q=${encodeURIComponent(searchQuery)}`);
                setProducts(res.data || []);
            } catch (err) {
                console.error('Error searching products:', err);
                toast.error('Error al buscar productos');
            } finally {
                setLoading(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleOpenCreateModal = () => {
        if (!canCreate) {
            toast.error('No tienes permiso para crear productos');
            return;
        }
        setModalMode('create');
        setSelectedProductId(null);
        setFormData({
            code: '',
            description: '',
            barcode: '',
            barcode_secondary: '',
            brand: '',
            primary_unit: 'UN',
            secondary_unit: '',
            conversion_factor: '',
            conversion_type: 'multiplicar',
            counting_category: '',
            capacity: '',
            real_weight: '',
            provider_code: '',
            provider_description: '',
            cost_price: '',
            lista001: '',
            lista500: '',
            moneda: 'ARS'
        });
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (product) => {
        if (!canEdit) {
            toast.error('No tienes permiso para editar productos');
            return;
        }
        setModalMode('edit');
        setSelectedProductId(product.id);
        setFormData({
            code: product.code || '',
            description: product.description || '',
            barcode: product.barcode || '',
            barcode_secondary: product.barcode_secondary || '',
            brand: product.brand || '',
            primary_unit: product.primary_unit || 'UN',
            secondary_unit: product.secondary_unit || '',
            conversion_factor: product.conversion_factor !== null && product.conversion_factor !== undefined ? String(product.conversion_factor) : '',
            conversion_type: product.conversion_type || 'multiplicar',
            counting_category: product.counting_category || '',
            capacity: product.capacity || '',
            real_weight: product.real_weight || '',
            provider_code: product.provider_code || '',
            provider_description: product.provider_description || '',
            cost_price: product.cost_price !== null && product.cost_price !== undefined ? String(product.cost_price) : '',
            lista001: product.lista001 !== null && product.lista001 !== undefined ? String(product.lista001) : '',
            lista500: product.lista500 !== null && product.lista500 !== undefined ? String(product.lista500) : '',
            moneda: product.moneda || 'ARS'
        });
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.code.trim()) {
            toast.error('El código de producto es obligatorio');
            return;
        }
        if (!formData.description.trim()) {
            toast.error('La descripción es obligatoria');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                ...formData,
                code: formData.code.trim(),
                description: formData.description.trim(),
                barcode: formData.barcode.trim() || null,
                barcode_secondary: formData.barcode_secondary.trim() || null,
                brand: formData.brand.trim() || null,
                primary_unit: formData.primary_unit.trim() || null,
                secondary_unit: formData.secondary_unit.trim() || null,
                conversion_factor: formData.conversion_factor !== '' ? parseFloat(formData.conversion_factor) : null,
                conversion_type: formData.conversion_type || null,
                counting_category: formData.counting_category.trim() || null,
                capacity: formData.capacity.trim() || null,
                real_weight: formData.real_weight.trim() || null,
                provider_code: formData.provider_code.trim() || null,
                provider_description: formData.provider_description.trim() || null,
                cost_price: formData.cost_price !== '' ? parseFloat(formData.cost_price) : 0,
                lista001: formData.lista001 !== '' ? parseFloat(formData.lista001) : 0,
                lista500: formData.lista500 !== '' ? parseFloat(formData.lista500) : 0,
                moneda: formData.moneda || 'ARS'
            };

            if (modalMode === 'create') {
                const res = await api.post('/api/products', payload);
                toast.success('Producto creado con éxito');
                // Si el nuevo producto coincide con la búsqueda actual, actualizar lista
                if (searchQuery && res.data.code.toLowerCase().includes(searchQuery.toLowerCase())) {
                    setProducts(prev => [res.data, ...prev]);
                }
            } else {
                const res = await api.put(`/api/products/${selectedProductId}`, payload);
                toast.success('Producto actualizado con éxito');
                // Actualizar localmente en la lista de productos
                setProducts(prev => prev.map(p => p.id === selectedProductId ? res.data : p));
            }
            setIsModalOpen(false);
        } catch (err) {
            console.error('Error saving product:', err);
            const errMsg = err.response?.data?.message || 'Error al guardar el producto';
            toast.error(errMsg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <Package className="text-blue-600 w-8 h-8" /> Catálogo de Productos
                    </h1>
                    <p className="text-sm text-gray-500 font-medium">Buscá, creá o editá productos del sistema de control de mercadería</p>
                </div>
                {canCreate && (
                    <button
                        onClick={handleOpenCreateModal}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" /> Crear Producto
                    </button>
                )}
            </div>

            {/* Search Bar */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full text-xs p-3.5 pl-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-semibold"
                        placeholder="Buscar producto por código, barras, descripción, marca o proveedor (ingresa al menos 2 letras)..."
                    />
                    <Search className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                    {loading && (
                        <div className="absolute right-3.5 top-3.5 w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    )}
                </div>
            </div>

            {/* Results Section */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden">
                {products.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Código</th>
                                    <th className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Descripción / Marca</th>
                                    <th className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Códigos de Barras</th>
                                    <th className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Medida / Conv.</th>
                                    <th className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Físicas / Categoría</th>
                                    {canEdit && (
                                        <th className="px-6 py-3.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest w-20">Acciones</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {products.map((product) => (
                                    <tr key={product.id} className="hover:bg-blue-50/20 transition-all font-semibold">
                                        <td className="px-6 py-4 text-xs font-mono text-gray-800">{product.code}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs text-gray-900 truncate max-w-xs">{product.description}</div>
                                            <div className="text-[10px] text-gray-400 font-bold uppercase">{product.brand || 'Sin Marca'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-[11px] font-mono text-gray-600">
                                            {product.barcode && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">P</span>
                                                    <span>{product.barcode}</span>
                                                </div>
                                            )}
                                            {product.barcode_secondary && (
                                                <div className="flex items-center gap-1.5 mt-1 text-gray-400">
                                                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-bold">S</span>
                                                    <span>{product.barcode_secondary}</span>
                                                </div>
                                            )}
                                            {!product.barcode && !product.barcode_secondary && (
                                                <span className="text-gray-300 italic">Sin barras</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-gray-600">
                                            <div className="flex items-center gap-1">
                                                <span>U.P:</span>
                                                <span className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-[10px] font-bold uppercase">{product.primary_unit || 'UN'}</span>
                                            </div>
                                            {product.secondary_unit && (
                                                <div className="mt-1 text-[11px] text-gray-500">
                                                    U.S: <span className="bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-[10px] font-bold uppercase mr-1">{product.secondary_unit}</span>
                                                    ({product.conversion_type === 'multiplicar' ? 'x' : '/'} {product.conversion_factor})
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-gray-600">
                                            <div className="text-[10px] text-indigo-700 font-bold uppercase">{product.counting_category || 'General'}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                {product.capacity && `Cap: ${product.capacity}`}
                                                {product.capacity && product.real_weight && ' | '}
                                                {product.real_weight && `Peso: ${product.real_weight}`}
                                            </div>
                                        </td>
                                        {canEdit && (
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-xs">
                                                <button
                                                    onClick={() => handleOpenEditModal(product)}
                                                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100/50 rounded-lg transition-all"
                                                    title="Editar producto"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
                        {searchQuery.trim().length >= 2 ? (
                            <>
                                <AlertCircle className="w-12 h-12 text-gray-300 mb-3" />
                                <p className="font-semibold text-gray-800">No se encontraron productos</p>
                                <p className="text-xs text-gray-400 mt-1">Intentá buscar con otros términos o crea un nuevo producto.</p>
                            </>
                        ) : (
                            <>
                                <Search className="w-12 h-12 text-gray-300 mb-3" />
                                <p className="font-semibold text-gray-700">Comenzá a buscar</p>
                                <p className="text-xs text-gray-400 mt-1">Escribí en el buscador superior para encontrar y editar productos.</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[2000] overflow-y-auto flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4 flex items-center justify-between">
                            <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                                <Package className="w-5 h-5" /> 
                                {modalMode === 'create' ? 'Crear Nuevo Producto' : `Editar Producto: ${formData.code}`}
                            </h2>
                            <button onClick={handleCloseModal} className="text-blue-100 hover:text-white transition-all cursor-pointer">
                                <X className="w-5.5 h-5.5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            
                            {/* Seccion 1: Identificacion Basica */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <Info className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Identificación Básica</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Código Interno *</label>
                                        <input
                                            type="text"
                                            name="code"
                                            value={formData.code}
                                            onChange={handleInputChange}
                                            disabled={modalMode === 'edit'}
                                            className={`w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none font-semibold ${modalMode === 'edit' ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-100' : 'bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`}
                                            placeholder="Ej: 001234"
                                            required
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Descripción / Nombre *</label>
                                        <input
                                            type="text"
                                            name="description"
                                            value={formData.description}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                            placeholder="Ej: LÁTEX EXTERIOR MATE ALBALATEX 4 LTS"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Marca / Grupo</label>
                                        <input
                                            type="text"
                                            name="brand"
                                            value={formData.brand}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                            placeholder="Ej: ALBA TINTING"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Código Barra Principal</label>
                                        <input
                                            type="text"
                                            name="barcode"
                                            value={formData.barcode}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                            placeholder="Ej: 7790012345678"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Código Barra Secundario</label>
                                        <input
                                            type="text"
                                            name="barcode_secondary"
                                            value={formData.barcode_secondary}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                            placeholder="Ej: 7790012345685"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Seccion 2: Unidades y Conversión */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <Layers className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Unidades de Medida y Conversión</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Unidad Principal</label>
                                        <input
                                            type="text"
                                            name="primary_unit"
                                            value={formData.primary_unit}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold uppercase text-center"
                                            placeholder="Ej: UN"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Unidad Secundaria</label>
                                        <input
                                            type="text"
                                            name="secondary_unit"
                                            value={formData.secondary_unit}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold uppercase text-center"
                                            placeholder="Ej: M2 o KG"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Factor Conversión</label>
                                        <input
                                            type="number"
                                            step="any"
                                            name="conversion_factor"
                                            value={formData.conversion_factor}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-center"
                                            placeholder="Ej: 1.5"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Tipo Conversión</label>
                                        <select
                                            name="conversion_type"
                                            value={formData.conversion_type}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold cursor-pointer"
                                        >
                                            <option value="multiplicar">Multiplicar</option>
                                            <option value="dividir">Dividir</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Seccion 3: Caracteristicas Fisicas y Clasificacion */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <Scale className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Características Físicas y Clasificación</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Categoría de Conteo</label>
                                        <select
                                            name="counting_category"
                                            value={formData.counting_category}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold cursor-pointer"
                                        >
                                            <option value="">General</option>
                                            <option value="Hogar y Obra">Hogar y Obra</option>
                                            <option value="Automotor">Automotor</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Capacidad</label>
                                        <input
                                            type="text"
                                            name="capacity"
                                            value={formData.capacity}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                            placeholder="Ej: 4 Litros o 1 Kg"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Peso Real</label>
                                        <input
                                            type="text"
                                            name="real_weight"
                                            value={formData.real_weight}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                            placeholder="Ej: 5.2 (en kg)"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Seccion 4: Informacion del Proveedor */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <BarChart className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Información del Proveedor</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Código de Proveedor</label>
                                        <input
                                            type="text"
                                            name="provider_code"
                                            value={formData.provider_code}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                            placeholder="Ej: PROV-987"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Descripción de Proveedor</label>
                                        <input
                                            type="text"
                                            name="provider_description"
                                            value={formData.provider_description}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                            placeholder="Ej: LATEX ACRILICO PREMIUM BLANCO 4L (PROVEEDOR)"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Seccion 5: Precios y Costos */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <DollarSign className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Precios y Costos</h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Moneda</label>
                                        <select
                                            name="moneda"
                                            value={formData.moneda}
                                            onChange={handleInputChange}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold cursor-pointer"
                                        >
                                            <option value="ARS">ARS (Pesos)</option>
                                            <option value="USD">USD (Dólares)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Precio de Costo</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-semibold">
                                                {formData.moneda === 'USD' ? 'u$s' : '$'}
                                            </span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                name="cost_price"
                                                value={formData.cost_price}
                                                onChange={handleInputChange}
                                                className="w-full text-xs p-2.5 pl-8 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Lista 001</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-semibold">
                                                {formData.moneda === 'USD' ? 'u$s' : '$'}
                                            </span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                name="lista001"
                                                value={formData.lista001}
                                                onChange={handleInputChange}
                                                className="w-full text-xs p-2.5 pl-8 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Lista 500</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-semibold">
                                                {formData.moneda === 'USD' ? 'u$s' : '$'}
                                            </span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                name="lista500"
                                                value={formData.lista500}
                                                onChange={handleInputChange}
                                                className="w-full text-xs p-2.5 pl-8 border border-gray-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                                >
                                    {saving ? (
                                        <>
                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {modalMode === 'create' ? 'Crear Producto' : 'Guardar Cambios'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductsPage;
