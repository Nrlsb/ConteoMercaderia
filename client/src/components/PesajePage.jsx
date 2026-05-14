import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Scale, Search, Save, Trash2, Cable, Zap, ZapOff, Package, Clock, History, ChevronRight, X, RefreshCw, Plus } from 'lucide-react';

import { toast } from 'sonner';
import api from '../api';
import { useProductSync } from '../hooks/useProductSync';
import { useAuth } from '../context/AuthContext';

// Configuración de grupos de colorantes por sucursal
const COLORANT_GROUPS = {
    'Hogar y Obra': {
        brands: ['SINTEPLAST SISTEMA', 'ALBA TINTING', 'TERSUAVE SISTEMA', 'PLAVICON SISTEMA', 'EXPERTO'],
    },
    'Automotor': {
        brands: ['SINTEPLAST INDUSTRIA', 'TERSUAVE INDUSTRIA', 'NORTON'],
    }
};

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

    const handleCmChange = (val) => {
        setCmValue(val);
        if (val) {
            const impulses = Math.round(parseFloat(val) * 220);
            setUn2Value(impulses.toString());
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

                if (user?.role !== 'superadmin' && groupName && COLORANT_GROUPS[groupName]) {
                    const allowedBrands = COLORANT_GROUPS[groupName].brands;
                    results = results.filter(p =>
                        allowedBrands.includes(p.brand?.toUpperCase())
                    );
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
        <div className="max-w-4xl mx-auto p-4 space-y-6 animate-in fade-in">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Scale className="text-blue-600" /> {currentGroup === 'Hogar y Obra' ? 'Conteo Colorantes' : 'Balanza Sartorius'}
                    </h1>
                    <p className="text-gray-500">{currentGroup === 'Hogar y Obra' ? 'Sistema de impulsos y unidades' : 'Configurada para Sartorius PMA Evolution (SBI)'}</p>
                </div>

                <div className="flex items-center gap-3">
                    {user?.role === 'superadmin' && (
                        <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm mr-4">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Main Action Card */}
                <div className="bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden">
                    <div className="p-6 space-y-6">
                        {/* Dynamic UI based on Branch Group */}
                        {currentGroup === 'Hogar y Obra' ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2">
                                        <label className="block text-xs font-bold text-gray-400 uppercase">Cerradas (UN1)</label>
                                        <input
                                            type="number"
                                            value={un1Value}
                                            onChange={(e) => setUn1Value(e.target.value)}
                                            className="w-full text-2xl font-black text-blue-600 bg-white border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2">
                                        <label className="block text-xs font-bold text-gray-400 uppercase">Impulsos (UN2)</label>
                                        <input
                                            type="number"
                                            value={un2Value}
                                            onChange={(e) => setUn2Value(e.target.value)}
                                            className="w-full text-2xl font-black text-blue-600 bg-white border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
                                    <div>
                                        <label className="block text-xs font-bold text-blue-400 uppercase mb-1">Cálculo por CM (Opcional)</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={cmValue}
                                                onChange={(e) => handleCmChange(e.target.value)}
                                                placeholder="Ej: 5.5"
                                                className="w-24 text-xl font-bold text-blue-700 bg-white border border-blue-200 rounded-lg p-2 outline-none"
                                            />
                                            <span className="text-blue-400 font-bold">cm</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold text-blue-400 uppercase">Total calculado</div>
                                        <div className="text-3xl font-black text-blue-700">{calculatedUnits.toFixed(3)} <span className="text-sm font-bold">un</span></div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Automotor Mode (Original Scale UI) */
                            <div className="bg-gray-50 rounded-2xl p-8 flex flex-col items-center justify-center border border-gray-100 relative group">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest absolute top-4 left-6">Peso Actual</span>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-7xl font-black tracking-tighter transition-all duration-300 ${weight > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                                        {unit === 'g' ? weight.toFixed(1) : weight.toFixed(3)}
                                    </span>
                                    <span className="text-2xl font-bold text-gray-400">{unit}</span>
                                </div>

                                {!isConnected && (
                                    <div className="mt-4 flex gap-2">
                                        <button
                                            onClick={() => setWeight(Math.max(0, weight - 0.1))}
                                            className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                                        > -0.1 </button>
                                        <button
                                            onClick={() => setWeight(weight + 0.1)}
                                            className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                                        > +0.1 </button>
                                        <button
                                            onClick={() => setWeight(0)}
                                            className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                                        > Reset </button>
                                    </div>
                                )}

                                {isConnected && (
                                    <button
                                        onClick={requestWeightManual}
                                        className="mt-6 flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors font-bold text-sm"
                                    >
                                        <RefreshCw className="w-4 h-4" /> SOLICITAR PESO (ESC P)
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Product Search */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider">Producto a Asociar</label>
                                {currentGroup && (
                                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">
                                        Grupo: {currentGroup}
                                    </span>
                                )}
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Package className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o código..."
                                    value={searchQuery}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-lg"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => { setSearchQuery(''); setSuggestions([]); }}
                                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                )}

                                {/* Autocomplete Suggestions */}
                                {suggestions.length > 0 && (
                                    <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                        {suggestions.map((p) => (
                                            <button
                                                key={p.code}
                                                onClick={() => {
                                                    setSelectedProduct(p);
                                                    setSearchQuery(p.description);
                                                    setSuggestions([]);
                                                }}
                                                className="w-full px-4 py-3 text-left hover:bg-blue-50 flex flex-col border-b border-gray-50 last:border-0 transition-colors"
                                            >
                                                <span className="font-semibold text-gray-900">{p.description}</span>
                                                <span className="text-xs text-gray-500 font-mono">{p.code}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {selectedProduct && (
                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between animate-pop">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                                            <Package className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-blue-900 leading-tight">{selectedProduct.description}</div>
                                            <div className="text-xs text-blue-700 font-mono">{selectedProduct.code}</div>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedProduct(null)} className="text-blue-400 hover:text-blue-600 p-1">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Action Button */}
                        <button
                            onClick={handleSaveMeasurement}
                            disabled={isSaving || !selectedProduct || weight === 0}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-400 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            {isSaving ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                            GUARDAR CONTEO
                        </button>
                    </div>
                </div>

                {/* History Card */}
                <div className="bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-gray-100 flex flex-col h-[600px]">
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

                    <div className="flex-grow overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white shadow-sm z-10">
                                <tr className="border-b border-gray-100">
                                    <th className="p-3 text-[10px] font-bold text-gray-400 uppercase">Descripción</th>
                                    <th className="p-3 text-[10px] font-bold text-gray-400 uppercase text-center">UN1</th>
                                    <th className="p-3 text-[10px] font-bold text-gray-400 uppercase text-center">UN2</th>
                                    <th className="p-3 text-[10px] font-bold text-gray-400 uppercase text-right">Total</th>
                                    <th className="p-3 text-[10px] font-bold text-gray-400 uppercase text-center"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {isLoadingRecent ? (
                                    <tr>
                                        <td colSpan="5" className="py-20">
                                            <div className="flex flex-col items-center justify-center gap-4">
                                                <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                                                <p className="text-gray-400 font-medium">Cargando historial...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : recentMeasurements.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="py-20 text-center px-6">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                                    <Scale className="w-8 h-8 text-gray-300" />
                                                </div>
                                                <h3 className="text-gray-900 font-bold">Sin registros</h3>
                                                <p className="text-gray-500 text-sm">Los conteos que realices aparecerán aquí.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    groupedMeasurements.map((m) => {
                                        return (
                                            <tr key={m.product_code} className="group hover:bg-blue-50/30 transition-colors">
                                                <td className="p-3">
                                                    <div className="font-bold text-gray-900 text-sm truncate max-w-[200px]" title={m.product_description}>
                                                        {m.product_description || 'Desconocido'}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                                        <span className="font-mono">{m.product_code}</span>
                                                        <span className="text-gray-300">•</span>
                                                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center text-sm font-semibold text-gray-600">
                                                    {m.un1 > 0 ? m.un1 : '-'}
                                                </td>
                                                <td className="p-3 text-center text-sm font-semibold text-gray-600">
                                                    {m.un2 > 0 ? m.un2 : '-'}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <span className="text-sm font-black text-blue-600">
                                                        {m.unit === 'un' ? parseFloat(m.totalWeight).toFixed(3) : parseFloat(m.totalWeight).toFixed(1)}
                                                        <span className="ml-1 text-[10px] font-bold text-gray-400 uppercase">{m.unit}</span>
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button
                                                        onClick={() => handleDeleteMeasurement(m.ids)}
                                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
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
