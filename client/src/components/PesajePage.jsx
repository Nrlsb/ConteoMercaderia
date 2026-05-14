import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Scale, Search, Save, Trash2, Cable, Zap, ZapOff, Package, Clock, History, ChevronRight, X, RefreshCw, Plus, Upload } from 'lucide-react';

import { toast } from 'sonner';
import api from '../api';
import { useProductSync } from '../hooks/useProductSync';
import { useAuth } from '../context/AuthContext';
import { db } from '../db';
import { ArrowRight } from 'lucide-react';

// Grupos eliminados (ahora se gestionan por producto en la DB)

// Mapeo de sucursales a grupos
const BRANCH_GROUP_MAP = {
    // Ejemplo: Sucursales que cuentan Hogar y Obra
    'Sucursal 01': 'Hogar y Obra',
    'Sucursal 02': 'Hogar y Obra',
    'Sucursal 03': 'Hogar y Obra',
    'Sucursal 04': 'Hogar y Obra',
    'Sucursal 05': 'Hogar y Obra',
    'Sucursal 07': 'Hogar y Obra',
    'Sucursal 08': 'Hogar y Obra',
    'Sucursal 09': 'Hogar y Obra',
    'Sucursal 10': 'Hogar y Obra',
    'Sucursal 11': 'Hogar y Obra',
    'Sucursal 12': 'Hogar y Obra',
    'Sucursal 15': 'Hogar y Obra',
    'Sucursal 16': 'Hogar y Obra',
    'Sucursal 17': 'Hogar y Obra',
    'Sucursal 20': 'Hogar y Obra',
    'Sucursal 21': 'Hogar y Obra',
    'Sucursal 24': 'Hogar y Obra',
    'Sucursal 25': 'Hogar y Obra',
    'Sucursal 26': 'Hogar y Obra',
    'Sucursal 27': 'Hogar y Obra',
    'Sucursal 28': 'Hogar y Obra',
    'Sucursal 29': 'Hogar y Obra',
    'Sucursal 30': 'Hogar y Obra',
    'Sucursal 31': 'Hogar y Obra',
    'Sucursal 32': 'Hogar y Obra',
    'Sucursal 33': 'Hogar y Obra',

    // Ejemplo: Sucursales que cuentan Automotor
    'Sucursal 13': 'Automotor',
    'Sucursal 22': 'Automotor',
    'Sucursal 23': 'Automotor',

    // Puedes seguir agregando el resto aquí...
};

const PesajePage = () => {
    const [weight, setWeight] = useState(0);
    const [unit, setUnit] = useState('g');
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [port, setPort] = useState(null);
    const [reader, setReader] = useState(null);


    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [recentMeasurements, setRecentMeasurements] = useState([]);
    const [isLoadingRecent, setIsLoadingRecent] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Group differentiation logic
    const [overrideGroup, setOverrideGroup] = useState(null);
    const { user } = useAuth();
    const currentGroup = overrideGroup || BRANCH_GROUP_MAP[user?.sucursal_name] || 'Automotor';

    // Hogar y Obra specific state
    const [un1Value, setUn1Value] = useState('0'); // Cerradas
    const [un2Value, setUn2Value] = useState('0'); // Impulsos
    const [cmValue, setCmValue] = useState('');
    const [calculatedUnits, setCalculatedUnits] = useState(0);
    
    // Hogar y Obra List Mode
    const [hogarColorants, setHogarColorants] = useState([]);
    const [listInputs, setListInputs] = useState({}); // { code: { un1, cm, un2, total } }
    const [isLoadingList, setIsLoadingList] = useState(false);
    const [focusedRowCode, setFocusedRowCode] = useState(null);
    const [activeCounts, setActiveCounts] = useState([]);
    const [selectedCount, setSelectedCount] = useState(null);
    const un2Refs = useRef({});

    const [baudRate, setBaudRate] = useState(2400);
    const [parity, setParity] = useState('odd');
    const [dataBits, setDataBits] = useState(7);
    const [stopBits, setStopBits] = useState(1);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [rawData, setRawData] = useState('');
    const { searchProductsLocally } = useProductSync();

    const bufferRef = useRef('');
    const searchTimeoutRef = useRef(null);


    // Fetch recent measurements on mount
    const fetchRecentMeasurements = useCallback(async () => {
        setIsLoadingRecent(true);
        try {
            const res = await api.get('/api/measurements');
            setRecentMeasurements(res.data);
        } catch (error) {
            console.error('Error fetching measurements:', error);
            toast.error('Error al cargar historial de colorantes');
        } finally {
            setIsLoadingRecent(false);
        }
    }, []);

    useEffect(() => {
        fetchRecentMeasurements();
    }, [fetchRecentMeasurements]);

    useEffect(() => {
        const fetchActiveCounts = async () => {
            try {
                // NEW: Endpoint separado para colorantes
                const res = await api.get('/api/measurements/dye-counts/active');
                setActiveCounts(Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []));
            } catch (error) {
                console.error('Error fetching dye counts:', error);
            }
        };
        fetchActiveCounts();
        const interval = setInterval(fetchActiveCounts, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleImportExcel = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        const toastId = toast.loading('Procesando Excel de colorantes...');
        try {
            const res = await api.post('/api/measurements/import-dye-excel', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success(res.data.message, { id: toastId });
            
            // Refrescar y seleccionar el nuevo
            const updatedCountsRes = await api.get('/api/measurements/dye-counts/active');
            const updatedCounts = updatedCountsRes.data;
            setActiveCounts(updatedCounts);
            
            const newCount = updatedCounts.find(c => c.id === res.data.countId);
            if (newCount) setSelectedCount(newCount);
            
            // Limpiar input
            e.target.value = '';
        } catch (error) {
            console.error('Error importing dye excel:', error);
            const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Error al importar el archivo';
            toast.error(errorMsg, { id: toastId });
        }
    };

    // USB/Serial Connection Logic
    const connectToScale = async () => {
        if (!navigator.serial) {
            toast.error('Web Serial no está soportado en este navegador/dispositivo. Use Chrome o Edge.');
            return;
        }

        setIsConnecting(true);
        try {
            const selectedPort = await navigator.serial.requestPort();
            await selectedPort.open({
                baudRate: baudRate,
                parity: parity,
                dataBits: dataBits,
                stopBits: stopBits
            });



            setPort(selectedPort);
            setIsConnected(true);
            toast.success('Balanza conectada por USB');

            readSerialData(selectedPort);

            selectedPort.addEventListener('disconnect', () => {
                setIsConnected(false);
                setPort(null);
                setReader(null);
                toast.warning('Balanza desconectada');
            });

        } catch (error) {
            console.error('Serial Error:', error);
            if (error.name !== 'NotFoundError') {
                toast.error('Error al conectar con la balanza USB');
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnectScale = async () => {
        if (reader) {
            await reader.cancel();
        }
        if (port) {
            await port.close();
        }
        setIsConnected(false);
        setPort(null);
        setReader(null);
    };

    const readSerialData = async (activePort) => {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = activePort.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        setReader(reader);

        try {
            while (true) {
                try {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value) {
                        // Guardamos en el buffer para procesar líneas completas
                        bufferRef.current += value;

                        // Convertimos a Hex para el visor RAW
                        const hexVal = Array.from(value).map(char => {
                            const code = char.charCodeAt(0);
                            return (code < 32 || code > 126) ? `[${code.toString(16).toUpperCase()}]` : char;
                        }).join('');

                        setRawData(prev => (prev + hexVal).slice(-100));

                        // Procesamos líneas completas (terminadas en \n o \r)
                        if (bufferRef.current.includes('\n') || bufferRef.current.includes('\r')) {
                            const lines = bufferRef.current.split(/[\r\n]+/);
                            // Mantenemos el último fragmento incompleto en el buffer
                            bufferRef.current = lines.pop() || '';

                            // Procesamos cada línea completa
                            for (const line of lines) {
                                if (line.trim()) {
                                    handleWeightData(line);
                                }
                            }
                        }
                    }
                } catch (readError) {
                    if (readError.name === 'BreakError') continue;
                    if (readError.name === 'FramingError' || readError.name === 'ParityError') {
                        // Intentamos limpiar los datos crudos para ver si algo pasa
                        setRawData(prev => prev + '[ERR]');
                        continue;
                    }
                    throw readError;
                }
            }
        } catch (error) {
            console.error('Serial Fatal Error:', error);
            if (isConnected) {
                toast.error('Error crítico en la lectura USB.');
                disconnectScale();
            }
        } finally {
            reader.releaseLock();
        }
    };

    const getCapacityFromDescription = (desc) => {
        if (!desc) return 1;
        // Buscamos patrones como "500G", "1KG", "0.5KG", "250ML", etc.
        const match = desc.match(/(\d+(?:\.\d+)?)\s*(G|KG|ML|L)/i);
        if (match) {
            let value = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit === 'G' || unit === 'ML') return value / 1000;
            return value;
        }
        return 1; // Default 1kg
    };

    const handleUn2KeyDown = (e, code, index) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            // Guardar fila actual
            const product = hogarColorants.find(p => p.code === code);
            if (product) saveRow(product);

            // Mover el foco al siguiente producto
            const nextProduct = hogarColorants[index + 1];
            if (nextProduct) {
                const nextRef = un2Refs.current[nextProduct.code];
                if (nextRef) {
                    nextRef.focus();
                    nextRef.select();
                    setFocusedRowCode(nextProduct.code);
                }
            } else {
                toast.info('Fin de la lista');
            }
        }
    };

    const requestWeightManual = async () => {
        if (!port || !port.writable) {
            toast.error('Balanza no conectada o puerto no escribible');
            return;
        }

        const writer = port.writable.getWriter();
        try {
            // Comando ESC P (Standard Sartorius Interface Command)
            // ESC=0x1B, P=0x50, CR=0x0D, LF=0x0A
            const command = new Uint8Array([0x1B, 0x50, 0x0D, 0x0A]);
            await writer.write(command);
        } catch (error) {
            console.error('Error enviando comando a balanza:', error);
            toast.error('Error al solicitar peso');
        } finally {
            writer.releaseLock();
        }
    };

    const handleWeightData = (line) => {
        // Sartorius SBI Format: "+      123.45 g  "
        // Buscamos el número (con signo y decimal) y la unidad (g, kg, lb, oz, t)
        const weightMatch = line.match(/[+-]?\s*([0-9]+\.[0-9]+|[0-9]+)/);
        const unitMatch = line.match(/(g|kg|lb|oz|t)\b/i);

        if (weightMatch) {
            const rawValue = weightMatch[0].replace(/\s+/g, '');
            let val = parseFloat(rawValue);

            // Detectamos la unidad y ajustamos el valor si es necesario
            if (unitMatch) {
                const detectedUnit = unitMatch[0].toLowerCase();
                if (detectedUnit !== unit) {
                    setUnit(detectedUnit);
                }
            }

            if (!isNaN(val) && Math.abs(val - weight) > 0.00001) {
                setWeight(val);
                // Si estamos en Automotor y hay una fila enfocada, actualizamos su UN2 (gramos)
                if (currentGroup === 'Automotor' && focusedRowCode) {
                    handleListInputChange(focusedRowCode, 'un2', val.toString());
                }
            }
        }
    };

    // Hogar y Obra Calculator Logic
    useEffect(() => {
        if (currentGroup === 'Hogar y Obra') {
            const un1 = parseFloat(un1Value) || 0;
            const un2 = parseFloat(un2Value) || 0;
            
            // Si el usuario ingresa CM, actualizamos UN2 (impulses)
            // Esto se manejará en el onChange del CM input
            
            const total = un1 + (un2 / 2200);
            setCalculatedUnits(total);
            setWeight(total);
            setUnit('un');
        }
    }, [un1Value, un2Value, currentGroup]);

    // Fetch colorants for the current group list
    useEffect(() => {
        const loadList = async () => {
            setIsLoadingList(true);
            try {
                let colorants = [];
                if (selectedCount) {
                    // NEW: Endpoint separado para productos de colorantes
                    const res = await api.get(`/api/measurements/dye-counts/${selectedCount.id}/products`);
                    colorants = res.data.products || [];
                } else if (currentGroup) {
                    colorants = await db.products
                        .where('counting_category')
                        .equals(currentGroup)
                        .toArray();
                    colorants.sort((a, b) => a.description.localeCompare(b.description));
                }
                
                setHogarColorants(colorants);
                
                // Initialize inputs
                const initialInputs = {};
                colorants.forEach(p => {
                    initialInputs[p.code] = { un1: '', cm: '', impExtra: '', un2: 0, total: 0 };
                });
                setListInputs(initialInputs);
            } catch (error) {
                console.error("Error loading colorant list:", error);
            } finally {
                setIsLoadingList(false);
            }
        };
        loadList();
    }, [currentGroup, selectedCount]);

    const handleListInputChange = (code, field, value) => {
        setListInputs(prev => {
            const current = { ...prev[code], [field]: value };
            
            // Evaluar expresiones matemáticas para los cálculos
            const un1 = evaluateMath(current.un1);
            
            if (currentGroup === 'Hogar y Obra') {
                const cm = evaluateMath(current.cm);
                const impExtra = evaluateMath(current.impExtra);
                const un2FromCm = Math.round(cm * 220);
                const un2 = un2FromCm + impExtra;
                const total = un1 + (un2 / 2200);
                return {
                    ...prev,
                    [code]: { ...current, un2, total }
                };
            } else {
                // Automotor
                const un2 = parseFloat(current.un2) || 0; // Gramos de la balanza
                const product = hogarColorants.find(p => p.code === code);
                const capacity = getCapacityFromDescription(product?.description || '');
                const total = un1 + (un2 / 1000 / capacity);
                return {
                    ...prev,
                    [code]: { ...current, un2, total }
                };
            }
        });
    };

    const handleInputBlur = (code, field) => {
        // Al salir del campo, convertimos la fórmula en el resultado final
        setListInputs(prev => {
            const val = prev[code][field];
            if (typeof val === 'string' && (val.includes('+') || val.includes('*'))) {
                const result = evaluateMath(val);
                return {
                    ...prev,
                    [code]: { ...prev[code], [field]: result.toString() }
                };
            }
            return prev;
        });
    };

    const saveRow = async (product) => {
        const values = listInputs[product.code];
        if (!values || (parseFloat(values.un1) === 0 && parseFloat(values.cm) === 0)) {
            toast.error('Ingrese valores para guardar');
            return;
        }

        try {
            // Guardar en el historial de mediciones
            await api.post('/api/measurements', {
                productCode: product.code,
                productDescription: product.description,
                weight: values.total,
                unit: 'un',
                metadata: {
                    un1: parseFloat(values.un1) || 0,
                    un2: values.un2,
                    impExtra: currentGroup === 'Hogar y Obra' ? (parseFloat(values.impExtra) || 0) : null,
                    cmValue: currentGroup === 'Hogar y Obra' ? values.cm : null,
                    group: currentGroup,
                    conteoId: selectedCount?.id || null
                }
            });

            // Si hay un conteo activo de colorantes, podríamos guardar el progreso aquí si fuera necesario.
            // Por ahora, el historial de measurements ya incluye el conteoId.
            // Si en el futuro se requiere una tabla dye_count_scans, se añadiría aquí.

            toast.success(`${product.description} guardado`);
            fetchRecentMeasurements();
        } catch (error) {
            console.error('Error al guardar:', error);
            toast.error('Error al guardar fila');
        }
    };

    const handleCmChange = (val) => {
        setCmValue(val);
        if (val) {
            const impulses = Math.round(parseFloat(val) * 220);
            setUn2Value(impulses.toString());
        }
    };

    // Helper to evaluate math expressions safely (only +, *, ., and numbers)
    const evaluateMath = (str) => {
        if (!str) return 0;
        try {
            // Limpiar espacios y validar caracteres permitidos
            const cleanStr = str.replace(/\s+/g, '');
            if (!/^[0-9+\-*./()]+$/.test(cleanStr)) {
                return parseFloat(cleanStr) || 0;
            }
            // Evaluación simple usando Function (seguro tras el regex)
            return new Function(`return ${cleanStr}`)();
        } catch (e) {
            return parseFloat(str) || 0;
        }
    };

    // Product Search Logic
    const handleSearch = async (value) => {
        setSearchQuery(value);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (!value || value.length < 2) {
            setSuggestions([]);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                let results = await searchProductsLocally(value);

                // Filtrar por sucursal si es necesario (Superadmin ve todo)
                const userBranch = user?.sucursal_name;
                const groupName = BRANCH_GROUP_MAP[userBranch];

                if (user?.role !== 'superadmin' && groupName) {
                    results = results.filter(p => p.counting_category === groupName);
                }

                setSuggestions(results.slice(0, 8));
            } catch (error) {
                console.error('Search error:', error);
            }
        }, 300);
    };

    const handleSaveMeasurement = async () => {
        if (!selectedProduct) {
            toast.error('Seleccione un producto primero');
            return;
        }
        if (weight === 0) {
            toast.error('El peso no puede ser 0');
            return;
        }

        setIsSaving(true);
        try {
            await api.post('/api/measurements', {
                productCode: selectedProduct.code,
                productDescription: selectedProduct.description,
                weight: weight,
                unit: unit,
                metadata: {
                    un1: currentGroup === 'Hogar y Obra' ? parseFloat(un1Value) : null,
                    un2: currentGroup === 'Hogar y Obra' ? parseFloat(un2Value) : null,
                    cmValue: currentGroup === 'Hogar y Obra' ? cmValue : null,
                    group: currentGroup
                }
            });
            toast.success('Registro guardado correctamente');
            fetchRecentMeasurements();
            // Reset for next
            setSelectedProduct(null);
            setSearchQuery('');
            setCmValue('');
            setUn1Value('0');
            setUn2Value('0');
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Error al guardar el conteo');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearAll = async () => {
        if (window.confirm('¿Desea limpiar todos los campos e historial? Esta acción borrará permanentemente los registros de hoy.')) {
            if (currentGroup === 'Hogar y Obra') {
                const initialInputs = {};
                hogarColorants.forEach(p => {
                    initialInputs[p.code] = { un1: '', cm: '', impExtra: '', un2: 0, total: 0 };
                });
                setListInputs(initialInputs);
            }
            
            // Limpiar estados individuales
            setUn1Value('0');
            setUn2Value('0');
            setCmValue('');
            setWeight(0);
            setSelectedProduct(null);
            setSearchQuery('');

            // Limpiar historial de la base de datos
            if (recentMeasurements.length > 0) {
                try {
                    const ids = recentMeasurements.map(m => m.id);
                    await Promise.all(ids.map(id => api.delete(`/api/measurements/${id}`)));
                    fetchRecentMeasurements();
                } catch (error) {
                    console.error('Error clearing history:', error);
                    toast.error('Error al limpiar parte del historial');
                }
            }
            
            toast.success('Todo ha sido limpiado');
        }
    };

    const handleDeleteMeasurement = async (ids) => {
        if (!Array.isArray(ids)) ids = [ids];
        try {
            await Promise.all(ids.map(id => api.delete(`/api/measurements/${id}`)));
            toast.success(ids.length > 1 ? 'Registros eliminados' : 'Registro eliminado');
            fetchRecentMeasurements();
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const groupedMeasurements = useMemo(() => {
        const groups = {};
        recentMeasurements.forEach(m => {
            const key = m.product_code;
            const currentUn1 = m.metadata?.un1 || (m.metadata?.countingMode === 'closed' ? parseFloat(m.weight) : 0);
            const currentUn2 = m.metadata?.un2 || (m.metadata?.countingMode === 'machine' ? parseFloat(m.metadata?.impulses) : 0);
            const currentWeight = parseFloat(m.weight) || 0;

            if (!groups[key]) {
                groups[key] = {
                    ...m,
                    un1: currentUn1,
                    un2: currentUn2,
                    totalWeight: currentWeight,
                    ids: [m.id]
                };
            } else {
                groups[key].un1 += currentUn1;
                groups[key].un2 += currentUn2;
                groups[key].totalWeight += currentWeight;
                groups[key].ids.push(m.id);
                // Keep the latest timestamp
                if (new Date(m.timestamp) > new Date(groups[key].timestamp)) {
                    groups[key].timestamp = m.timestamp;
                }
            }
        });
        return Object.values(groups).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }, [recentMeasurements]);

    return (
        <div className="max-w-6xl mx-auto p-4 space-y-6 animate-in fade-in">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Scale className="text-blue-600" /> {currentGroup === 'Hogar y Obra' ? 'Conteo Hogar y Obra' : 'Conteo Automotor'}
                    </h1>
                    <p className="text-gray-500">{currentGroup === 'Hogar y Obra' ? 'Sistema de impulsos y unidades' : 'Pesaje por gramos y unidades cerradas'}</p>
                </div>

                <div className="flex items-center gap-3">
                    {user?.role === 'superadmin' && (
                        <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
                            <button
                                onClick={() => setOverrideGroup('Hogar y Obra')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentGroup === 'Hogar y Obra' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                HOGAR
                            </button>
                            <button
                                onClick={() => setOverrideGroup('Automotor')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentGroup === 'Automotor' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                AUTO
                            </button>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200 shadow-sm min-w-[200px]">
                            <Package className="w-4 h-4 text-blue-500 ml-3" />
                            <select
                                value={selectedCount?.id || ''}
                                onChange={(e) => {
                                    const count = activeCounts.find(c => String(c.id) === e.target.value);
                                    setSelectedCount(count || null);
                                }}
                                className="bg-transparent py-2 pr-8 pl-1 text-sm font-bold text-gray-700 outline-none cursor-pointer w-full"
                            >
                                <option value="">-- Conteo de Colorantes --</option>
                                {activeCounts.map(count => (
                                    <option key={count.id} value={count.id}>{count.name}</option>
                                ))}
                            </select>
                        </div>

                        <label className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-sm cursor-pointer active:scale-95">
                            <Upload className="w-5 h-5" />
                            <span className="hidden sm:inline">Importar Excel</span>
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleImportExcel}
                                className="hidden"
                            />
                        </label>
                    </div>

                    <button
                        onClick={handleClearAll}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white text-red-600 rounded-xl font-bold hover:bg-red-50 transition-all border border-gray-200 shadow-sm active:scale-95"
                    >
                        <Trash2 className="w-5 h-5" />
                        <span className="hidden sm:inline">Limpiar Todo</span>
                    </button>

                    {currentGroup !== 'Hogar y Obra' && (
                        <button
                            onClick={isConnected ? disconnectScale : connectToScale}
                            disabled={isConnecting}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all duration-300 shadow-sm ${isConnected
                                ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                                }`}
                        >
                            {isConnecting ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : isConnected ? (
                                <Zap className="w-5 h-5 text-green-600" />
                            ) : (
                                <Cable className="w-5 h-5" />
                            )}
                            {isConnecting ? 'Conectando...' : isConnected ? 'Balanza Conectada (USB)' : 'Conectar Balanza (USB)'}
                        </button>
                    )}

                    {currentGroup !== 'Hogar y Obra' && !isConnected && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
                                <span className="pl-3 text-xs font-bold text-gray-400 uppercase">Bauds:</span>
                                <select
                                    value={baudRate}
                                    onChange={(e) => setBaudRate(Number(e.target.value))}
                                    className="bg-transparent py-1.5 pr-8 pl-2 text-sm font-bold text-blue-600 outline-none cursor-pointer"
                                >
                                    <option value={600}>600</option>
                                    <option value={1200}>1200</option>
                                    <option value={2400}>2400</option>
                                    <option value={4800}>4800</option>
                                    <option value={9600}>9600</option>
                                    <option value={19200}>19200</option>
                                    <option value={115200}>115200</option>
                                </select>
                                <button
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="p-2 text-gray-400 hover:text-blue-600"
                                    title="Ajustes avanzados"
                                >
                                    <RefreshCw className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                                </button>
                            </div>

                            {showAdvanced && (
                                <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex flex-1 items-center gap-2 bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
                                        <span className="pl-2 text-[10px] font-bold text-gray-400 uppercase">Paridad:</span>
                                        <select
                                            value={parity}
                                            onChange={(e) => setParity(e.target.value)}
                                            className="bg-transparent py-1 pr-6 pl-1 text-xs font-bold text-gray-600 outline-none"
                                        >
                                            <option value="none">None</option>
                                            <option value="even">Even</option>
                                            <option value="odd">Odd</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-1 items-center gap-2 bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
                                        <span className="pl-2 text-[10px] font-bold text-gray-400 uppercase">Bits:</span>
                                        <select
                                            value={dataBits}
                                            onChange={(e) => setDataBits(Number(e.target.value))}
                                            className="bg-transparent py-1 pr-6 pl-1 text-xs font-bold text-gray-600 outline-none"
                                        >
                                            <option value={8}>8</option>
                                            <option value={7}>7</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-1 items-center gap-2 bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
                                        <span className="pl-2 text-[10px] font-bold text-gray-400 uppercase">Stop:</span>
                                        <select
                                            value={stopBits}
                                            onChange={(e) => setStopBits(Number(e.target.value))}
                                            className="bg-transparent py-1 pr-6 pl-1 text-xs font-bold text-gray-600 outline-none"
                                        >
                                            <option value={1}>1</option>
                                            <option value={2}>2</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Main Action Card */}
                <div className="bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden">
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            {currentGroup === 'Automotor' && (
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between mb-4 animate-in slide-in-from-top-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                                        <div>
                                            <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">Estado de Balanza</div>
                                            <div className="text-sm font-medium text-blue-700">
                                                {isConnected ? 'Sartorius Conectada' : 'Balanza Desconectada'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-2xl font-black text-blue-600 font-mono">
                                        {unit === 'g' ? weight.toFixed(1) : weight.toFixed(3)} <span className="text-sm font-bold uppercase">{unit}</span>
                                    </div>
                                </div>
                            )}

                            {/* Desktop Table View (Hidden on Mobile) */}
                            <div className="hidden md:block overflow-x-auto -mx-6">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-y border-gray-100">
                                            <th className="px-3 py-3 text-[10px] font-bold text-gray-400 uppercase w-10 text-center">Id</th>
                                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">Colorante</th>
                                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">S. Teo</th>
                                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">UN1</th>
                                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">CM</th>
                                            <th className="px-1 py-3 text-[10px] font-bold text-gray-400 uppercase text-center"></th>
                                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">Imp. Extra</th>
                                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">UN2</th>
                                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase text-right">Total</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {isLoadingList ? (
                                            <tr>
                                                <td colSpan="10" className="py-12 text-center text-gray-400">Cargando colorantes...</td>
                                            </tr>
                                        ) : hogarColorants.length === 0 ? (
                                            <tr>
                                                <td colSpan="10" className="py-12 text-center text-gray-400">No hay colorantes marcados para este grupo</td>
                                            </tr>
                                        ) : (
                                            hogarColorants.map((p, idx) => {
                                                const vals = listInputs[p.code] || { un1: '', cm: '', impExtra: '', un2: 0, total: 0 };
                                                return (
                                                    <tr key={p.code} className={`hover:bg-blue-50/20 transition-colors group ${focusedRowCode === p.code ? 'bg-blue-50/10' : ''}`}>
                                                        <td className="px-3 py-2 text-center text-[10px] font-bold text-gray-400">{idx + 1}</td>
                                                        <td className="px-4 py-2.5">
                                                            <div className="text-xs font-bold text-gray-900 leading-tight">{p.description}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">{p.code}</div>
                                                        </td>
                                                        <td className="px-2 py-2 text-center text-xs font-bold text-gray-500 bg-gray-50/50">
                                                            {p.current_stock || 0}
                                                        </td>
                                                        <td className="px-1 py-2">
                                                            <input
                                                                type="text"
                                                                value={vals.un1}
                                                                onChange={(e) => handleListInputChange(p.code, 'un1', e.target.value)}
                                                                onBlur={() => handleInputBlur(p.code, 'un1')}
                                                                onFocus={() => setFocusedRowCode(p.code)}
                                                                className="w-16 text-center text-sm font-bold bg-white border border-gray-200 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                                                placeholder="0"
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2">
                                                            {currentGroup === 'Hogar y Obra' ? (
                                                                <input
                                                                    type="text"
                                                                    value={vals.cm}
                                                                    onChange={(e) => handleListInputChange(p.code, 'cm', e.target.value)}
                                                                    onBlur={() => handleInputBlur(p.code, 'cm')}
                                                                    onFocus={() => setFocusedRowCode(p.code)}
                                                                    className="w-16 text-center text-sm font-bold bg-white border border-gray-200 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                                                    placeholder="0"
                                                                />
                                                            ) : (
                                                                <div className="w-16 text-center text-xs text-gray-300">-</div>
                                                            )}
                                                        </td>
                                                        <td className="px-0 py-2 text-center">
                                                            <ArrowRight className="w-3 h-3 text-gray-300" />
                                                        </td>
                                                        <td className="px-1 py-2 text-center">
                                                            {currentGroup === 'Hogar y Obra' ? (
                                                                <input
                                                                    type="text"
                                                                    value={vals.impExtra}
                                                                    onChange={(e) => handleListInputChange(p.code, 'impExtra', e.target.value)}
                                                                    onBlur={() => handleInputBlur(p.code, 'impExtra')}
                                                                    onFocus={() => setFocusedRowCode(p.code)}
                                                                    className="w-20 text-center text-sm font-bold bg-blue-50 border border-blue-100 text-blue-700 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                                                    placeholder="0"
                                                                />
                                                            ) : (
                                                                <div className="w-20 text-center text-xs text-gray-300">-</div>
                                                            )}
                                                        </td>
                                                        <td className="px-1 py-2 text-center">
                                                            <input
                                                                ref={el => un2Refs.current[p.code] = el}
                                                                type="text"
                                                                value={vals.un2}
                                                                onChange={(e) => handleListInputChange(p.code, 'un2', e.target.value)}
                                                                onFocus={() => setFocusedRowCode(p.code)}
                                                                onKeyDown={(e) => handleUn2KeyDown(e, p.code, idx)}
                                                                className={`w-24 text-center text-sm font-bold rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-blue-500 ${currentGroup === 'Automotor' ? 'bg-green-50 border border-green-100 text-green-700' : 'bg-transparent text-blue-600 border-none'}`}
                                                                readOnly={currentGroup === 'Hogar y Obra'}
                                                            />
                                                            <div className="text-[8px] text-gray-400 uppercase font-bold">{currentGroup === 'Automotor' ? 'Gramos' : 'UN2'}</div>
                                                        </td>
                                                        <td className="px-2 py-2 text-right">
                                                            <div className="text-sm font-black text-blue-700">{vals.total.toFixed(3)}</div>
                                                            <div className="text-[8px] text-gray-400 uppercase font-bold">Un</div>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <button
                                                                onClick={() => saveRow(p)}
                                                                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                                                title="Guardar fila"
                                                            >
                                                                <Save className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View (Hidden on Desktop) */}
                            <div className="md:hidden space-y-4">
                                {isLoadingList ? (
                                    <div className="py-12 text-center text-gray-400">Cargando colorantes...</div>
                                ) : hogarColorants.length === 0 ? (
                                    <div className="py-12 text-center text-gray-400">No hay colorantes marcados</div>
                                ) : (
                                    hogarColorants.map((p, idx) => {
                                        const vals = listInputs[p.code] || { un1: '', cm: '', impExtra: '', un2: 0, total: 0 };
                                        return (
                                            <div key={p.code} className={`bg-white border rounded-2xl p-4 shadow-sm space-y-4 transition-colors ${focusedRowCode === p.code ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-100'}`}>
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-gray-300">#{idx + 1}</span>
                                                            <div className="text-sm font-bold text-gray-900 leading-tight">{p.description}</div>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            <div className="text-[10px] text-gray-400 font-mono">{p.code}</div>
                                                            <div className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md">Stock: {p.current_stock || 0}</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => saveRow(p)}
                                                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all"
                                                    >
                                                        <Save className="w-3.5 h-3.5" /> GUARDAR
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-3 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase">UN1</label>
                                                        <input
                                                            type="text"
                                                            value={vals.un1}
                                                            onChange={(e) => handleListInputChange(p.code, 'un1', e.target.value)}
                                                            onFocus={() => setFocusedRowCode(p.code)}
                                                            className="w-full text-center text-sm font-bold bg-gray-50 border border-gray-100 rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase">{currentGroup === 'Automotor' ? '-' : 'CM'}</label>
                                                        <input
                                                            type="text"
                                                            value={vals.cm}
                                                            onChange={(e) => handleListInputChange(p.code, 'cm', e.target.value)}
                                                            onFocus={() => setFocusedRowCode(p.code)}
                                                            disabled={currentGroup === 'Automotor'}
                                                            className="w-full text-center text-sm font-bold bg-gray-50 border border-gray-100 rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-30"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase">{currentGroup === 'Automotor' ? 'Gramos' : 'Extra'}</label>
                                                        <input
                                                            ref={el => { if (currentGroup === 'Automotor') un2Refs.current[p.code] = el }}
                                                            type="text"
                                                            value={currentGroup === 'Automotor' ? vals.un2 : vals.impExtra}
                                                            onChange={(e) => handleListInputChange(p.code, currentGroup === 'Automotor' ? 'un2' : 'impExtra', e.target.value)}
                                                            onFocus={() => setFocusedRowCode(p.code)}
                                                            onKeyDown={(e) => handleUn2KeyDown(e, p.code, idx)}
                                                            className={`w-full text-center text-sm font-bold rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500 ${currentGroup === 'Automotor' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-50 text-blue-700'}`}
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between bg-blue-50/50 p-3 rounded-xl border border-blue-50">
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-blue-400 uppercase">{currentGroup === 'Automotor' ? 'Peso UN2' : 'UN2'}</span>
                                                        <span className="text-lg font-black text-blue-600 leading-none">{vals.un2}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[9px] font-bold text-blue-400 uppercase">Unidades Totales</span>
                                                        <span className="text-xl font-black text-blue-700 leading-none">{vals.total.toFixed(3)} <span className="text-[10px]">un</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                    </div>
                </div>
            </div>

            {/* History Card */}
            <div className={`bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-gray-100 flex flex-col ${currentGroup === 'Hogar y Obra' ? 'w-full min-h-[400px]' : 'h-[600px]'}`}>
                    <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <History className="text-blue-500 w-5 h-5" /> Historial de Hoy
                            </h2>
                            <button
                                onClick={fetchRecentMeasurements}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            >
                                <RefreshCw className={`w-5 h-5 ${isLoadingRecent ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        <div className="flex-grow overflow-x-hidden">
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead className="sticky top-0 bg-white shadow-sm z-10">
                                    <tr className="border-b border-gray-100">
                                        <th className="p-2 md:p-3 text-[9px] md:text-[10px] font-bold text-gray-400 uppercase w-[45%] md:w-auto">Descripción</th>
                                        <th className="p-2 md:p-3 text-[9px] md:text-[10px] font-bold text-gray-400 uppercase text-center w-[12%]">UN1</th>
                                        <th className="p-2 md:p-3 text-[9px] md:text-[10px] font-bold text-gray-400 uppercase text-center w-[13%]">UN2</th>
                                        <th className="p-2 md:p-3 text-[9px] md:text-[10px] font-bold text-gray-400 uppercase text-right w-[20%]">Total</th>
                                        <th className="p-2 md:p-3 text-[9px] md:text-[10px] font-bold text-gray-400 uppercase text-center w-[10%]"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {isLoadingRecent ? (
                                        <tr>
                                            <td colSpan="5" className="py-20">
                                                <div className="flex flex-col items-center justify-center gap-4">
                                                    <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                                                    <p className="text-gray-400 font-medium text-sm">Cargando...</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : groupedMeasurements.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="py-20 text-center px-6">
                                                <div className="flex flex-col items-center justify-center">
                                                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                                        <Scale className="w-6 h-6 text-gray-300" />
                                                    </div>
                                                    <h3 className="text-gray-900 font-bold text-sm">Sin registros</h3>
                                                    <p className="text-gray-400 text-xs">Los registros de hoy aparecerán aquí.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        groupedMeasurements.map((m) => {
                                            return (
                                                <tr key={m.product_code} className="group hover:bg-blue-50/30 transition-colors">
                                                    <td className="p-2 md:p-3 align-top">
                                                        <div className="font-bold text-gray-900 text-[11px] md:text-sm break-words leading-tight" title={m.product_description}>
                                                            {m.product_description || 'Desconocido'}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-1 md:gap-2 text-[9px] text-gray-500 mt-0.5">
                                                            <span className="font-mono">{m.product_code}</span>
                                                            <span className="text-gray-300 hidden md:inline">•</span>
                                                            <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2 md:p-3 text-center text-[11px] md:text-sm font-semibold text-gray-600">
                                                        {m.un1 > 0 ? m.un1 : '-'}
                                                    </td>
                                                    <td className="p-2 md:p-3 text-center text-[11px] md:text-sm font-semibold text-gray-600">
                                                        {m.un2 > 0 ? m.un2 : '-'}
                                                    </td>
                                                    <td className="p-2 md:p-3 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[11px] md:text-sm font-black text-blue-600">
                                                                {m.unit === 'un' ? parseFloat(m.totalWeight).toFixed(3) : parseFloat(m.totalWeight).toFixed(1)}
                                                            </span>
                                                            <span className="text-[8px] md:text-[10px] font-bold text-gray-400 uppercase leading-none">{m.unit}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2 md:p-3 text-center">
                                                        <button
                                                            onClick={() => handleDeleteMeasurement(m.ids)}
                                                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all md:opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Total registros hoy</span>
                                <span className="font-bold text-blue-600">{recentMeasurements.length}</span>
                            </div>
                        </div>
                    </div>
            </div>
        </div>
    );
};

export default PesajePage;
