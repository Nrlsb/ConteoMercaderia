import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, 
    Search, 
    Palette, 
    Paintbrush, 
    X, 
    ChevronRight, 
    Calculator,
    Eye,
    EyeOff,
    FileText,
    Check,
    Building
} from 'lucide-react';
import { tintometricoService } from '../utils/tintometricoService';
import { colorRegistrationsService } from '../utils/colorRegistrationsService';
import { generateColorPDF } from '../utils/pdfGenerator';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 60;

const Tintometrico = () => {
    const navigate = useNavigate();

    // --- Estados de la Aplicación ---
    const [colors, setColors] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [collections, setCollections] = useState([]);
    const [activeCollection, setActiveCollection] = useState('all');
    const [activeBrand, setActiveBrand] = useState('all'); // 'all' | 'alba' | 'plavicon' | 'tersuave'
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('id');
    const [page, setPage] = useState(0);

    // Estados de carga
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Estado del color visualizado (pared del living)
    const [activeColor, setActiveColor] = useState(null);

    // Control de sidebar móvil
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Estados del modal de dosificación
    const [modalOpen, setModalOpen] = useState(false);
    const [modalColor, setModalColor] = useState(null);
    const [recipes, setRecipes] = useState([]);
    const [capacities, setCapacities] = useState([]);
    const [selectedProductId, setSelectedProductId] = useState(null);
    const [selectedCanSize, setSelectedCanSize] = useState(1);
    const [modalDuplicates, setModalDuplicates] = useState([]);
    const [loadingDuplicates, setLoadingDuplicates] = useState(false);
    const [showFormula, setShowFormula] = useState(true);
    const [observation, setObservation] = useState('');

    // Estados de equivalencia
    const [equivalentColors, setEquivalentColors] = useState([]);
    const [loadingEquivalents, setLoadingEquivalents] = useState(false);
    const [brandPermissions, setBrandPermissions] = useState({
        allowAlba: true,
        allowPlavicon: true,
        allowTersuave: true,
        allowFormula: true
    });

    // --- Estados para el Historial ---
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [clientName, setClientName] = useState('');
    const [obra, setObra] = useState('');
    const [registering, setRegistering] = useState(false);

    // Refs para el scroll infinito (Intersection Observer)
    const observerRef = useRef(null);
    const loadMoreRef = useRef(null);


    // --- 1. Cargar permisos de marcas y colecciones al iniciar ---
    useEffect(() => {
        const initializeTintometria = async () => {
            try {
                // Obtener permisos de marcas del usuario actual
                const perms = await tintometricoService.fetchPermissions();
                const allows = {
                    allowAlba: perms.allow_alba !== false,
                    allowPlavicon: perms.allow_plavicon !== false,
                    allowTersuave: perms.allow_tersuave !== false,
                    allowFormula: perms.allow_formula !== false
                };
                setBrandPermissions(allows);
                if (perms.allow_formula === false) {
                    setShowFormula(false);
                }

                const activeCount = [allows.allowAlba, allows.allowPlavicon, allows.allowTersuave].filter(Boolean).length;
                if (activeCount === 1) {
                    if (allows.allowAlba) setActiveBrand('alba');
                    else if (allows.allowPlavicon) setActiveBrand('plavicon');
                    else if (allows.allowTersuave) setActiveBrand('tersuave');
                }

                // Cargar colecciones filtradas
                const response = await tintometricoService.fetchColecciones();
                setCollections(response || []);
            } catch (err) {
                console.error('Error al inicializar datos de tintometría:', err);
                toast.error('No se pudieron cargar los permisos o colecciones de catálogos.');
            }
        };
        initializeTintometria();
        fetchHistory();
    }, []);

    // --- 1.2. Funciones para Historial y Registro ---
    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const data = await colorRegistrationsService.getAll();
            setHistory(data || []);
        } catch (err) {
            console.error('Error al cargar historial:', err);
        } finally {
            setLoadingHistory(false);
        }
    };

    const findProductInDB = async (productId, system) => {
        try {
            let codeToSearch = String(productId);
            if (system?.toLowerCase() === 'alba') {
                codeToSearch = codeToSearch.padStart(6, '0');
            }
            const result = await colorRegistrationsService.searchProducts(codeToSearch);
            const exactMatch = result?.find(p => p.code?.trim() === codeToSearch.trim());
            return exactMatch ? exactMatch.id : (result && result.length > 0 ? result[0].id : null);
        } catch (err) {
            console.error('Error al buscar producto en DB:', err);
            return null;
        }
    };

    const getComputedFormula = () => {
        if (!activeRecipe) return null;

        const activeSizeObj = activeSizes.find(sz => {
            const rawCap = sz.capacidad_real !== undefined && sz.capacidad_real !== null ? sz.capacidad_real : sz.capacidad_litros;
            const cap = rawCap >= 100 ? rawCap / 1000 : rawCap;
            return cap === selectedCanSize;
        });
        const nominalSize = activeSizeObj ? activeSizeObj.capacidad_litros : (selectedCanSize || 1);

        const pigments = activeRecipe.pigments.map(pig => {
            const nominalVol = pig.cantidad * nominalSize;
            return {
                codigo: pig.code,
                nombre: pig.name,
                hex: pig.hex,
                cantidad: Number(nominalVol.toFixed(4)),
                unidad: activeRecipe.sistemaTintometrico?.toLowerCase() === 'tersuave' ? 'impulsos' : 'unidades'
            };
        });

        return {
            base: activeRecipe.base,
            sistema: activeRecipe.sistemaTintometrico,
            productName: activeRecipe.productName,
            pigmentos: pigments
        };
    };

    const handleRegisterPreparation = async () => {
        if (!clientName.trim()) {
            toast.error('Por favor, introduce el nombre del cliente.');
            return;
        }
        if (!activeRecipe) {
            toast.error('No hay una receta activa para registrar.');
            return;
        }

        setRegistering(true);
        try {
            const calculatedFormula = getComputedFormula();
            const realProductId = await findProductInDB(activeRecipe.productId, activeRecipe.sistemaTintometrico);
            
            const payload = {
                color_type: 'tintometrico',
                color_name: modalColor.nombre,
                client_name: clientName.trim(),
                product_id: realProductId,
                user_id: null,
                color_code: modalColor.codigo,
                hex: modalColor.hex,
                observations: observation.trim() || null,
                capacity_real: selectedCanSize,
                base: activeRecipe.base,
                formula: calculatedFormula,
                obra: obra.trim() || null
            };

            await colorRegistrationsService.create(payload);
            toast.success('¡Preparación registrada con éxito!');
            setClientName('');
            setObra('');
            fetchHistory();
        } catch (err) {
            console.error('Error al registrar preparación:', err);
            const msg = err.response?.data?.message || 'Error al registrar la preparación.';
            toast.error(msg);
        } finally {
            setRegistering(false);
        }
    };

    const handleReopenFromHistory = async (item) => {
        if (!item.color_code) return;
        try {
            const brand = item.formula?.sistema?.toLowerCase() || 'all';
            const response = await tintometricoService.fetchColores(
                0,
                item.color_code,
                brand,
                'all',
                'id',
                10
            );
            const { colores } = response || { colores: [] };
            const exactColor = colores?.find(c => c.codigo.trim().toLowerCase() === item.color_code.trim().toLowerCase());
            
            if (exactColor) {
                handleOpenModal(exactColor);
                if (item.capacity_real) {
                    setSelectedCanSize(item.capacity_real);
                }
                if (item.observations) {
                    setObservation(item.observations);
                }
            } else {
                toast.error('No se encontró el color en el catálogo actual.');
            }
        } catch (err) {
            console.error('Error al volver a abrir el color:', err);
            toast.error('Error al buscar el color en el catálogo.');
        }
    };

    // --- 2. Cargar colores con filtros y paginación ---
    const fetchColors = useCallback(async (pageIndex, isNewSearch = false) => {
        if (isNewSearch) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const response = await tintometricoService.fetchColores(
                pageIndex,
                searchQuery,
                activeBrand,
                activeCollection,
                sortBy,
                ITEMS_PER_PAGE
            );

            const { colores, totalCount: total } = response || { colores: [], totalCount: 0 };

            if (isNewSearch) {
                setColors(colores);
                if (colores.length > 0 && !activeColor) {
                    setActiveColor(colores[0]);
                }
            } else {
                setColors((prev) => [...prev, ...colores]);
            }
            setTotalCount(total || 0);
        } catch (err) {
            console.error('Error al cargar colores:', err);
            toast.error('Error al consultar el catálogo de colores.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [searchQuery, activeCollection, sortBy, activeBrand, activeColor]);

    // Ejecutar carga cuando cambian los filtros
    useEffect(() => {
        setPage(0);
        fetchColors(0, true);
    }, [searchQuery, activeCollection, sortBy, activeBrand]);

    // --- 3. Scroll Infinito (Intersection Observer nativo) ---
    const handleObserver = useCallback((entries) => {
        const target = entries[0];
        if (target.isIntersecting && !loading && !loadingMore && colors.length < totalCount) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchColors(nextPage, false);
        }
    }, [loading, loadingMore, colors.length, totalCount, page, fetchColors]);

    useEffect(() => {
        const option = {
            root: null,
            rootMargin: '150px',
            threshold: 0.1,
        };
        if (observerRef.current) observerRef.current.disconnect();
        observerRef.current = new IntersectionObserver(handleObserver, option);
        if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);

        return () => {
            if (observerRef.current) observerRef.current.disconnect();
        };
    }, [handleObserver]);

    // --- Helper para agrupar colores duplicados ---
    const getGroupedColors = (colorsList) => {
        const grouped = {};
        colorsList.forEach(color => {
            const brand = color.id >= 5000000 ? 'tersuave' : color.id >= 4000000 ? 'plavicon' : 'alba';
            const key = `${brand}-${color.codigo.trim().toLowerCase()}`;
            if (!grouped[key]) {
                grouped[key] = {
                    ...color,
                    count: 1
                };
            } else {
                grouped[key].count += 1;
            }
        });
        return Object.values(grouped);
    };

    const displayedColors = getGroupedColors(colors);

    // --- 4. Cargar Fórmulas y Equivalencias al abrir el Modal ---
    const handleOpenModal = async (color) => {
        setModalColor(color);
        setModalOpen(true);
        setSelectedProductId(null);
        setRecipes([]);
        setEquivalentColors([]);
        setModalDuplicates([]);
        setObservation('');

        // Buscar equivalencias de color en otras marcas y catálogos repetidos
        fetchEquivalentColors(color);
        fetchColorDuplicates(color);
        setClientName('');
        setObra('');

        try {
            const response = await tintometricoService.fetchDosificacion(color.id);
            const { recipes: fetchedRecipes, capacities: fetchedCapacities } = response || { recipes: [], capacities: [] };
            
            setRecipes(fetchedRecipes || []);
            setCapacities(fetchedCapacities || []);

            if (fetchedRecipes && fetchedRecipes.length > 0) {
                // Seleccionar primer producto por defecto
                const defaultProduct = fetchedRecipes[0];
                setSelectedProductId(defaultProduct.productId);
                
                // Cargar primer tamaño de lata de ese producto
                const sizes = getProductSizes(defaultProduct.productId, defaultProduct.base, fetchedCapacities);
                if (sizes.length > 0) {
                    const firstSize = sizes[0];
                    const rawVal = firstSize.capacidad_real !== undefined && firstSize.capacidad_real !== null ? firstSize.capacidad_real : firstSize.capacidad_litros;
                    const val = rawVal >= 100 ? rawVal / 1000 : rawVal;
                    setSelectedCanSize(val);
                }
            }
        } catch (err) {
            console.error('Error al cargar la dosificación:', err);
            toast.error('Error al cargar la dosificación del color.');
        }
    };

    const fetchColorDuplicates = async (color) => {
        setLoadingDuplicates(true);
        setModalDuplicates([]);
        try {
            const colorBrand = color.id >= 5000000 ? 'tersuave' : color.id >= 4000000 ? 'plavicon' : 'alba';
            const response = await tintometricoService.fetchColores(
                0,
                color.codigo,
                colorBrand,
                'all',
                'id',
                50
            );
            const { colores } = response || { colores: [] };
            const exactMatches = (colores || []).filter(c => 
                c.codigo.trim().toLowerCase() === color.codigo.trim().toLowerCase()
            );
            setModalDuplicates(exactMatches);
        } catch (err) {
            console.error('Error al buscar catálogos repetidos:', err);
        } finally {
            setLoadingDuplicates(false);
        }
    };

    const handleSwitchColor = async (color) => {
        setModalColor(color);
        setSelectedProductId(null);
        setRecipes([]);
        setCapacities([]);
        setObservation('');
        setClientName('');
        setObra('');
        
        try {
            const response = await tintometricoService.fetchDosificacion(color.id);
            const { recipes: fetchedRecipes, capacities: fetchedCapacities } = response || { recipes: [], capacities: [] };
            
            setRecipes(fetchedRecipes || []);
            setCapacities(fetchedCapacities || []);

            if (fetchedRecipes && fetchedRecipes.length > 0) {
                const defaultProduct = fetchedRecipes[0];
                setSelectedProductId(defaultProduct.productId);
                
                const sizes = getProductSizes(defaultProduct.productId, defaultProduct.base, fetchedCapacities);
                if (sizes.length > 0) {
                    const firstSize = sizes[0];
                    const rawVal = firstSize.capacidad_real !== undefined && firstSize.capacidad_real !== null ? firstSize.capacidad_real : firstSize.capacidad_litros;
                    const val = rawVal >= 100 ? rawVal / 1000 : rawVal;
                    setSelectedCanSize(val);
                }
            }
        } catch (err) {
            console.error('Error al cargar la dosificación:', err);
            toast.error('Error al cargar la dosificación del color.');
        }
    };

    const fetchEquivalentColors = async (color) => {
        setLoadingEquivalents(true);
        try {
            const response = await tintometricoService.fetchEquivalentes(color);
            setEquivalentColors(response || []);
        } catch (err) {
            console.error('Error al buscar colores equivalentes:', err);
        } finally {
            setLoadingEquivalents(false);
        }
    };

    // Helper para formatear capacidades de manera amigable
    const formatCapacity = (value, unidad = 'Lts') => {
        if (value === undefined || value === null) return '';
        const isKg = unidad?.toLowerCase() === 'kg';
        const displayVal = value >= 100 ? value / 1000 : value;
        const formatted = String(displayVal).replace('.', ',');
        if (isKg) {
            return `${formatted} kg`;
        }
        return `${formatted} Litro${displayVal !== 1 ? 's' : ''}`;
    };

    // Helper para obtener texto de capacidades disponibles para una base
    const getProductCapacitiesText = (productId, baseName, capsList = capacities) => {
        let sizes = capsList.filter(c => c.producto_id === productId && c.base === baseName);
        if (sizes.length === 0) {
            sizes = capsList.filter(c => c.producto_id === productId && c.base === 'General');
        }
        if (sizes.length === 0) return '';
        
        const caps = sizes.map(c => {
            const val = c.capacidad_real !== undefined && c.capacidad_real !== null ? c.capacidad_real : c.capacidad_litros;
            const displayVal = val >= 100 ? val / 1000 : val;
            return String(displayVal).replace('.', ',');
        });
        
        // Eliminar duplicados y ordenar numéricamente
        const uniqueCaps = Array.from(new Set(caps)).sort((a, b) => parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.')));
        return ` [${uniqueCaps.join(', ')} L]`;
    };

    // Helper para filtrar tamaños de lata válidos para un producto y base
    const getProductSizes = (productId, baseName, capsList = capacities) => {
        let sizes = capsList.filter(c => c.producto_id === productId && c.base === baseName);
        if (sizes.length === 0) {
            sizes = capsList.filter(c => c.producto_id === productId && c.base === 'General');
        }
        return sizes.sort((a, b) => {
            const rawA = a.capacidad_real !== undefined && a.capacidad_real !== null ? a.capacidad_real : a.capacidad_litros;
            const rawB = b.capacidad_real !== undefined && b.capacidad_real !== null ? b.capacidad_real : b.capacidad_litros;
            const capA = rawA >= 100 ? rawA / 1000 : rawA;
            const capB = rawB >= 100 ? rawB / 1000 : rawB;
            return capA - capB;
        });
    };

    // Obtener la receta del producto seleccionado
    const activeRecipe = recipes.find(r => r.productId === selectedProductId);
    const activeSizes = selectedProductId && activeRecipe
        ? getProductSizes(selectedProductId, activeRecipe.base)
        : [];

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
    };

    const handleDownloadPDF = () => {
        if (!modalColor || !activeRecipe) return;

        const activeSizeObj = activeSizes.find(sz => {
            const rawCap = sz.capacidad_real !== undefined && sz.capacidad_real !== null ? sz.capacidad_real : sz.capacidad_litros;
            const cap = rawCap >= 100 ? rawCap / 1000 : rawCap;
            return cap === selectedCanSize;
        });
        const precioBase = activeSizeObj?.precio_base ? Number(activeSizeObj.precio_base) : null;
        
        const isTersuave = activeRecipe.sistemaTintometrico?.toLowerCase() === 'tersuave';
        const isPlavicon = activeRecipe.sistemaTintometrico?.toLowerCase() === 'plavicon';

        const pigmentsWithCosts = activeRecipe.pigments.map((pig) => {
            const scaledVol = pig.cantidad * selectedCanSize;
            const nominalSize = activeSizeObj ? activeSizeObj.capacidad_litros : (selectedCanSize || 1);
            const nominalVol = pig.cantidad * nominalSize;
            let displayQty;
            let costoPig = 0;

            if (isTersuave) {
                displayQty = nominalVol.toFixed(2).replace('.', ',');
                const qtyUnits = Number((Number(nominalVol) / 1250).toFixed(4));
                costoPig = pig.precio_lata ? Math.round(qtyUnits * Number(pig.precio_lata) * 100) / 100 : 0;
            } else if (isPlavicon) {
                displayQty = nominalVol.toFixed(2).replace('.', ',');
                const qtyUnits = Number((Number(nominalVol) / 1300).toFixed(4));
                costoPig = pig.precio_lata ? Math.round(qtyUnits * Number(pig.precio_lata) * 100) / 100 : 0;
            } else {
                displayQty = nominalVol.toFixed(2).replace('.', ',');
                const qtyUnits = Number((Number(nominalVol) / 2200).toFixed(4));
                costoPig = pig.precio_lata ? Math.round(qtyUnits * Number(pig.precio_lata) * 100) / 100 : 0;
            }

            return {
                ...pig,
                scaledVol,
                displayQty,
                costoPig
            };
        });

        const precioPigmentosTotal = pigmentsWithCosts.reduce((acc, pig) => acc + pig.costoPig, 0);

        generateColorPDF(
            modalColor,
            activeRecipe,
            activeSizeObj,
            selectedCanSize,
            pigmentsWithCosts,
            precioBase,
            precioPigmentosTotal,
            observation,
            showFormula || brandPermissions.allowFormula
        );
    };

    const hasMultipleBrands = [
        brandPermissions.allowAlba,
        brandPermissions.allowPlavicon,
        brandPermissions.allowTersuave
    ].filter(Boolean).length > 1;

    return (
        <div className="min-h-[calc(100vh-140px)] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex flex-col font-sans shadow-lg">
            {/* --- CABECERA DE CONTROL SUPERIOR (Tema claro integrado con Espint) --- */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 bg-white border-b border-slate-200/80 shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl flex items-center gap-2 transition-all font-semibold text-xs cursor-pointer animate-in fade-in duration-200"
                    >
                        <ArrowLeft className="text-blue-600 text-xs w-3 h-3" /> Volver al Inicio
                    </button>
                    <span className="h-4 w-px bg-slate-200 hidden sm:inline" />
                    <span className="text-slate-800 text-xs hidden sm:inline font-bold tracking-wide flex items-center gap-1.5">
                        <Palette className="text-blue-600 w-4 h-4" /> Búsqueda y Dosificación de Colores
                    </span>
                </div>
                
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="sm:hidden px-4 py-2 bg-white text-slate-700 rounded-xl border border-slate-200 text-xs font-semibold"
                    >
                        Filtros y Simulador
                    </button>
                </div>
            </div>

            {/* --- CONTENIDO PRINCIPAL --- */}
            <div className="flex-1 flex overflow-hidden relative">
                
                {/* --- PANEL LATERAL IZQUIERDO (Sidebar de filtros e interactivos - Claro) --- */}
                <aside className={`absolute inset-y-0 left-0 z-20 flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-300 md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="flex-grow overflow-y-auto p-5 space-y-6">
                        
                        {/* Caja de Búsqueda */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Búsqueda de Color</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Nombre o código (ej: 04BB, 25YY)..."
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none transition-all focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                                />
                                <span className="absolute left-3.5 top-3.5 text-slate-400">
                                    <Search size={12} />
                                </span>
                                {searchQuery && (
                                    <button 
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Filtros de Marca */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Marca / Carta</label>
                            <div 
                                className="grid gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200"
                                style={{ 
                                    gridTemplateColumns: `repeat(${
                                        [[brandPermissions.allowAlba, brandPermissions.allowPlavicon, brandPermissions.allowTersuave].filter(Boolean).length > 1, brandPermissions.allowAlba, brandPermissions.allowPlavicon, brandPermissions.allowTersuave].filter(Boolean).length
                                    }, minmax(0, 1fr))` 
                                }}
                            >
                                {[brandPermissions.allowAlba, brandPermissions.allowPlavicon, brandPermissions.allowTersuave].filter(Boolean).length > 1 && (
                                    <button
                                        onClick={() => { setActiveBrand('all'); setActiveCollection('all'); }}
                                        className={`rounded-lg py-1.5 text-center text-[10px] font-bold transition-all cursor-pointer ${
                                            activeBrand === 'all'
                                                ? 'bg-slate-800 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/55'
                                        }`}
                                    >
                                        Todas
                                    </button>
                                )}
                                {brandPermissions.allowAlba && (
                                    <button
                                        onClick={() => { setActiveBrand('alba'); setActiveCollection('all'); }}
                                        className={`rounded-lg py-1.5 text-center text-[10px] font-bold transition-all cursor-pointer ${
                                            activeBrand === 'alba'
                                                ? 'bg-violet-600 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/55'
                                        }`}
                                    >
                                        Alba
                                    </button>
                                )}
                                {brandPermissions.allowPlavicon && (
                                    <button
                                        onClick={() => { setActiveBrand('plavicon'); setActiveCollection('all'); }}
                                        className={`rounded-lg py-1.5 text-center text-[10px] font-bold transition-all cursor-pointer ${
                                            activeBrand === 'plavicon'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/55'
                                        }`}
                                    >
                                        Plavicon
                                    </button>
                                )}
                                {brandPermissions.allowTersuave && (
                                    <button
                                        onClick={() => { setActiveBrand('tersuave'); setActiveCollection('all'); }}
                                        className={`rounded-lg py-1.5 text-center text-[10px] font-bold transition-all cursor-pointer ${
                                            activeBrand === 'tersuave'
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/55'
                                        }`}
                                    >
                                        Tersuave
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Simulador Interactivo */}
                        <div className="space-y-3 pt-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Visualización de Color</label>
                            <div className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-inner transition-all hover:border-slate-300">
                                <div className="relative w-full overflow-hidden rounded-lg bg-slate-200">
                                    {/* SVG de Sala de Estar interactivo */}
                                    <svg viewBox="0 0 800 500" className="w-full aspect-[8/5]">
                                        {/* Pared teñible */}
                                        <path 
                                            d="M 0,0 L 800,0 L 800,400 L 0,400 Z" 
                                            fill={activeColor?.hex || '#cbd5e1'} 
                                            className="transition-all duration-500 ease-in-out" 
                                        />
                                        <path d="M 0,0 L 250,0 L 250,400 L 0,400 Z" fill="black" opacity="0.04" />
                                        <rect x="0" y="390" width="800" height="10" fill="#FFFFFF" opacity="0.9" />
                                        
                                        {/* Piso */}
                                        <path d="M 0,400 L 800,400 L 800,500 L 0,500 Z" fill="#b45309" />
                                        <path d="M 0,400 L 200,500 M 200,400 L 400,500 M 400,400 L 600,500 M 600,400 L 800,500" stroke="#78350f" strokeWidth="1.5" />

                                        {/* Ventana */}
                                        <g>
                                            <rect x="60" y="30" width="160" height="260" fill="#e2e8f0" stroke="#FFFFFF" strokeWidth="6" rx="2" />
                                            <rect x="66" y="36" width="148" height="248" fill="#93c5fd" />
                                            <circle cx="140" cy="110" r="30" fill="#fef08a" opacity="0.4" />
                                            <line x1="140" y1="36" x2="140" y2="284" stroke="#FFFFFF" strokeWidth="3" opacity="0.5" />
                                            <line x1="66" y1="150" x2="214" y2="150" stroke="#FFFFFF" strokeWidth="3" opacity="0.5" />
                                        </g>

                                        {/* Consola / Mueble */}
                                        <g>
                                            <rect x="330" y="330" width="200" height="60" fill="#475569" rx="4" />
                                            <line x1="330" y1="360" x2="530" y2="360" stroke="#334155" strokeWidth="2" />
                                            <rect x="350" y="390" width="8" height="10" fill="#94a3b8" />
                                            <rect x="502" y="390" width="8" height="10" fill="#94a3b8" />
                                            <ellipse cx="430" cy="320" rx="12" ry="8" fill="#e2e8f0" />
                                        </g>

                                        {/* Sillón */}
                                        <g>
                                            <path d="M 490,260 L 730,260 C 750,260 760,275 760,295 L 745,390 L 495,390 Z" fill="#e2e8f0" />
                                            <rect x="505" y="275" width="115" height="90" fill="#cbd5e1" rx="8" />
                                            <rect x="625" y="275" width="115" height="90" fill="#cbd5e1" rx="8" />
                                            <path d="M 480,355 L 740,355 Q 743,355 745,360 L 730,420 Q 728,423 725,423 L 475,423 Q 472,423 472,420 L 485,360 Q 487,355 480,355 Z" fill="#94a3b8" />
                                        </g>
                                    </svg>

                                    {/* Badge flotante del color activo */}
                                    {activeColor && (
                                        <div className="absolute bottom-2 inset-x-2 flex items-center gap-2 rounded-lg bg-white/95 p-2.5 shadow-md border border-slate-100">
                                            <div className="h-4 w-4 rounded-full border border-black/10 shadow-md shrink-0" style={{ backgroundColor: activeColor.hex }} />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] font-bold text-slate-800 leading-tight truncate">{activeColor.nombre}</span>
                                                <span className="text-[8px] font-bold text-slate-500 tracking-wide font-mono">{activeColor.codigo}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Historial de Preparaciones */}
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <FileText size={12} className="text-blue-600" /> Historial de Preparados
                            </label>
                            
                            {loadingHistory ? (
                                <div className="flex items-center gap-2 text-xs text-slate-400 py-3 justify-center">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
                                    <span>Cargando historial...</span>
                                </div>
                            ) : history.length === 0 ? (
                                <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-400 font-semibold italic">
                                    No hay preparaciones hoy
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {history.slice(0, 10).map((item) => {
                                        const brand = item.formula?.sistema?.toLowerCase() || '';
                                        const brandBadgeColor = brand.includes('alba') 
                                            ? 'bg-violet-50 text-violet-600 border border-violet-100' 
                                            : brand.includes('plavicon') 
                                                ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                                                : brand.includes('tersuave')
                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                    : 'bg-amber-50 text-amber-600 border border-amber-100';

                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => handleReopenFromHistory(item)}
                                                className="group flex flex-col p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-305 hover:border-blue-400 hover:shadow-sm transition-all text-left cursor-pointer relative"
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-black text-slate-800 truncate max-w-[140px]" title={item.client_name + (item.obra ? ` (${item.obra})` : '')}>
                                                        {item.client_name} {item.obra && <span className="text-[9px] font-normal text-slate-500">({item.obra})</span>}
                                                    </span>
                                                    <span className="text-[8px] font-bold text-slate-400">
                                                        {new Date(item.created_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} {new Date(item.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div 
                                                        className="h-4.5 w-4.5 rounded-full border border-black/10 shadow-sm shrink-0" 
                                                        style={{ backgroundColor: item.hex || '#cbd5e1' }} 
                                                    />
                                                    <div className="flex-grow min-w-0">
                                                        <div className="text-[10px] font-bold text-slate-700 truncate">{item.color_name}</div>
                                                        <div className="text-[8.5px] font-bold text-slate-400 font-mono tracking-wider">{item.color_code || 'Manual'}</div>
                                                    </div>
                                                    {brand && (
                                                        <span className={`text-[7.5px] font-black uppercase px-1 py-0.5 rounded shrink-0 ${brandBadgeColor}`}>
                                                            {brand.includes('alba') ? 'Alba' : brand.includes('plavicon') ? 'Plavicon' : brand.includes('tersuave') ? 'Tersuave' : 'Manual'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                </aside>

                {/* Sombra de cierre para móvil */}
                {sidebarOpen && (
                    <div 
                        className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-10 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* --- CONTENIDO PRINCIPAL: GRILLA DE COLORES --- */}
                <main className="flex-1 overflow-y-auto p-6 bg-slate-100/40 flex flex-col">
                    {/* Indicador de resultados */}
                    <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                        <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                            Catálogo de Colores
                        </div>
                        <div className="text-xs text-slate-600">
                            Mostrando <strong className="text-blue-600 font-bold">{displayedColors.length.toLocaleString('es-AR')}</strong> de <strong className="text-slate-800 font-bold">{totalCount.toLocaleString('es-AR')}</strong> colores
                        </div>
                    </div>

                    {/* Grilla */}
                    {loading && colors.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-20">
                            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 mb-3" />
                            <span className="text-xs text-slate-500 font-semibold">Cargando catálogo de colores...</span>
                        </div>
                    ) : colors.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-20 space-y-3">
                            <Palette size={36} className="text-slate-300 animate-pulse animate-in fade-in" />
                            <span className="text-sm font-medium">No se encontraron colores que coincidan con la búsqueda.</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 animate-in fade-in duration-300">
                            {displayedColors.map((color) => (
                                <div
                                    key={color.id}
                                    onClick={() => handleOpenModal(color)}
                                    onMouseEnter={() => setActiveColor(color)}
                                    className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg"
                                >
                                    {/* Muestra de Color */}
                                    <div 
                                        className="h-28 w-full transition-opacity duration-300 group-hover:opacity-90 relative border-b border-slate-100"
                                        style={{ backgroundColor: color.hex }}
                                    >
                                        {/* Marca Badge */}
                                        <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-white shadow-sm border ${
                                            color.id >= 5000000
                                                ? 'bg-emerald-600/90 border-emerald-500/20'
                                                : color.id >= 4000000 
                                                    ? 'bg-blue-600/90 border-blue-500/20' 
                                                    : 'bg-violet-600/90 border-violet-500/20'
                                        }`}>
                                            {color.id >= 5000000 ? 'Tersuave' : color.id >= 4000000 ? 'Plavicon' : 'Alba'}
                                        </span>
                                    </div>
                                    
                                    {/* Información */}
                                    <div className="flex flex-col p-3 space-y-1">
                                        <span className="text-[8px] font-bold text-slate-400 tracking-wider uppercase truncate">
                                            {color.coleccion || 'General'} {color.count > 1 && `(+${color.count - 1})`}
                                        </span>
                                        <span className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors" title={color.nombre}>
                                            {color.nombre}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400 tracking-wider font-mono">{color.codigo}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Elemento disparador para Scroll Infinito */}
                    <div ref={loadMoreRef} className="flex justify-center py-8">
                        {loadingMore && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                                <span className="font-semibold">Cargando más colores...</span>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* --- MODAL DETALLADO DE DOSIFICACIÓN Y FÓRMULAS (Tema claro) --- */}
            {modalOpen && modalColor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
                    <div 
                        className="relative w-full max-w-4xl my-auto rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                    >
                        {/* Botón de cierre */}
                        <button 
                            onClick={() => setModalOpen(false)}
                            className="absolute right-4 top-4 z-10 rounded-lg bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                        
                        {/* LADO IZQUIERDO: Visualización y Opciones de Base (Fondo gris suave) */}
                        <div className="w-full md:w-5/12 bg-slate-50 p-6 flex flex-col space-y-6 border-r border-slate-200">
                            <div 
                                className="h-44 w-full rounded-xl flex items-end p-4 border border-black/5 relative overflow-hidden shadow-inner"
                                style={{ backgroundColor: modalColor.hex }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                                <span className="relative text-lg font-mono font-black text-white tracking-widest bg-black/30 px-3 py-1 rounded-lg border border-white/10 shadow-lg">
                                    {modalColor.codigo}
                                </span>
                            </div>
                            
                            {recipes.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Producto / Marca</label>
                                        <select
                                            value={selectedProductId || ''}
                                            onChange={(e) => {
                                                const newPId = Number(e.target.value);
                                                setSelectedProductId(newPId);
                                                const r = recipes.find(rec => rec.productId === newPId);
                                                if (r) {
                                                    const sizes = getProductSizes(newPId, r.base);
                                                    if (sizes.length > 0) {
                                                        const firstSize = sizes[0];
                                                        const rawVal = firstSize.capacidad_real !== undefined && firstSize.capacidad_real !== null ? firstSize.capacidad_real : firstSize.capacidad_litros;
                                                        const val = rawVal >= 100 ? rawVal / 1000 : rawVal;
                                                        setSelectedCanSize(val);
                                                    }
                                                }
                                            }}
                                            className="w-full rounded-xl border border-slate-300 bg-white py-3 px-4 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                                        >
                                            {recipes.map((r) => (
                                                <option key={r.productId} value={r.productId}>
                                                    {r.productName} {r.sistemaTintometrico ? `(${r.sistemaTintometrico})` : ''}{getProductCapacitiesText(r.productId, r.base)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Capacidad Envase</label>
                                        <select
                                            value={selectedCanSize || ''}
                                            onChange={(e) => setSelectedCanSize(Number(e.target.value))}
                                            className="w-full rounded-xl border border-slate-300 bg-white py-3 px-4 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                                        >
                                            {activeSizes.map((sz) => {
                                                const rawVal = sz.capacidad_real !== undefined && sz.capacidad_real !== null ? sz.capacidad_real : sz.capacidad_litros;
                                                const value = rawVal >= 100 ? rawVal / 1000 : rawVal;
                                                return (
                                                    <option key={sz.id || sz.capacidad_litros} value={value}>
                                                        {formatCapacity(rawVal, sz.unidad)}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                    {activeRecipe && (
                                        <div className="flex items-center justify-between rounded-xl bg-blue-50 border border-blue-100 p-3.5 shadow-sm">
                                            <span className="text-xs font-bold text-slate-500">Base Requerida:</span>
                                            <span className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-black text-white tracking-widest shadow-sm">
                                                Base {activeRecipe.base}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                                    <span className="text-xs text-amber-600 font-semibold">No hay marcas configuradas para dosificar este color.</span>
                                </div>
                            )}

                            {/* Sección de Equivalencias en otras marcas */}
                            {hasMultipleBrands && (
                                <div className="space-y-3 pt-4 border-t border-slate-200">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Equivalentes en otras marcas</label>
                                    {loadingEquivalents ? (
                                        <div className="flex items-center gap-2 text-xs text-slate-400 py-1.5">
                                            <div className="h-3.5 w-3.5 animate-spin rounded-full border border-slate-200 border-t-blue-500" />
                                            <span>Buscando equivalencias...</span>
                                        </div>
                                    ) : equivalentColors.length > 0 ? (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {equivalentColors.map((eqColor) => {
                                                const brand = eqColor.id >= 5000000 ? 'Tersuave' : eqColor.id >= 4000000 ? 'Plavicon' : 'Alba';
                                                const brandStyle = eqColor.id >= 5000000 
                                                    ? 'border-emerald-200 hover:bg-emerald-50 hover:border-emerald-400 text-emerald-600' 
                                                    : eqColor.id >= 4000000 
                                                        ? 'border-blue-200 hover:bg-blue-50 hover:border-blue-400 text-blue-600' 
                                                        : 'border-violet-200 hover:bg-violet-50 hover:border-violet-400 text-violet-600';
                                                const brandBadge = eqColor.id >= 5000000 
                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                                                    : eqColor.id >= 4000000 
                                                        ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                                                        : 'bg-violet-50 text-violet-600 border border-violet-200';
                                                
                                                const dist = eqColor.distance;
                                                let label = 'Similar';
                                                if (dist !== undefined) {
                                                    if (dist <= 1.5) label = 'Idéntico';
                                                    else if (dist <= 3.0) label = 'Excelente';
                                                    else if (dist <= 5.5) label = 'Muy cercano';
                                                    else if (dist <= 9.0) label = 'Cercano';
                                                }

                                                return (
                                                    <button
                                                        key={eqColor.id}
                                                        onClick={() => handleOpenModal(eqColor)}
                                                        className={`w-full flex items-center justify-between p-2 rounded-xl border bg-white transition-all text-left cursor-pointer hover:-translate-y-0.5 hover:shadow-sm ${brandStyle}`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <span 
                                                                className="h-7 w-7 rounded-lg border border-slate-100 shrink-0 shadow-inner" 
                                                                style={{ backgroundColor: eqColor.hex }}
                                                            />
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-xs font-bold text-slate-800 truncate">{eqColor.nombre}</span>
                                                                <span className="text-[9px] text-slate-400 font-semibold font-mono">{eqColor.codigo}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-0.5 shrink-0 pl-2">
                                                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${brandBadge}`}>
                                                                {brand}
                                                            </span>
                                                            {dist !== undefined && (
                                                                <span className="text-[8px] font-bold text-slate-400">
                                                                    {label}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-slate-400 italic py-1">
                                            No se encontraron colores equivalentes en otras marcas.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* LADO DERECHO: Dosificación, Fórmulas y Precio (Fondo Blanco) */}
                        <div className="flex-1 p-6 md:p-8 flex flex-col justify-between space-y-6 bg-white overflow-y-auto">
                            <div className="space-y-6">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full text-white border ${
                                            modalColor.id >= 5000000
                                                ? 'bg-emerald-600 border-emerald-500/20'
                                                : modalColor.id >= 4000000 
                                                    ? 'bg-blue-600 border-blue-500/20' 
                                                    : 'bg-violet-600 border-violet-500/20'
                                        }`}>
                                            {modalColor.id >= 5000000 ? 'Tersuave' : modalColor.id >= 4000000 ? 'Plavicon' : 'Alba'}
                                        </span>
                                    </div>

                                    {loadingDuplicates ? (
                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold mb-3 animate-pulse">
                                            <div className="h-3 w-3 animate-spin rounded-full border border-slate-200 border-t-blue-500" />
                                            Cargando otros catálogos...
                                        </div>
                                    ) : modalDuplicates.length > 1 ? (
                                        <div className="space-y-1.5 mb-3">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                                Disponible en catálogos:
                                            </span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {modalDuplicates.map((dup) => {
                                                    const isSelected = dup.id === modalColor.id;
                                                    return (
                                                        <button
                                                            key={dup.id}
                                                            onClick={() => handleSwitchColor(dup)}
                                                            className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                                                                isSelected
                                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                                            }`}
                                                        >
                                                            {dup.coleccion || 'General'}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mb-2">
                                            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                                                {modalColor.coleccion || 'General'}
                                            </span>
                                        </div>
                                    )}

                                    <h2 className="text-xl md:text-2xl font-black text-slate-800 mt-1">{modalColor.nombre}</h2>
                                </div>

                                {activeRecipe ? (() => {
                                    const activeSizeObj = activeSizes.find(sz => {
                                        const rawCap = sz.capacidad_real !== undefined && sz.capacidad_real !== null ? sz.capacidad_real : sz.capacidad_litros;
                                        const cap = rawCap >= 100 ? rawCap / 1000 : rawCap;
                                        return cap === selectedCanSize;
                                    });
                                    const precioBase = activeSizeObj?.precio_base ? Number(activeSizeObj.precio_base) : null;
                                    
                                    const isTersuave = activeRecipe.sistemaTintometrico?.toLowerCase() === 'tersuave';
                                    const isPlavicon = activeRecipe.sistemaTintometrico?.toLowerCase() === 'plavicon';

                                    // Precalcular costos de pigmentos
                                    const pigmentsWithCosts = activeRecipe.pigments.map((pig) => {
                                        const scaledVol = pig.cantidad * selectedCanSize;
                                        const nominalSize = activeSizeObj ? activeSizeObj.capacidad_litros : (selectedCanSize || 1);
                                        const nominalVol = pig.cantidad * nominalSize;
                                        let displayQty;
                                        let costoPig = 0;

                                        if (isTersuave) {
                                            displayQty = nominalVol.toFixed(2).replace('.', ',');
                                            const qtyUnits = Number((Number(nominalVol) / 1250).toFixed(4));
                                            costoPig = pig.precio_lata ? Math.round(qtyUnits * Number(pig.precio_lata) * 100) / 100 : 0;
                                        } else if (isPlavicon) {
                                            displayQty = nominalVol.toFixed(2).replace('.', ',');
                                            const qtyUnits = Number((Number(nominalVol) / 1300).toFixed(4));
                                            costoPig = pig.precio_lata ? Math.round(qtyUnits * Number(pig.precio_lata) * 100) / 100 : 0;
                                        } else {
                                            displayQty = nominalVol.toFixed(2).replace('.', ',');
                                            const qtyUnits = Number((Number(nominalVol) / 2200).toFixed(4));
                                            costoPig = pig.precio_lata ? Math.round(qtyUnits * Number(pig.precio_lata) * 100) / 100 : 0;
                                        }

                                        return {
                                            ...pig,
                                            scaledVol,
                                            displayQty,
                                            costoPig
                                        };
                                    });

                                    const precioPigmentosTotal = pigmentsWithCosts.reduce((acc, pig) => acc + pig.costoPig, 0);

                                    return (
                                        <div className="space-y-5">
                                            {(showFormula || brandPermissions.allowFormula) && (
                                                <div className="space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Calculator size={12} className="text-blue-600" /> Fórmula de dosificación
                                                    </h3>
                                                    {brandPermissions.allowFormula && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowFormula(!showFormula)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                                                showFormula 
                                                                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 shadow-sm' 
                                                                    : 'bg-slate-100 border-slate-205 border-slate-200 text-slate-600 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            {showFormula ? (
                                                                <>
                                                                    <Eye className="text-blue-600 w-3.5 h-3.5" />
                                                                    <span>Fórmula Visible</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <EyeOff className="text-slate-500 w-3.5 h-3.5" />
                                                                    <span>Fórmula Oculta</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                                 {showFormula && (
                                                     <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50">
                                                         <table className="w-full text-left text-xs border-collapse">
                                                             <thead>
                                                                 <tr className="border-b border-slate-200 bg-slate-100/60 text-slate-500">
                                                                     <th className="px-3 py-2.5 font-bold">Pigmento</th>
                                                                     <th className="px-3 py-2.5 font-bold">Nombre</th>
                                                                     <th className="px-3 py-2.5 text-right font-bold">
                                                                         {isTersuave ? 'Impulsos' : 'Impulso (Y)'}
                                                                     </th>
                                                                     <th className="px-3 py-2.5 text-right font-bold">Costo</th>
                                                                 </tr>
                                                             </thead>
                                                             <tbody>
                                                                 {pigmentsWithCosts.map((pig) => (
                                                                     <tr key={pig.id} className="border-b border-slate-100 hover:bg-slate-100/20 transition-colors">
                                                                         <td className="px-3 py-2.5">
                                                                             <div className="flex items-center gap-2">
                                                                                 <span className="h-3.5 w-3.5 rounded-full border border-black/10 shadow-sm shrink-0" style={{ backgroundColor: pig.hex }} />
                                                                                 <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-600">{pig.code}</span>
                                                                             </div>
                                                                         </td>
                                                                         <td className="px-3 py-2.5 text-slate-700 font-bold truncate max-w-[120px] sm:max-w-none">
                                                                             {pig.name} {pig.codigo_comercial && <span className="text-[9px] text-slate-400 font-mono ml-1">({pig.codigo_comercial})</span>}
                                                                         </td>
                                                                         <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{pig.displayQty}</td>
                                                                         <td className="px-3 py-2.5 text-right font-mono text-blue-600 font-bold">
                                                                             {pig.precio_lata ? formatCurrency(pig.costoPig) : '$0,00'}
                                                                         </td>
                                                                     </tr>
                                                                 ))}
                                                             </tbody>
                                                         </table>
                                                     </div>
                                                 )}
                                             </div>
                                             )}

                                             {/* Precios y Totales */}
                                             <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3.5 shadow-sm">
                                                 <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-2">
                                                     <span className="text-slate-500 font-bold">
                                                         Pintura Base ({activeRecipe.base})
                                                         {activeSizeObj?.codigo_comercial && (
                                                             <span className="text-[9px] text-slate-400 font-mono ml-1.5">({activeSizeObj.codigo_comercial})</span>
                                                         )}:
                                                     </span>
                                                     <span className="font-mono text-slate-700 font-black">
                                                         {precioBase !== null ? formatCurrency(precioBase) : <span className="text-[9px] text-amber-600 font-normal italic">Precio no disponible</span>}
                                                     </span>
                                                 </div>
                                                 <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-2">
                                                     <span className="text-slate-500 font-bold">Colorantes / Pigmentos:</span>
                                                     <span className="font-mono text-blue-600 font-black">{formatCurrency(precioPigmentosTotal)}</span>
                                                 </div>
                                                 <div className="flex items-center justify-between pt-1">
                                                     <span className="text-xs font-black uppercase text-slate-700 tracking-wider">Precio Total Estimado:</span>
                                                     <span className="font-mono text-base md:text-lg font-black text-blue-700 bg-blue-50 px-3.5 py-1 rounded-lg border border-blue-200/60 shadow-sm">
                                                         {precioBase !== null ? formatCurrency(precioBase + precioPigmentosTotal) : <span className="text-xs text-amber-600 font-bold italic">Falta precio base</span>}
                                                     </span>
                                                 </div>
                                             </div>

                                             {/* Registrar en Historial & Descargar PDF */}
                                             <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                                                 <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-sm">
                                                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                         📥 Registrar en Historial
                                                     </span>
                                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                         <input
                                                             type="text"
                                                             value={clientName}
                                                             onChange={(e) => setClientName(e.target.value)}
                                                             placeholder="Nombre del cliente..."
                                                             className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs font-semibold text-slate-700 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/10"
                                                         />
                                                         <input
                                                             type="text"
                                                             value={obra}
                                                             onChange={(e) => setObra(e.target.value)}
                                                             placeholder="Obra (ej: Obra 1, Casa Sur)..."
                                                             className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs font-semibold text-slate-700 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/10"
                                                         />
                                                     </div>
                                                     <button
                                                         type="button"
                                                         onClick={handleRegisterPreparation}
                                                         disabled={registering}
                                                         className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                                     >
                                                         <Check size={12} />
                                                         <span>{registering ? 'Registrando...' : 'Registrar'}</span>
                                                     </button>
                                                 </div>

                                                 <div className="space-y-1">
                                                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Observación (Opcional)</label>
                                                     <textarea
                                                         value={observation}
                                                         onChange={(e) => setObservation(e.target.value)}
                                                         placeholder="Agregar nota u observación para incluir en el PDF..."
                                                         className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/10 resize-none h-14"
                                                     />
                                                 </div>
                                                 <button
                                                     type="button"
                                                     onClick={handleDownloadPDF}
                                                     className="w-full py-2.5 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                 >
                                                     <FileText size={12} /> Descargar Detalle en PDF
                                                 </button>
                                             </div>
                                         </div>
                                     );
                                 })() : (
                                     <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                                         <Paintbrush size={24} className="text-slate-300 animate-bounce" />
                                         <span className="text-xs text-slate-500 font-semibold">Receta de colorante no cargada para este color.</span>
                                     </div>
                                 )}
                             </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tintometrico;
