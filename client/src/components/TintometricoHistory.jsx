import React, { useState, useEffect } from 'react';
import { 
    Palette, 
    Trash2, 
    Search, 
    User, 
    ShoppingBag, 
    BookOpen, 
    Calendar, 
    Eye, 
    EyeOff, 
    Building, 
    DollarSign,
    History
} from 'lucide-react';
import { colorRegistrationsService } from '../utils/colorRegistrationsService';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const TintometricoHistory = () => {
    const { user } = useAuth();
    
    // --- List States ---
    const [registrations, setRegistrations] = useState([]);
    const [registrationsSearch, setRegistrationsSearch] = useState('');
    const [loadingRegistrations, setLoadingRegistrations] = useState(true);
    
    // UI Toggles
    const [expandedFormulaId, setExpandedFormulaId] = useState(null);
    const [showAllPrices, setShowAllPrices] = useState(false);
    const [visiblePrices, setVisiblePrices] = useState({});

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

    // Load registrations on mount
    useEffect(() => {
        fetchRegistrations();
    }, []);

    const fetchRegistrations = async () => {
        setLoadingRegistrations(true);
        try {
            const data = await colorRegistrationsService.getAll(true); // true = cargar historial del tintometrico
            setRegistrations(data || []);
        } catch (err) {
            console.error('Error fetching registrations:', err);
            toast.error('No se pudieron cargar las preparaciones del historial.');
        } finally {
            setLoadingRegistrations(false);
        }
    };

    const handleDeleteRegistration = async (id, idStr) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar el registro de la preparación "${idStr}"?`)) {
            return;
        }

        try {
            await colorRegistrationsService.delete(id);
            toast.success('Registro de preparación eliminado.');
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
                        <History className="text-brand-blue w-8 h-8" /> Historial Tintométrico
                    </h1>
                    <p className="text-sm text-gray-500 font-medium">Historial de preparaciones y dosificaciones realizadas desde el Tintométrico</p>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-col space-y-4">
                
                {/* Search & Statistics Bar */}
                <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:max-w-md group">
                        <input
                            type="text"
                            value={registrationsSearch}
                            onChange={(e) => setRegistrationsSearch(e.target.value)}
                            className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white transition-all font-semibold"
                            placeholder="Buscar en el historial (cliente, color, código, base, etc.)..."
                        />
                        <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400 group-focus-within:text-brand-blue" />
                    </div>

                    <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-between md:justify-end">
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
                            <span className="ml-1">{showAllPrices ? 'Ocultar Precios' : 'Mostrar Precios'}</span>
                        </button>
                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center gap-2">
                            <span>Total Preparaciones:</span>
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-black">
                                {filteredRegistrations.length}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Colors Grid */}
                {loadingRegistrations ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-20 flex flex-col items-center justify-center shadow-sm">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-blue mb-3"></div>
                        <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Cargando historial tintométrico...</span>
                    </div>
                ) : filteredRegistrations.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-20 flex flex-col items-center justify-center text-center space-y-3 shadow-sm text-gray-400 italic">
                        <Palette className="text-gray-300 w-16 h-16 animate-pulse" />
                        <p className="text-sm font-semibold">No se encontraron registros en el historial tintométrico.</p>
                        <p className="text-xs text-gray-400">Registrá preparaciones desde el panel del Tintométrico para verlas aquí.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
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
                                    
                                    <span className="absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-white shadow-sm border bg-violet-700/90 border-violet-600/30">
                                        Tintométrico
                                    </span>

                                    <div className="relative text-white min-w-0">
                                        <h3 className="text-xs font-black truncate leading-tight tracking-wide drop-shadow" title={item.num_id ? `Nº ${item.num_id} - ${item.identification_id}` : item.identification_id}>
                                            {item.num_id ? `Nº ${item.num_id} - ` : ''}{item.identification_id}
                                        </h3>
                                        <span className="text-[8.5px] font-bold opacity-80 uppercase tracking-widest font-mono drop-shadow">
                                            {item.color_code ? `Código: ${item.color_code}` : 'Sin código'}
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
                                                    <div className="font-bold text-gray-900 leading-tight whitespace-normal break-words">
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
                                            <div className="flex gap-2 items-start">
                                                <ShoppingBag className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-bold text-gray-900 leading-tight whitespace-normal break-words">
                                                        {item.formula?.productName || 'Sin producto especificado'}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400 mt-1.5">
                                                        {item.color_code && (
                                                            <span className="font-mono">Código: {item.color_code}</span>
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
                                                        <DollarSign className="w-3.5 h-3.5" />
                                                        <span>Ver precio</span>
                                                        <Eye className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Collapsible Formula Viewer */}
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
                                                                    <span className="truncate text-gray-700">
                                                                        {(() => {
                                                                            const name = pig.nombre || pig.name || '';
                                                                            const code = pig.codigo || pig.code || '';
                                                                            if (name && code && name !== code) {
                                                                                const codeInParens = `(${code})`;
                                                                                if (name.includes(codeInParens)) return name;
                                                                                return `${name} (${code})`;
                                                                            }
                                                                            return name || code || '-';
                                                                        })()}
                                                                    </span>
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
                                                                            <span className="truncate font-bold">
                                                                                {(() => {
                                                                                    const name = pig.nombre || pig.name || '';
                                                                                    const code = pig.codigo || pig.code || '';
                                                                                    if (name && code && name !== code) {
                                                                                        const codeInParens = `(${code})`;
                                                                                        if (name.includes(codeInParens)) return name;
                                                                                        return `${name} (${code})`;
                                                                                    }
                                                                                    return name || code || '-';
                                                                                })()}
                                                                            </span>
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

                                    {/* Card Footer */}
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
    );
};

export default TintometricoHistory;
