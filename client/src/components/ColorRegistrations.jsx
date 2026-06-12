import React, { useState, useEffect, useRef } from 'react';
import { 
    Palette, 
    Trash2, 
    Search, 
    Check, 
    AlertCircle, 
    Sparkles, 
    User, 
    ShoppingBag, 
    BookOpen, 
    PlusCircle,
    Info,
    Calendar,
    ChevronDown,
    X
} from 'lucide-react';
import { colorRegistrationsService } from '../utils/colorRegistrationsService';
import { tintometricoService } from '../utils/tintometricoService';
import { toast } from 'sonner';

const ColorRegistrations = () => {
    // --- Form States ---
    const [colorType, setColorType] = useState('tintometrico'); // 'tintometrico' | 'manual'
    const [colorName, setColorName] = useState('');
    const [colorCode, setColorCode] = useState('');
    const [hex, setHex] = useState('#3b82f6');
    const [clientName, setClientName] = useState('');
    const [observations, setObservations] = useState('');

    // Product search autocomplete states
    const [productSearch, setProductSearch] = useState('');
    const [productsList, setProductsList] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const [searchingProducts, setSearchingProducts] = useState(false);

    // Tintometric color search autocomplete states
    const [tintometricSearch, setTintometricSearch] = useState('');
    const [tintometricColorsList, setTintometricColorsList] = useState([]);
    const [selectedTintometricColor, setSelectedTintometricColor] = useState(null);
    const [showTintometricDropdown, setShowTintometricDropdown] = useState(false);
    const [searchingTintometric, setSearchingTintometric] = useState(false);

    // App User select states
    const [userId, setUserId] = useState('');
    const [usersList, setUsersList] = useState([]);

    // --- List States ---
    const [registrations, setRegistrations] = useState([]);
    const [registrationsSearch, setRegistrationsSearch] = useState('');
    const [loadingRegistrations, setLoadingRegistrations] = useState(true);
    const [saving, setSaving] = useState(false);

    // Refs for clicking outside dropdowns
    const productDropdownRef = useRef(null);
    const tintometricDropdownRef = useRef(null);

    // Load registrations and users list on mount
    useEffect(() => {
        fetchRegistrations();
        fetchUsers();
        
        // Handle clicks outside dropdowns
        const handleClickOutside = (event) => {
            if (productDropdownRef.current && !productDropdownRef.current.contains(event.target)) {
                setShowProductDropdown(false);
            }
            if (tintometricDropdownRef.current && !tintometricDropdownRef.current.contains(event.target)) {
                setShowTintometricDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounce/Timeout search for products
    useEffect(() => {
        if (!productSearch || productSearch.length < 2) {
            setProductsList([]);
            return;
        }

        // If selectedProduct matches current search, skip search
        if (selectedProduct && `${selectedProduct.code} - ${selectedProduct.description}` === productSearch) {
            return;
        }

        setSearchingProducts(true);
        const timer = setTimeout(async () => {
            try {
                const results = await colorRegistrationsService.searchProducts(productSearch);
                setProductsList(results || []);
                setShowProductDropdown(true);
            } catch (err) {
                console.error('Error searching products:', err);
            } finally {
                setSearchingProducts(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [productSearch]);

    // Debounce/Timeout search for tintometric colors
    useEffect(() => {
        if (!tintometricSearch || tintometricSearch.length < 2) {
            setTintometricColorsList([]);
            return;
        }

        // If selectedTintometricColor matches search query, skip search
        if (selectedTintometricColor && `${selectedTintometricColor.nombre} (${selectedTintometricColor.codigo})` === tintometricSearch) {
            return;
        }

        setSearchingTintometric(true);
        const timer = setTimeout(async () => {
            try {
                // Call tintometricService.fetchColores(page, search, brand, collection, sortBy, limit)
                const data = await tintometricoService.fetchColores(0, tintometricSearch, 'all', 'all', 'name', 15);
                setTintometricColorsList(data?.colores || []);
                setShowTintometricDropdown(true);
            } catch (err) {
                console.error('Error searching tintometric colors:', err);
            } finally {
                setSearchingTintometric(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [tintometricSearch]);

    const fetchRegistrations = async () => {
        setLoadingRegistrations(true);
        try {
            const data = await colorRegistrationsService.getAll();
            setRegistrations(data || []);
        } catch (err) {
            console.error('Error fetching registrations:', err);
            toast.error('No se pudieron cargar los registros de colores.');
        } finally {
            setLoadingRegistrations(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const data = await colorRegistrationsService.getUsersSelector();
            setUsersList(data || []);
        } catch (err) {
            console.error('Error fetching users:', err);
            toast.error('No se pudieron cargar los usuarios de la aplicación.');
        }
    };

    const handleSelectTintometricColor = (color) => {
        setSelectedTintometricColor(color);
        setColorName(color.nombre);
        setColorCode(color.codigo);
        setHex(color.hex || '#3b82f6');
        setTintometricSearch(`${color.nombre} (${color.codigo})`);
        setShowTintometricDropdown(false);
        toast.info(`Color seleccionado: ${color.nombre}`);
    };

    const handleSelectProduct = (product) => {
        setSelectedProduct(product);
        setProductSearch(`${product.code} - ${product.description}`);
        setShowProductDropdown(false);
        toast.info(`Producto seleccionado: ${product.description}`);
    };

    const handleClearProduct = () => {
        setSelectedProduct(null);
        setProductSearch('');
        setProductsList([]);
    };

    const handleClearTintometricColor = () => {
        setSelectedTintometricColor(null);
        setTintometricSearch('');
        setTintometricColorsList([]);
        setColorName('');
        setColorCode('');
        setHex('#3b82f6');
    };

    // Calculate identification ID live preview
    const getIdentificationId = () => {
        if (!colorName.trim() && !clientName.trim()) return '';
        const namePart = colorName.trim() || 'Nombre Color';
        const clientPart = clientName.trim() || 'Cliente';
        return `${namePart} - ${clientPart}`;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!colorName.trim()) {
            toast.error('Por favor, introduce o busca un nombre de color.');
            return;
        }
        if (!clientName.trim()) {
            toast.error('Por favor, ingresa el nombre del cliente.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                color_type: colorType,
                color_name: colorName.trim(),
                client_name: clientName.trim(),
                product_id: selectedProduct?.id || null,
                user_id: userId || null,
                color_code: colorType === 'tintometrico' ? colorCode : null,
                hex: hex,
                observations: observations.trim() || null
            };

            await colorRegistrationsService.create(payload);
            toast.success('¡Color registrado con éxito!');
            
            // Reset fields
            setColorName('');
            setColorCode('');
            setHex('#3b82f6');
            setClientName('');
            setObservations('');
            setSelectedProduct(null);
            setProductSearch('');
            setSelectedTintometricColor(null);
            setTintometricSearch('');
            setUserId('');

            // Refresh list
            fetchRegistrations();
        } catch (err) {
            console.error('Error saving color registration:', err);
            const msg = err.response?.data?.message || 'Error al registrar el color.';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRegistration = async (id, idStr) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar el registro del color "${idStr}"?`)) {
            return;
        }

        try {
            await colorRegistrationsService.delete(id);
            toast.success('Registro de color eliminado.');
            fetchRegistrations();
        } catch (err) {
            console.error('Error deleting registration:', err);
            toast.error('Error al eliminar el registro.');
        }
    };

    // Filter registrations by search text
    const filteredRegistrations = registrations.filter(r => {
        if (!registrationsSearch.trim()) return true;
        const q = registrationsSearch.toLowerCase();
        
        const idMatch = r.identification_id?.toLowerCase().includes(q);
        const nameMatch = r.color_name?.toLowerCase().includes(q);
        const clientMatch = r.client_name?.toLowerCase().includes(q);
        const codeMatch = r.color_code?.toLowerCase().includes(q);
        const prodMatch = r.products?.description?.toLowerCase().includes(q) || r.products?.code?.toLowerCase().includes(q);
        const userMatch = r.target_user?.username?.toLowerCase().includes(q);
        const creatorMatch = r.creator_user?.username?.toLowerCase().includes(q);

        return idMatch || nameMatch || clientMatch || codeMatch || prodMatch || userMatch || creatorMatch;
    });

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <Palette className="text-brand-blue w-8 h-8" /> Registro de Colores
                    </h1>
                    <p className="text-sm text-gray-500 font-medium">Asociá y registrá colores preparados con productos, clientes y usuarios</p>
                </div>
            </div>

            {/* Split Screen Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* --- Left Column: Registration Form (5 cols) --- */}
                <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4 flex items-center gap-2.5">
                        <PlusCircle className="text-white w-5.5 h-5.5" />
                        <h2 className="text-base font-bold text-white tracking-wide">Registrar Nuevo Color</h2>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        
                        {/* Selector de Tipo de Color */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Tipo de Preparación</label>
                            <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setColorType('tintometrico');
                                        handleClearProduct();
                                        handleClearTintometricColor();
                                    }}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer text-center ${
                                        colorType === 'tintometrico'
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                                    }`}
                                >
                                    Tintométrico
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setColorType('manual');
                                        handleClearProduct();
                                        handleClearTintometricColor();
                                    }}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer text-center ${
                                        colorType === 'manual'
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                                    }`}
                                >
                                    Preparado Manual
                                </button>
                            </div>
                        </div>

                        {/* Campos Dinámicos según Tipo */}
                        {colorType === 'tintometrico' ? (
                            <div className="space-y-3" ref={tintometricDropdownRef}>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Buscar Color en Catálogo</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={tintometricSearch}
                                            onChange={(e) => setTintometricSearch(e.target.value)}
                                            onFocus={() => {
                                                if (tintometricColorsList.length > 0) setShowTintometricDropdown(true);
                                            }}
                                            className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-semibold"
                                            placeholder="Buscar color por nombre o código (ej: CP4)..."
                                        />
                                        <Search className="absolute left-3 top-3.5 w-4.5 h-4.5 text-gray-400" />
                                        {searchingTintometric && (
                                            <div className="absolute right-3 top-3 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        )}
                                        {selectedTintometricColor && !searchingTintometric && (
                                            <button
                                                type="button"
                                                onClick={handleClearTintometricColor}
                                                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Tintometric Colors Autocomplete Dropdown */}
                                    {showTintometricDropdown && tintometricColorsList.length > 0 && (
                                        <div className="relative">
                                            <ul className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl p-1 divide-y divide-gray-50">
                                                {tintometricColorsList.map((color) => (
                                                    <li
                                                        key={color.id}
                                                        onClick={() => handleSelectTintometricColor(color)}
                                                        className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-900 rounded-lg cursor-pointer transition-colors"
                                                    >
                                                        <div 
                                                            className="w-5 h-5 rounded-full border border-gray-200 shadow-sm shrink-0" 
                                                            style={{ backgroundColor: color.hex }}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="truncate font-bold">{color.nombre}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">{color.codigo} | {color.coleccion}</div>
                                                        </div>
                                                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                                                            {color.id >= 5000000 ? 'Tersuave' : color.id >= 4000000 ? 'Plavicon' : 'Alba'}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {/* Active Selection Preview */}
                                {selectedTintometricColor && (
                                    <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center gap-3 animate-pop">
                                        <div 
                                            className="w-10 h-10 rounded-lg border border-black/10 shadow-md shrink-0 transition-transform hover:scale-105" 
                                            style={{ backgroundColor: hex }}
                                        />
                                        <div className="flex-grow min-w-0">
                                            <div className="text-xs font-black text-blue-950 truncate leading-tight">{colorName}</div>
                                            <div className="text-[10px] font-bold text-blue-600/70 font-mono tracking-wider">Código: {colorCode}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in duration-300">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Nombre del Color</label>
                                    <input
                                        type="text"
                                        value={colorName}
                                        onChange={(e) => setColorName(e.target.value)}
                                        className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-bold text-gray-800"
                                        placeholder="Ej: Rojo Teja, Amarillo Especial..."
                                        required
                                    />
                                </div>

                                {/* Color Picker para manual */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Personalizar Visualización Color</label>
                                    <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                                        <input
                                            type="color"
                                            value={hex}
                                            onChange={(e) => setHex(e.target.value)}
                                            className="w-10 h-10 border-0 rounded-lg cursor-pointer bg-transparent shadow-md shrink-0"
                                        />
                                        <div>
                                            <div className="text-xs font-bold text-gray-800">Seleccionar color representativo</div>
                                            <div className="text-[10px] text-gray-400 font-mono uppercase font-bold">{hex}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Searchable Product Selector */}
                        <div className="space-y-1.5" ref={productDropdownRef}>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">¿En qué producto se preparó?</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    onFocus={() => {
                                        if (productsList.length > 0) setShowProductDropdown(true);
                                    }}
                                    className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-semibold"
                                    placeholder="Buscar producto por descripción o código..."
                                />
                                <ShoppingBag className="absolute left-3 top-3.5 w-4.5 h-4.5 text-gray-400" />
                                {searchingProducts && (
                                    <div className="absolute right-3 top-3 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                )}
                                {selectedProduct && !searchingProducts && (
                                    <button
                                        type="button"
                                        onClick={handleClearProduct}
                                        className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Product Autocomplete Dropdown */}
                            {showProductDropdown && productsList.length > 0 && (
                                <div className="relative">
                                    <ul className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl p-1 divide-y divide-gray-50">
                                        {productsList.map((product) => (
                                            <li
                                                key={product.id}
                                                onClick={() => handleSelectProduct(product)}
                                                className="flex flex-col px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-900 rounded-lg cursor-pointer transition-colors"
                                            >
                                                <div className="font-bold truncate">{product.description}</div>
                                                <div className="flex justify-between items-center text-[10px] text-gray-400 mt-0.5">
                                                    <span className="font-mono">Código: {product.code}</span>
                                                    {product.brand && (
                                                        <span className="bg-gray-100 text-gray-600 px-1 py-0.5 rounded text-[8px] font-extrabold uppercase">
                                                            {product.brand}
                                                        </span>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Selected Product Preview Card */}
                            {selectedProduct && (
                                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col gap-1.5 animate-pop">
                                    <div className="text-xs font-bold text-gray-800 truncate leading-tight">{selectedProduct.description}</div>
                                    <div className="flex justify-between items-center text-[10px] text-gray-500">
                                        <span className="font-mono">Código: {selectedProduct.code}</span>
                                        {selectedProduct.brand && (
                                            <span className="bg-blue-100 text-blue-700 font-extrabold px-1.5 py-0.5 rounded text-[8px] uppercase">
                                                {selectedProduct.brand}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Client Input */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Cliente</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-bold text-gray-800"
                                    placeholder="Nombre del cliente..."
                                    required
                                />
                                <User className="absolute left-3 top-3.5 w-4.5 h-4.5 text-gray-400" />
                            </div>
                        </div>

                        {/* App User Selection */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">¿Para qué usuario de la app pertenece?</label>
                            <div className="relative">
                                <select
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-bold text-gray-700 cursor-pointer appearance-none"
                                >
                                    <option value="">-- Seleccionar Usuario --</option>
                                    {usersList.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.username} ({user.role}) {user.sucursal_name ? `- ${user.sucursal_name}` : ''}
                                        </option>
                                    ))}
                                </select>
                                <BookOpen className="absolute left-3 top-3.5 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                                <ChevronDown className="absolute right-3 top-3.5 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                            </div>
                        </div>

                        {/* Observations */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Observaciones</label>
                            <textarea
                                value={observations}
                                onChange={(e) => setObservations(e.target.value)}
                                rows="2"
                                className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-semibold"
                                placeholder="Notas u observaciones adicionales..."
                            />
                        </div>

                        {/* ID de Identificación Live Preview */}
                        {(colorName.trim() || clientName.trim()) && (
                            <div className="p-3.5 bg-indigo-50 border border-indigo-150 rounded-xl space-y-1 animate-pop">
                                <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Identificador Generado (ID)</div>
                                <div className="text-xs font-black text-indigo-900 font-mono break-all">
                                    {getIdentificationId()}
                                </div>
                            </div>
                        )}

                        {/* Action Button */}
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full group relative overflow-hidden bg-brand-blue hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                        >
                            <Sparkles className="w-4.5 h-4.5 group-hover:animate-pulse" />
                            <span>{saving ? 'Registrando...' : 'Registrar Color'}</span>
                        </button>

                    </form>
                </div>

                {/* --- Right Column: Colors Registrations List (7 cols) --- */}
                <div className="lg:col-span-7 flex flex-col space-y-4">
                    
                    {/* Search & Statistics Bar */}
                    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full md:max-w-xs group">
                            <input
                                type="text"
                                value={registrationsSearch}
                                onChange={(e) => setRegistrationsSearch(e.target.value)}
                                className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-semibold"
                                placeholder="Buscar en los registrados..."
                            />
                            <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400 group-focus-within:text-brand-blue" />
                        </div>

                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider shrink-0 flex items-center gap-2">
                            <span>Total Registrados:</span>
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-black">
                                {filteredRegistrations.length}
                            </span>
                        </div>
                    </div>

                    {/* Colors Grid / List */}
                    {loadingRegistrations ? (
                        <div className="bg-white rounded-2xl border border-gray-200 p-20 flex flex-col items-center justify-center shadow-sm">
                            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-blue mb-3"></div>
                            <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Cargando colores registrados...</span>
                        </div>
                    ) : filteredRegistrations.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-200 p-20 flex flex-col items-center justify-center text-center space-y-3 shadow-sm text-gray-400 italic">
                            <Palette className="text-gray-300 w-16 h-16 animate-pulse" />
                            <p className="text-sm font-semibold">No se encontraron registros de colores.</p>
                            <p className="text-xs text-gray-400">Completá el formulario para registrar el primer color.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredRegistrations.map((item) => (
                                <div
                                    key={item.id}
                                    className="group bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between"
                                >
                                    {/* Color Visual Block */}
                                    <div 
                                        className="h-24 w-full relative border-b border-gray-100 flex items-end p-3"
                                        style={{ backgroundColor: item.hex || '#64748b' }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                                        
                                        {/* Color Badge */}
                                        <span className={`absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-white shadow-sm border ${
                                            item.color_type === 'tintometrico'
                                                ? 'bg-violet-700/90 border-violet-600/30'
                                                : 'bg-amber-600/90 border-amber-500/30'
                                        }`}>
                                            {item.color_type === 'tintometrico' ? 'Tintométrico' : 'Manual'}
                                        </span>

                                        <div className="relative text-white min-w-0">
                                            <h3 className="text-xs font-black truncate leading-tight tracking-wide drop-shadow" title={item.identification_id}>
                                                {item.identification_id}
                                            </h3>
                                            <span className="text-[8.5px] font-bold opacity-80 uppercase tracking-widest font-mono drop-shadow">
                                                {item.color_code ? `Código: ${item.color_code}` : 'Preparado Manual'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Registration Details */}
                                    <div className="p-4 flex-grow flex flex-col justify-between space-y-4">
                                        <div className="space-y-2.5 text-xs text-gray-700">
                                            
                                            {/* Product */}
                                            {item.products ? (
                                                <div className="flex gap-2 items-start">
                                                    <ShoppingBag className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-gray-900 leading-tight truncate">
                                                            {item.products.description}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                            Código: {item.products.code} {item.products.brand ? `(${item.products.brand})` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2 items-center text-gray-400 italic">
                                                    <ShoppingBag className="w-4 h-4 shrink-0" />
                                                    <span>Sin producto especificado</span>
                                                </div>
                                            )}

                                            {/* Client */}
                                            <div className="flex gap-2 items-center">
                                                <User className="w-4 h-4 text-gray-400 shrink-0" />
                                                <div className="truncate">
                                                    <span className="font-semibold text-gray-500">Cliente:</span>{' '}
                                                    <span className="font-bold text-gray-900">{item.client_name}</span>
                                                </div>
                                            </div>

                                            {/* Target User */}
                                            {item.target_user ? (
                                                <div className="flex gap-2 items-center">
                                                    <BookOpen className="w-4 h-4 text-gray-400 shrink-0" />
                                                    <div className="truncate">
                                                        <span className="font-semibold text-gray-500">Asignado a:</span>{' '}
                                                        <span className="font-bold text-gray-800">{item.target_user.username}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2 items-center text-gray-400 italic">
                                                    <BookOpen className="w-4 h-4 shrink-0" />
                                                    <span>Sin usuario asignado</span>
                                                </div>
                                            )}

                                            {/* Observations */}
                                            {item.observations && (
                                                <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-[11px] font-semibold text-gray-600 leading-relaxed max-h-16 overflow-y-auto">
                                                    <span className="font-bold text-gray-500 block mb-0.5 text-[9px] uppercase tracking-wider">Notas:</span>
                                                    {item.observations}
                                                </div>
                                            )}
                                        </div>

                                        {/* Card Footer: Metadata & Delete */}
                                        <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-[10px] text-gray-400">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-300" />
                                                    <span className="truncate">
                                                        Por {item.creator_user?.username || 'Sistema'} el {new Date(item.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleDeleteRegistration(item.id, item.identification_id)}
                                                className="p-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm cursor-pointer"
                                                title="Eliminar registro"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default ColorRegistrations;
