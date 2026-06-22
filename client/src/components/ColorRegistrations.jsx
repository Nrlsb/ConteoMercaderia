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
    X,
    Eye,
    EyeOff,
    Building,
    DollarSign
} from 'lucide-react';
import { colorRegistrationsService } from '../utils/colorRegistrationsService';
import { tintometricoService } from '../utils/tintometricoService';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const CONCENTRADOS_PREDEFINIDOS = {
    entonador_universal: {
        id: 'entonador_universal',
        nombre: 'Entonador Universal',
        unidad: 'impulsos',
        pigmentos: [
            { codigo: 'AM', nombre: 'Amarillo', hex: '#facc15' },
            { codigo: 'AZ', nombre: 'Azul', hex: '#1d4ed8' },
            { codigo: 'BE', nombre: 'Bermellón / Rojo', hex: '#dc2626' },
            { codigo: 'VE', nombre: 'Verde', hex: '#15803d' },
            { codigo: 'NE', nombre: 'Negro', hex: '#1e293b' },
            { codigo: 'OC', nombre: 'Ocre', hex: '#d97706' },
            { codigo: 'MA', nombre: 'Marrón', hex: '#78350f' },
            { codigo: 'SI', nombre: 'Siena', hex: '#a16207' },
            { codigo: 'NA', nombre: 'Naranja', hex: '#ea580c' },
            { codigo: 'VI', nombre: 'Violeta', hex: '#7e22ce' }
        ]
    },
    sistema_alba: {
        id: 'sistema_alba',
        nombre: 'Sistema Alba (Manual)',
        unidad: 'impulsos',
        pigmentos: [
            { codigo: 'WH1', nombre: 'BLANCO (WH1)', hex: '#F3F4F6' },
            { codigo: 'NO1', nombre: 'NEGRO (NO1)', hex: '#1A1A1A' },
            { codigo: 'XY1', nombre: 'XY1 (Amarillo)', hex: '#F6D32D' },
            { codigo: 'YE1', nombre: 'YE1 (Amarillo)', hex: '#F3E15F' },
            { codigo: 'YE2', nombre: 'YE2 (Amarillo)', hex: '#C19227' },
            { codigo: 'XR1', nombre: 'XR1 (Amarillo)', hex: '#F2B824' },
            { codigo: 'OR1', nombre: 'OR1 (Naranja)', hex: '#E05E1B' },
            { codigo: 'RE1', nombre: 'RE1 (Rojo)', hex: '#A8201A' },
            { codigo: 'MA1', nombre: 'MA1 (Magenta)', hex: '#D11C5B' },
            { codigo: 'BU1', nombre: 'BU1 (Azul)', hex: '#1C3B8B' },
            { codigo: 'BU2', nombre: 'BU2 (Azul)', hex: '#1E6BB8' },
            { codigo: 'GR1', nombre: 'GR1 (Verde)', hex: '#1E753B' },
            { codigo: 'UM1', nombre: 'UM1 (Marrón)', hex: '#6F523B' }
        ]
    },
    sistema_tersuave: {
        id: 'sistema_tersuave',
        nombre: 'Sistema Tersuave (Manual)',
        unidad: 'impulsos',
        pigmentos: [
            { codigo: 'XT', nombre: 'BLANCO (XT)', hex: '#FFFFFF' },
            { codigo: 'TT', nombre: 'NEGRO (TT)', hex: '#000000' },
            { codigo: 'ZT', nombre: 'AMARILLO LIMON (ZT)', hex: '#FFFF00' },
            { codigo: 'KS', nombre: 'AMARILLO MEDIO (KS)', hex: '#FFFF29' },
            { codigo: 'US', nombre: 'AMARILLO NARANJA (US)', hex: '#FFCC00' },
            { codigo: 'RT', nombre: 'AMARILLO (RT)', hex: '#FF8000' },
            { codigo: 'PT', nombre: 'ROJO (PT)', hex: '#FF0000' },
            { codigo: 'RS', nombre: 'ROJO (RS)', hex: '#CC0000' },
            { codigo: 'VT', nombre: 'ROJO (VT)', hex: '#990000' },
            { codigo: 'HS', nombre: 'MAGENTA (HS)', hex: '#660066' },
            { codigo: 'FT', nombre: 'VIOLETA (FT)', hex: '#531EB2' },
            { codigo: 'MS', nombre: 'AZUL (MS)', hex: '#0000CC' },
            { codigo: 'MT', nombre: 'AZUL (MT)', hex: '#000066' },
            { codigo: 'LS', nombre: 'VERDE (LS)', hex: '#006600' },
            { codigo: 'LT', nombre: 'VERDE (LT)', hex: '#008000' },
            { codigo: 'ST', nombre: 'MARRON (ST)', hex: '#800000' }
        ]
    },
    sistema_plavicon: {
        id: 'sistema_plavicon',
        nombre: 'Sistema Plavicon (Manual)',
        unidad: 'impulsos',
        pigmentos: [
            { codigo: 'KX', nombre: 'BLANCO (KX)', hex: '#ffffff' },
            { codigo: 'B', nombre: 'NEGRO (B)', hex: '#212121' },
            { codigo: 'AXX', nombre: 'AMARILLO (AXX)', hex: '#FFEB3B' },
            { codigo: 'C', nombre: 'AMARILLO OXIDO (C)', hex: '#F57F17' },
            { codigo: 'T', nombre: 'AMARILLO MEDIO (T)', hex: '#FFC107' },
            { codigo: 'L', nombre: 'AMBAR CRUDO (L)', hex: '#FF6F00' },
            { codigo: 'R', nombre: 'ROJO (R)', hex: '#D50000' },
            { codigo: 'F', nombre: 'ROJO OXIDO (F)', hex: '#D84315' },
            { codigo: 'V', nombre: 'MAGENTA (V)', hex: '#E91E63' },
            { codigo: 'E', nombre: 'AZUL PHTHALO (E)', hex: '#0D47A1' },
            { codigo: 'D', nombre: 'VERDE PHTHALO (D)', hex: '#2E7D32' },
            { codigo: 'I', nombre: 'MARRON (I)', hex: '#8d6e63' }
        ]
    }
};

const ColorRegistrations = () => {
    const { user } = useAuth();
    const isSucursal98 = user?.sucursal_code === '98' || user?.sucursal_name === '98' || user?.sucursal_name?.toLowerCase() === 'sucursal 98';
    
    // --- Form States ---
    const [colorType, setColorType] = useState('tintometrico'); // 'tintometrico' | 'manual'
    const [colorName, setColorName] = useState('');
    const [colorCode, setColorCode] = useState('');
    const [hex, setHex] = useState('#3b82f6');
    const [clientName, setClientName] = useState('');
    const [obra, setObra] = useState('');
    const [observations, setObservations] = useState('');
    const [selectedConcentrado, setSelectedConcentrado] = useState('');
    const [manualPigments, setManualPigments] = useState({});
    const [modType, setModType] = useState('original'); // 'original' | 'extras' | 'porcentaje'
    const [pctDirection, setPctDirection] = useState('mas'); // 'mas' | 'menos'
    const [pctValue, setPctValue] = useState('');
    const [extraPigments, setExtraPigments] = useState({});
    const [selectedExtraConcentrado, setSelectedExtraConcentrado] = useState('');

    const getTintometricSystemId = (systemName) => {
        if (!systemName) return null;
        const name = systemName.toLowerCase();
        if (name.includes('alba')) return 'sistema_alba';
        if (name.includes('tersuave')) return 'sistema_tersuave';
        if (name.includes('plavicon')) return 'sistema_plavicon';
        return null;
    };

    // Product search autocomplete states (used in both manual and tintometric modes)
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

    // Tintometric formula/recipe states
    const [recipes, setRecipes] = useState([]);
    const [capacities, setCapacities] = useState([]);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [selectedCanSize, setSelectedCanSize] = useState(1);
    const [activeRecipe, setActiveRecipe] = useState(null);
    const [activeSizes, setActiveSizes] = useState([]);
    const [loadingFormula, setLoadingFormula] = useState(false);

    // App User select states
    const [userId, setUserId] = useState('');
    const [usersList, setUsersList] = useState([]);

    // --- List States ---
    const [registrations, setRegistrations] = useState([]);
    const [registrationsSearch, setRegistrationsSearch] = useState('');
    const [loadingRegistrations, setLoadingRegistrations] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // UI Toggles
    const [expandedFormulaId, setExpandedFormulaId] = useState(null);
    const [showAllPrices, setShowAllPrices] = useState(false);
    const [visiblePrices, setVisiblePrices] = useState({});

    // Refs for clicking outside dropdowns
    const productDropdownRef = useRef(null);
    const tintometricDropdownRef = useRef(null);

    // Renderiza de forma premium las observaciones parseando los modificadores si existen
    const renderObservations = (obs) => {
        if (!obs) return null;

        let cleanObs = obs;
        let badge = null;

        if (obs.startsWith('[MOD: EXTRAS]')) {
            cleanObs = obs.replace('[MOD: EXTRAS]', '').trim();
            badge = (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[8px] font-black uppercase mb-1">
                    ➕ Colorantes Extras
                </span>
            );
        } else {
            const pctMatch = obs.match(/^\[MOD: PCT_(MAS|MENOS)_([\d.,]+)\]/);
            if (pctMatch) {
                const direction = pctMatch[1] === 'MAS' ? '+' : '-';
                const value = pctMatch[2];
                cleanObs = obs.replace(pctMatch[0], '').trim();
                badge = (
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[8px] font-black uppercase mb-1">
                        ⚠️ Ajuste: {direction}{value}% Concentrado
                    </span>
                );
            }
        }

        return (
            <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-[11px] font-semibold text-gray-600 leading-relaxed max-h-24 overflow-y-auto">
                <span className="font-bold text-gray-500 block mb-0.5 text-[9px] uppercase tracking-wider">Notas:</span>
                {badge}
                {cleanObs && <p className="mt-0.5 text-gray-700 font-medium">{cleanObs}</p>}
            </div>
        );
    };

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

        if (selectedTintometricColor && `${selectedTintometricColor.nombre} (${selectedTintometricColor.codigo})` === tintometricSearch) {
            return;
        }

        setSearchingTintometric(true);
        const timer = setTimeout(async () => {
            try {
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

    // When active recipe or can size changes, update formula details
    useEffect(() => {
        if (!recipes.length || !selectedProductId) {
            setActiveRecipe(null);
            return;
        }
        const recipe = recipes.find(r => r.productId === Number(selectedProductId));
        setActiveRecipe(recipe || null);

        if (recipe) {
            const sizes = getProductSizes(recipe.productId, recipe.base, capacities);
            setActiveSizes(sizes);
        } else {
            setActiveSizes([]);
        }
    }, [selectedProductId, recipes, capacities]);

    // Auto-select corresponding extra concentrado system when active recipe changes
    useEffect(() => {
        if (activeRecipe?.sistemaTintometrico) {
            const sysId = getTintometricSystemId(activeRecipe.sistemaTintometrico);
            if (sysId) {
                setSelectedExtraConcentrado(sysId);
            } else {
                setSelectedExtraConcentrado('entonador_universal');
            }
        } else {
            setSelectedExtraConcentrado('');
        }
        setExtraPigments({});
    }, [activeRecipe]);

    // Lookup corresponding product in main DB when selected recipe changes
    useEffect(() => {
        const lookupProduct = async () => {
            if (!activeRecipe) {
                setSelectedProduct(null);
                setProductSearch('');
                return;
            }

            try {
                let codeToSearch = String(activeRecipe.productId);
                if (activeRecipe.sistemaTintometrico?.toLowerCase() === 'alba') {
                    codeToSearch = codeToSearch.padStart(6, '0');
                }

                // Look up product by code
                const result = await colorRegistrationsService.searchProducts(codeToSearch);
                const exactMatch = result?.find(p => p.code?.trim() === codeToSearch.trim());
                
                if (exactMatch) {
                    setSelectedProduct(exactMatch);
                    setProductSearch(`${exactMatch.code} - ${exactMatch.description}`);
                } else if (result && result.length > 0) {
                    setSelectedProduct(result[0]);
                    setProductSearch(`${result[0].code} - ${result[0].description}`);
                } else {
                    setSelectedProduct(null);
                    setProductSearch('');
                    console.warn(`Product code ${codeToSearch} not found in main DB.`);
                }
            } catch (err) {
                console.error('Error looking up formula product in main DB:', err);
            }
        };

        lookupProduct();
    }, [activeRecipe]);

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

    // Load formulas & sizes for selected tintometric color
    const fetchFormulaForColor = async (color) => {
        setLoadingFormula(true);
        try {
            const response = await tintometricoService.fetchDosificacion(color.id);
            const { recipes: fetchedRecipes, capacities: fetchedCapacities } = response || { recipes: [], capacities: [] };
            
            setRecipes(fetchedRecipes || []);
            setCapacities(fetchedCapacities || []);

            if (fetchedRecipes && fetchedRecipes.length > 0) {
                // Select first product by default
                const defaultProduct = fetchedRecipes[0];
                setSelectedProductId(defaultProduct.productId);
                
                // Select first capacity size
                const sizes = getProductSizes(defaultProduct.productId, defaultProduct.base, fetchedCapacities);
                if (sizes.length > 0) {
                    const firstSize = sizes[0];
                    const rawVal = firstSize.capacidad_real !== undefined && firstSize.capacidad_real !== null ? firstSize.capacidad_real : firstSize.capacidad_litros;
                    const val = rawVal >= 100 ? rawVal / 1000 : rawVal;
                    setSelectedCanSize(val);
                }
            } else {
                setSelectedProductId('');
                setSelectedCanSize(1);
            }
        } catch (err) {
            console.error('Error loading formula details:', err);
            toast.error('Error al cargar la dosificación del color seleccionado.');
        } finally {
            setLoadingFormula(false);
        }
    };

    const handleSelectTintometricColor = (color) => {
        setSelectedTintometricColor(color);
        setColorName(color.nombre);
        setColorCode(color.codigo);
        setHex(color.hex || '#3b82f6');
        tintometricSearchVal(color);
        setShowTintometricDropdown(false);
        
        // Fetch formulation details
        fetchFormulaForColor(color);
    };

    const tintometricSearchVal = (color) => {
        setTintometricSearch(`${color.nombre} (${color.codigo})`);
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
        setRecipes([]);
        setCapacities([]);
        setSelectedProductId('');
        setSelectedCanSize(1);
        setActiveRecipe(null);
        setActiveSizes([]);
        setSelectedProduct(null);
        setProductSearch('');
        setExtraPigments({});
        setSelectedExtraConcentrado('');
        setModType('original');
    };

    // Helper functions for capacity sizes
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

    // Calculate identification ID live preview
    const getIdentificationId = () => {
        if (!colorName.trim() && !clientName.trim()) return '';
        const namePart = colorName.trim() || 'Nombre Color';
        const clientPart = clientName.trim() || 'Cliente';
        return `${namePart} - ${clientPart}`;
    };

    // Build formula object for submission
    const getComputedFormula = () => {
        if (colorType !== 'tintometrico' || !activeRecipe) return null;

        const pigments = activeRecipe.pigments.map(pig => {
            const scaledQty = pig.cantidad * selectedCanSize;
            return {
                codigo: pig.code,
                nombre: pig.name,
                hex: pig.hex,
                cantidad: Number(scaledQty.toFixed(4)),
                unidad: 'impulsos'
            };
        });

        const extraPigs = [];
        if (modType === 'extras' && selectedExtraConcentrado) {
            const concentradoInfo = CONCENTRADOS_PREDEFINIDOS[selectedExtraConcentrado];
            Object.entries(extraPigments)
                .filter(([_, qty]) => qty !== undefined && qty !== null && qty !== '' && parseFloat(qty) > 0)
                .forEach(([code, qty]) => {
                    const pigInfo = concentradoInfo.pigmentos.find(p => p.codigo === code);
                    extraPigs.push({
                        codigo: code,
                        nombre: pigInfo ? pigInfo.nombre : code,
                        hex: pigInfo ? pigInfo.hex : '#808080',
                        cantidad: Number(parseFloat(qty).toFixed(4)),
                        unidad: concentradoInfo.unidad
                    });
                });
        }

        return {
            base: activeRecipe.base,
            sistema: activeRecipe.sistemaTintometrico,
            productName: activeRecipe.productName,
            pigmentos: pigments,
            pigmentos_extras: extraPigs.length > 0 ? extraPigs : undefined
        };
    };

    const getManualFormula = () => {
        if (colorType !== 'manual' || !selectedConcentrado) return null;

        const concentradoInfo = CONCENTRADOS_PREDEFINIDOS[selectedConcentrado];
        const pigments = Object.entries(manualPigments)
            .filter(([_, qty]) => qty !== undefined && qty !== null && qty !== '' && parseFloat(qty) > 0)
            .map(([code, qty]) => {
                const pigInfo = concentradoInfo.pigmentos.find(p => p.codigo === code);
                return {
                    codigo: code,
                    nombre: pigInfo ? pigInfo.nombre : code,
                    hex: pigInfo ? pigInfo.hex : '#808080',
                    cantidad: Number(parseFloat(qty).toFixed(4)),
                    unidad: concentradoInfo.unidad
                };
            });

        if (pigments.length === 0) return null;

        return {
            base: 'Manual',
            sistema: concentradoInfo.nombre,
            productName: selectedProduct ? selectedProduct.description : 'Preparado Manual',
            pigmentos: pigments
        };
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
        if (colorType === 'tintometrico' && !selectedProductId) {
            toast.error('Por favor, selecciona el producto de la fórmula.');
            return;
        }

        setSaving(true);
        try {
            const calculatedFormula = colorType === 'tintometrico' ? getComputedFormula() : getManualFormula();
            
            // Construir observaciones estructuradas con prefijos para identificar la modificación de fórmula
            let finalObservations = observations.trim();
            let prefix = '';
            if (colorType === 'tintometrico') {
                if (modType === 'extras') {
                    prefix = '[MOD: EXTRAS]';
                } else if (modType === 'porcentaje' && pctValue.trim() !== '') {
                    prefix = `[MOD: PCT_${pctDirection.toUpperCase()}_${pctValue.trim()}]`;
                }
            }

            const payload = {
                color_type: colorType,
                color_name: colorName.trim(),
                client_name: clientName.trim(),
                product_id: selectedProduct?.id || null,
                user_id: userId || null,
                color_code: colorType === 'tintometrico' ? colorCode : null,
                hex: hex,
                observations: prefix ? `${prefix} ${finalObservations}`.trim() : finalObservations || null,
                capacity_real: colorType === 'tintometrico' ? selectedCanSize : null,
                base: colorType === 'tintometrico' ? activeRecipe?.base : null,
                formula: calculatedFormula,
                obra: obra.trim() || null
            };

            await colorRegistrationsService.create(payload);
            toast.success('¡Color registrado con éxito!');
            
            // Reset fields
            setColorName('');
            setColorCode('');
            setHex('#3b82f6');
            setClientName('');
            setObra('');
            setObservations('');
            setSelectedProduct(null);
            setProductSearch('');
            setSelectedTintometricColor(null);
            setTintometricSearch('');
            setUserId('');
            setRecipes([]);
            setCapacities([]);
            setSelectedProductId('');
            setSelectedCanSize(1);
            setActiveRecipe(null);
            setActiveSizes([]);
            setSelectedConcentrado('');
            setManualPigments({});
            setModType('original');
            setPctDirection('mas');
            setPctValue('');
            setExtraPigments({});
            setSelectedExtraConcentrado('');

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
            console.error('Error al eliminar el registro:', err);
            toast.error('Error al eliminar el registro.');
        }
    };

    // Filter registrations by search text
    const filteredRegistrations = registrations.filter(r => {
        if (!registrationsSearch.trim()) return true;
        const q = registrationsSearch.toLowerCase();
        const terms = q.split(/\s+/).filter(Boolean);
        
        return terms.every(term => {
            const idMatch = r.id?.toLowerCase().includes(term) || r.identification_id?.toLowerCase().includes(term) || (r.num_id && String(r.num_id).includes(term));
            const nameMatch = r.color_name?.toLowerCase().includes(term);
            const clientMatch = r.client_name?.toLowerCase().includes(term);
            const codeMatch = r.color_code?.toLowerCase().includes(term);
            const prodMatch = r.products?.description?.toLowerCase().includes(term) || r.products?.code?.toLowerCase().includes(term);
            const userMatch = r.target_user?.username?.toLowerCase().includes(term);
            const creatorMatch = r.creator_user?.username?.toLowerCase().includes(term);
            const obraMatch = r.obra?.toLowerCase().includes(term);

            return idMatch || nameMatch || clientMatch || codeMatch || prodMatch || userMatch || creatorMatch || obraMatch;
        });
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
                {!isSucursal98 && (
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

                                {/* Active Selection Preview & Formulation Selection */}
                                {selectedTintometricColor && (
                                    <div className="space-y-4 animate-pop">
                                        <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center gap-3">
                                            <div 
                                                className="w-10 h-10 rounded-lg border border-black/10 shadow-md shrink-0" 
                                                style={{ backgroundColor: hex }}
                                            />
                                            <div className="flex-grow min-w-0">
                                                <div className="text-xs font-black text-blue-950 truncate leading-tight">{colorName}</div>
                                                <div className="text-[10px] font-bold text-blue-600/70 font-mono tracking-wider">Código: {colorCode}</div>
                                            </div>
                                        </div>

                                        {/* Formula Selection Dropdowns */}
                                        {loadingFormula ? (
                                            <div className="flex justify-center py-4">
                                                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"></div>
                                            </div>
                                        ) : recipes.length > 0 ? (
                                            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                
                                                {/* Select Product */}
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Producto de la Fórmula</label>
                                                    <select
                                                        value={selectedProductId}
                                                        onChange={(e) => {
                                                            const newId = e.target.value;
                                                            setSelectedProductId(newId);
                                                            const r = recipes.find(rec => rec.productId === Number(newId));
                                                            if (r) {
                                                                const sizes = getProductSizes(r.productId, r.base);
                                                                if (sizes.length > 0) {
                                                                    const firstSize = sizes[0];
                                                                    const rawVal = firstSize.capacidad_real !== undefined && firstSize.capacidad_real !== null ? firstSize.capacidad_real : firstSize.capacidad_litros;
                                                                    const val = rawVal >= 100 ? rawVal / 1000 : rawVal;
                                                                    setSelectedCanSize(val);
                                                                }
                                                            }
                                                        }}
                                                        className="w-full text-xs p-2.5 border border-gray-200 rounded-lg bg-white font-bold text-gray-700 focus:outline-none cursor-pointer"
                                                    >
                                                        {recipes.map((r) => (
                                                            <option key={r.productId} value={r.productId}>
                                                                {r.productName} {r.sistemaTintometrico ? `(${r.sistemaTintometrico})` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Select Capacity */}
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Capacidad del Envase</label>
                                                    <select
                                                        value={selectedCanSize}
                                                        onChange={(e) => setSelectedCanSize(Number(e.target.value))}
                                                        className="w-full text-xs p-2.5 border border-gray-200 rounded-lg bg-white font-bold text-gray-700 focus:outline-none cursor-pointer"
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

                                                {/* Base badge and matched main DB product status */}
                                                {activeRecipe && (
                                                    <div className="flex items-center justify-between pt-2 border-t border-gray-200 text-xs">
                                                        <div className="flex items-center gap-1 text-gray-500 font-bold">
                                                            <span>Base Requerida:</span>
                                                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                                                                {activeRecipe.base}
                                                            </span>
                                                        </div>

                                                        {selectedProduct ? (
                                                            <span className="text-[10px] font-bold text-green-600 flex items-center gap-1">
                                                                <Check className="w-3.5 h-3.5" /> Vinculado a Stock
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1" title="El código no se encontró en la lista general de productos.">
                                                                <AlertCircle className="w-3.5 h-3.5" /> Código no vinculado
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Pigs List preview */}
                                                {activeRecipe && activeRecipe.pigments && (
                                                    <div className="pt-2.5 space-y-1.5">
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Vista Previa de Dosificación:</span>
                                                        <div className="bg-white rounded-lg border border-gray-150 p-2 divide-y divide-gray-100 max-h-36 overflow-y-auto">
                                                            {activeRecipe.pigments.map((pig, idx) => {
                                                                const displayQty = (pig.cantidad * selectedCanSize).toFixed(2).replace('.', ',');
                                                                return (
                                                                    <div key={idx} className="flex justify-between items-center py-1 text-[11px] font-semibold">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            <div className="w-2.5 h-2.5 rounded-full border border-gray-200 shadow-sm shrink-0" style={{ backgroundColor: pig.hex || '#64748b' }} />
                                                                            <span className="truncate text-gray-700">{pig.name || pig.code}</span>
                                                                        </div>
                                                                        <span className="font-mono text-gray-900 font-black shrink-0">{displayQty} imp.</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                            </div>
                                        ) : (
                                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
                                                <span className="text-xs text-amber-700 font-bold">No se encontraron fórmulas ni productos para este color.</span>
                                            </div>
                                        )}
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

                                {/* Selector de Concentrado para manual */}
                                <div className="space-y-1.5 pt-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Concentrado / Entonador</label>
                                    <div className="relative">
                                        <select
                                            value={selectedConcentrado}
                                            onChange={(e) => {
                                                setSelectedConcentrado(e.target.value);
                                                setManualPigments({}); // resetear impulsos al cambiar
                                            }}
                                            className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-bold text-gray-700 cursor-pointer appearance-none animate-in fade-in duration-200"
                                        >
                                            <option value="">-- Sin Concentrado (Solo Color) --</option>
                                            {Object.values(CONCENTRADOS_PREDEFINIDOS).map((conc) => (
                                                <option key={conc.id} value={conc.id}>
                                                    {conc.nombre}
                                                </option>
                                            ))}
                                        </select>
                                        <Palette className="absolute left-3 top-3.5 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                                        <ChevronDown className="absolute right-3 top-3.5 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Inputs para los impulsos de cada pigmento si se seleccionó concentrado */}
                                {selectedConcentrado && (
                                    <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200 animate-pop">
                                        <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Impulsos por Pigmento</span>
                                            <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.5 rounded uppercase font-mono">
                                                Unidad: Impulsos
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                                            {CONCENTRADOS_PREDEFINIDOS[selectedConcentrado].pigmentos.map((pig) => (
                                                <div key={pig.codigo} className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <div 
                                                            className="w-2.5 h-2.5 rounded-full border border-gray-200 shadow-sm shrink-0" 
                                                            style={{ backgroundColor: pig.hex }}
                                                        />
                                                        <span className="text-[10px] font-bold text-gray-750 truncate" title={pig.nombre}>
                                                            {pig.nombre}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.0001"
                                                        value={manualPigments[pig.codigo] || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setManualPigments(prev => ({
                                                                ...prev,
                                                                [pig.codigo]: val
                                                            }));
                                                        }}
                                                        className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white font-mono font-bold text-right"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Searchable Product Selector (Common for both manual and tintometric modes) */}
                        <div className="space-y-1.5 animate-in fade-in duration-300" ref={productDropdownRef}>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                                {colorType === 'tintometrico' ? 'Producto en Inventario (Auto-detectado o busca otro)' : '¿En qué producto se preparó?'}
                            </label>
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
                                    <div className="text-xs font-bold text-gray-850 truncate leading-tight">{selectedProduct.description}</div>
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

                        {/* Obra Input */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Obra</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={obra}
                                    onChange={(e) => setObra(e.target.value)}
                                    className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-bold text-gray-800"
                                    placeholder="Obra a la que pertenece (opcional)..."
                                />
                                <Building className="absolute left-3 top-3.5 w-4.5 h-4.5 text-gray-400" />
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

                        {/* Ajustes de Fórmula / Modificaciones */}
                        {colorType === 'tintometrico' && (
                            <div className="space-y-2.5 pt-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Ajuste / Modificación de Fórmula</label>
                                
                                {/* Chips selectores */}
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setModType('original')}
                                        className={`py-2 px-3 text-[11px] font-bold rounded-xl border transition-all text-center cursor-pointer ${
                                            modType === 'original'
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                                : 'bg-slate-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                        }`}
                                    >
                                        Fórmula Original
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModType('extras')}
                                        className={`py-2 px-3 text-[11px] font-bold rounded-xl border transition-all text-center cursor-pointer ${
                                            modType === 'extras'
                                                ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm'
                                                : 'bg-slate-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                        }`}
                                    >
                                        Colorantes Extras
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModType('porcentaje')}
                                        className={`py-2 px-3 text-[11px] font-bold rounded-xl border transition-all text-center cursor-pointer ${
                                            modType === 'porcentaje'
                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm'
                                                : 'bg-slate-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                        }`}
                                    >
                                        Ajustar % Conc.
                                    </button>
                                </div>

                                {/* Controles condicionales para ajuste por porcentaje */}
                                {modType === 'porcentaje' && (
                                    <div className="flex items-center gap-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl animate-in slide-in-from-top duration-200">
                                        {/* Dirección */}
                                        <div className="flex bg-white rounded-lg border border-gray-200 p-0.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setPctDirection('mas')}
                                                className={`px-2.5 py-1 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                                                    pctDirection === 'mas'
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'text-gray-500 hover:bg-gray-50'
                                                }`}
                                            >
                                                MÁS (+)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPctDirection('menos')}
                                                className={`px-2.5 py-1 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                                                    pctDirection === 'menos'
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'text-gray-500 hover:bg-gray-50'
                                                }`}
                                            >
                                                MENOS (-)
                                            </button>
                                        </div>
                                        
                                        {/* Porcentaje Input */}
                                        <div className="flex items-center gap-1.5 flex-1">
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={pctValue}
                                                onChange={(e) => setPctValue(e.target.value)}
                                                className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white font-bold text-gray-800 text-center"
                                                placeholder="Ej: 10"
                                            />
                                            <span className="text-xs font-bold text-indigo-750">%</span>
                                        </div>
                                    </div>
                                )}

                                {modType === 'extras' && (
                                    <div className="space-y-3 bg-amber-50/50 border border-amber-100 rounded-xl p-3 animate-in slide-in-from-top duration-200">
                                        <div className="text-[10.5px] font-bold text-amber-800">
                                            💡 Se registrará que la fórmula tiene colorantes adicionales/extras agregados a mano además de la receta original.
                                        </div>
                                        {colorType === 'tintometrico' && (
                                            <div className="space-y-3 pt-2 border-t border-amber-200/60">
                                                {/* Selector del sistema de extras */}
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block">Sistema del Colorante Extra</label>
                                                    <div className="relative">
                                                        <select
                                                            value={selectedExtraConcentrado}
                                                            onChange={(e) => {
                                                                setSelectedExtraConcentrado(e.target.value);
                                                                setExtraPigments({});
                                                            }}
                                                            className="w-full text-xs p-2.5 pl-8 border border-amber-200 rounded-lg bg-white font-bold text-gray-750 focus:outline-none cursor-pointer appearance-none"
                                                        >
                                                            <option value="">-- Sin Colorantes Extras (Solo etiqueta) --</option>
                                                            {Object.values(CONCENTRADOS_PREDEFINIDOS).map((conc) => (
                                                                <option key={conc.id} value={conc.id}>
                                                                    {conc.nombre}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <Palette className="absolute left-2.5 top-3 w-3.5 h-3.5 text-amber-600 pointer-events-none" />
                                                        <ChevronDown className="absolute right-2.5 top-3 w-3.5 h-3.5 text-amber-600 pointer-events-none" />
                                                    </div>
                                                </div>

                                                {/* Inputs de pigmentos extras */}
                                                {selectedExtraConcentrado && CONCENTRADOS_PREDEFINIDOS[selectedExtraConcentrado] && (
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center text-[9px] font-bold text-amber-850 uppercase tracking-wider">
                                                            <span>Impulsos Extras</span>
                                                            <span className="bg-amber-100 text-amber-800 font-extrabold px-1 py-0.5 rounded text-[8px]">
                                                                {CONCENTRADOS_PREDEFINIDOS[selectedExtraConcentrado].unidad}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                                                            {CONCENTRADOS_PREDEFINIDOS[selectedExtraConcentrado].pigmentos.map((pig) => (
                                                                <div key={pig.codigo} className="flex flex-col gap-0.5">
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        <div 
                                                                            className="w-2 rounded-full border border-gray-200 shadow-sm shrink-0" 
                                                                            style={{ backgroundColor: pig.hex, height: '8px' }}
                                                                        />
                                                                        <span className="text-[9.5px] font-bold text-gray-750 truncate" title={pig.nombre}>
                                                                            {pig.nombre}
                                                                        </span>
                                                                    </div>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.0001"
                                                                        value={extraPigments[pig.codigo] || ''}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setExtraPigments(prev => ({
                                                                                ...prev,
                                                                                [pig.codigo]: val
                                                                            }));
                                                                        }}
                                                                        className="w-full text-[11px] p-1.5 border border-amber-250 rounded-md focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 outline-none bg-white font-mono font-bold text-right"
                                                                        placeholder="0"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Observations */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Observaciones adicionales</label>
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
                )}

                {/* --- Right Column: Colors Registrations List (7 cols) --- */}
                <div className={`${isSucursal98 ? 'lg:col-span-12' : 'lg:col-span-7'} flex flex-col space-y-4`}>
                    
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

                        <div className="flex items-center gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAllPrices(prev => !prev);
                                    if (showAllPrices) setVisiblePrices({});
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                    showAllPrices
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm'
                                        : 'bg-slate-50 border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                }`}
                                title={showAllPrices ? 'Ocultar todos los precios' : 'Mostrar todos los precios'}
                            >
                                <DollarSign className="w-3.5 h-3.5" />
                                {showAllPrices ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center gap-2">
                                <span>Total Registrados:</span>
                                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-black">
                                    {filteredRegistrations.length}
                                </span>
                            </div>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
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
                                            <h3 className="text-xs font-black truncate leading-tight tracking-wide drop-shadow" title={item.num_id ? `Nº ${item.num_id} - ${item.identification_id}` : item.identification_id}>
                                                {item.num_id ? `Nº ${item.num_id} - ` : ''}{item.identification_id}
                                            </h3>
                                            <span className="text-[8.5px] font-bold opacity-80 uppercase tracking-widest font-mono drop-shadow">
                                                {item.color_code ? `Código: ${item.color_code}` : 'Preparado Manual'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Registration Details */}
                                    <div className="p-4 flex-grow flex flex-col justify-between space-y-4">
                                        <div className="space-y-2.5 text-xs text-gray-700">
                                            
                                            {/* Product & Capacity */}
                                            {item.products ? (
                                                <div className="flex gap-2 items-start">
                                                    <ShoppingBag className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-bold text-gray-900 leading-tight truncate">
                                                            {item.products.description}
                                                        </div>
                                                        {item.formula?.productName && (
                                                            <div className="text-[10px] text-indigo-700 font-bold mt-1 bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                                                <Palette className="w-3 h-3 text-indigo-500" />
                                                                <span>Fórmula: {item.formula.productName}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400 mt-1.5">
                                                            <span className="font-mono">Código: {item.products.code}</span>
                                                            {item.products.brand && (
                                                                <span className="bg-gray-100 text-gray-600 px-1 py-0.5 rounded text-[8px] font-extrabold uppercase">
                                                                    {item.products.brand}
                                                                </span>
                                                            )}
                                                            {item.capacity_real && (
                                                                <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">
                                                                    {String(item.capacity_real).replace('.', ',')} Litros
                                                                </span>
                                                            )}
                                                            {item.base && (
                                                                <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">
                                                                    Base {item.base}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex gap-2 items-center text-gray-400 italic">
                                                        <ShoppingBag className="w-4 h-4 shrink-0" />
                                                        <span>Sin producto especificado</span>
                                                    </div>
                                                    {item.formula?.productName && (
                                                        <div className="pl-6">
                                                            <div className="text-[10px] text-indigo-700 font-bold bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                                                <Palette className="w-3 h-3 text-indigo-500" />
                                                                <span>Fórmula: {item.formula.productName}</span>
                                                            </div>
                                                        </div>
                                                    )}
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

                                            {/* Obra */}
                                            {item.obra && (
                                                <div className="flex gap-2 items-center">
                                                    <Building className="w-4 h-4 text-gray-400 shrink-0" />
                                                    <div className="truncate">
                                                        <span className="font-semibold text-gray-500">Obra:</span>{' '}
                                                        <span className="font-bold text-gray-900">{item.obra}</span>
                                                    </div>
                                                </div>
                                            )}

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
                                            {renderObservations(item.observations)}

                                            {/* Price Display */}
                                            {(item.precio_total_ars != null || item.products?.precio_ars != null) && (
                                                <div className="mt-1">
                                                    {(showAllPrices || visiblePrices[item.id]) ? (
                                                        <div className="flex flex-col gap-1.5 p-2.5 bg-emerald-50/70 rounded-lg border border-emerald-100 animate-in fade-in duration-200">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-1">
                                                                    <DollarSign className="w-4 h-4 text-emerald-600" />
                                                                    <span className="text-sm font-black text-emerald-800 tracking-tight">
                                                                        ${(item.precio_total_ars ?? item.products?.precio_ars ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                                {!showAllPrices && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setVisiblePrices(prev => ({ ...prev, [item.id]: false }))}
                                                                        className="p-1 rounded-md text-emerald-500 hover:bg-emerald-100 transition-colors cursor-pointer"
                                                                        title="Ocultar precio"
                                                                    >
                                                                        <EyeOff className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {item.precio_pigmentos_ars > 0 && (
                                                                <div className="flex flex-col text-[9.5px] text-emerald-700/80 font-bold border-t border-emerald-100/50 pt-1 mt-0.5 space-y-0.5">
                                                                    <div className="flex justify-between">
                                                                        <span>Pintura Base:</span>
                                                                        <span>${item.precio_base_ars?.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span>Colorantes / Pigmentos:</span>
                                                                        <span>+${item.precio_pigmentos_ars?.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setVisiblePrices(prev => ({ ...prev, [item.id]: true }))}
                                                            className="w-full flex items-center justify-center gap-1.5 p-1.5 bg-gray-50/70 hover:bg-emerald-50 rounded-lg border border-gray-100 hover:border-emerald-200 text-gray-400 hover:text-emerald-600 transition-all cursor-pointer text-[10px] font-bold"
                                                        >
                                                            <DollarSign className="w-3 h-3" />
                                                            <span>Ver precio</span>
                                                            <Eye className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* Collapsible Formula Viewer (For formulas with pigments saved) */}
                                            {item.formula?.pigmentos && (
                                                <div className="mt-2 border border-gray-100 rounded-lg overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedFormulaId(expandedFormulaId === item.id ? null : item.id)}
                                                        className="w-full flex items-center justify-between p-2 bg-gray-50/70 hover:bg-gray-100 text-gray-600 font-bold transition-colors cursor-pointer text-[10px]"
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <Palette className="w-3.5 h-3.5 text-gray-400" />
                                                            {expandedFormulaId === item.id ? 'Ocultar Fórmula' : 'Ver Fórmula de Pigmentos'}
                                                        </span>
                                                        {expandedFormulaId === item.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </button>

                                                    {expandedFormulaId === item.id && (
                                                        <div className="bg-white p-2 divide-y divide-gray-50 text-[10.5px] font-semibold animate-in fade-in duration-200">
                                                            {item.formula.pigmentos.map((pig, idx) => (
                                                                <div key={idx} className="flex justify-between items-center py-1">
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        <div className="w-2.5 h-2.5 rounded-full border border-gray-200 shadow-sm shrink-0" style={{ backgroundColor: pig.hex || '#64748b' }} />
                                                                        <span className="truncate text-gray-700">{pig.nombre || pig.name || pig.codigo || pig.code}</span>
                                                                    </div>
                                                                    <span className="font-mono text-gray-900 font-black shrink-0">
                                                                        {String(pig.cantidad).replace('.', ',')} {pig.unidad === 'unidades' || pig.unidad === 'un.' ? 'impulsos' : (pig.unidad === 'impulsos' ? 'impulsos' : pig.unidad || 'impulsos')}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                            
                                                            {/* Extra pigments display */}
                                                            {item.formula.pigmentos_extras && item.formula.pigmentos_extras.length > 0 && (
                                                                <div className="pt-1.5 mt-1 border-t border-dashed border-gray-200">
                                                                    <div className="text-[9px] text-amber-700 font-black uppercase tracking-wider mb-1 flex items-center gap-1">
                                                                        <span>➕ Colorantes Adicionales (Extras):</span>
                                                                    </div>
                                                                    {item.formula.pigmentos_extras.map((pig, idx) => (
                                                                        <div key={`extra-${idx}`} className="flex justify-between items-center py-1 text-amber-900">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <div className="w-2 rounded-full border border-gray-200 shadow-sm shrink-0 animate-pulse" style={{ backgroundColor: pig.hex || '#64748b', height: '8px' }} />
                                                                                <span className="truncate font-bold">{pig.nombre || pig.name || pig.codigo || pig.code}</span>
                                                                            </div>
                                                                            <span className="font-mono font-black shrink-0">
                                                                                +{String(pig.cantidad).replace('.', ',')} {pig.unidad === 'unidades' || pig.unidad === 'un.' ? 'impulsos' : (pig.unidad === 'impulsos' ? 'impulsos' : pig.unidad || 'impulsos')}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
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
                                            {user && (item.created_by === user.id || user.role === 'superadmin') && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteRegistration(item.id, item.identification_id)}
                                                    className="p-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm cursor-pointer"
                                                    title="Eliminar registro"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
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
