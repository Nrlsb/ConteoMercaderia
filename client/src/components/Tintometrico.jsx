import React, { useState, useEffect } from 'react';
import { Search, Settings, Paintbrush, Copy, Check, RotateCw, AlertTriangle, Layers, Info, DollarSign, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function Tintometrico() {
  const [apiUrl, setApiUrl] = useState(() => {
    return localStorage.getItem('tintometrico_api_url') || import.meta.env.VITE_TINTOMETRICO_API_URL || 'http://localhost:3000/api/v1';
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [loadingColors, setLoadingColors] = useState(false);
  const [colors, setColors] = useState([]);
  
  const [selectedColor, setSelectedColor] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [colorDetail, setColorDetail] = useState(null);
  const [equivalents, setEquivalents] = useState([]);
  
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedCapacity, setSelectedCapacity] = useState('');
  const [loadingFormula, setLoadingFormula] = useState(false);
  const [formulaData, setFormulaData] = useState(null);
  
  const [copiedText, setCopiedText] = useState(null);

  // Guardar URL de API en localStorage al cambiar
  const saveApiUrl = (newUrl) => {
    setApiUrl(newUrl);
    localStorage.setItem('tintometrico_api_url', newUrl);
    toast.success('Configuración de API guardada');
  };

  // Buscar colores
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      toast.error('Ingrese un texto para buscar');
      return;
    }

    setLoadingColors(true);
    setSelectedColor(null);
    setColorDetail(null);
    setFormulaData(null);
    setProducts([]);
    setSelectedProductId('');
    setSelectedCapacity('');

    try {
      const brandParam = selectedBrand !== 'all' ? `&brand=${selectedBrand}` : '';
      const response = await fetch(`${apiUrl}/colors?q=${encodeURIComponent(searchQuery)}${brandParam}`);
      const data = await response.json();
      
      if (data.success) {
        setColors(data.data || []);
        if (data.data?.length === 0) {
          toast.info('No se encontraron colores');
        }
      } else {
        toast.error('Error al realizar la búsqueda');
      }
    } catch (error) {
      console.error('Error al buscar colores:', error);
      toast.error('No se pudo conectar con el servidor tintométrico');
    } finally {
      setLoadingColors(false);
    }
  };

  // Seleccionar un color y obtener sus detalles, equivalencias y productos habilitados
  const handleSelectColor = async (color) => {
    setSelectedColor(color);
    setLoadingDetail(true);
    setColorDetail(null);
    setFormulaData(null);
    setProducts([]);
    setSelectedProductId('');
    setSelectedCapacity('');

    try {
      // 1. Obtener detalles y equivalencias LAB
      const detailRes = await fetch(`${apiUrl}/colors/${color.id}`);
      const detailData = await detailRes.json();
      
      if (detailData.success) {
        setColorDetail(detailData.color);
        setEquivalents(detailData.equivalents || []);
      } else {
        toast.error('Error al obtener detalles del color');
      }

      // 2. Obtener productos y capacidades habilitadas (Modo A de Formula)
      const formulaRes = await fetch(`${apiUrl}/colors/${color.id}/formula`);
      const formulaDataJson = await formulaRes.json();
      
      // La API del tintométrico a veces puede no tener fórmula, manejamos esto
      if (formulaRes.status === 404) {
        toast.warning('Este color no dispone de fórmulas de dosificación registradas.');
        return;
      }

      // El Modo A devuelve las recetas agrupadas por producto o directamente la lista de productos
      // De acuerdo a api-integration.md, Modo A devuelve las recetas base del producto y capacidades.
      // Vamos a simular la carga de productos disponibles basados en la respuesta o consultando /products
      const productsRes = await fetch(`${apiUrl}/products?brand=${color.brand}`);
      const productsData = await productsRes.json();
      if (productsData.success) {
        setProducts(productsData.data || []);
      }

    } catch (error) {
      console.error('Error al cargar detalle del color:', error);
      toast.error('Error al conectar con la API para los detalles del color');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Calcular la dosificación (Modo B)
  const handleCalculateFormula = async () => {
    if (!selectedProductId || !selectedCapacity) {
      toast.error('Seleccione producto y tamaño de envase');
      return;
    }

    setLoadingFormula(true);
    setFormulaData(null);

    try {
      const response = await fetch(
        `${apiUrl}/colors/${selectedColor.id}/formula?productId=${selectedProductId}&capacity=${selectedCapacity}`
      );
      const data = await response.json();

      if (data.success) {
        setFormulaData(data.calculation);
        toast.success('Dosificación calculada con éxito');
      } else {
        toast.error(data.error || 'Error al calcular la fórmula');
      }
    } catch (error) {
      console.error('Error al calcular la dosificación:', error);
      toast.error('Error de comunicación con la API del tintométrico');
    } finally {
      setLoadingFormula(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
      toast.success(`${label} copiado`);
    });
  };

  // Obtener capacidades del producto seleccionado
  const selectedProduct = products.find(p => p.id === parseInt(selectedProductId));
  const availableCapacities = selectedProduct ? selectedProduct.capacities || [] : [];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[600px] flex flex-col">
      {/* Cabecera */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-xl">
            <Paintbrush className="w-6 h-6 text-blue-200" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Integración de Tintometría</h2>
            <p className="text-xs text-blue-100">Buscador de fórmulas, equivalencias CIELAB y dosificación de pigmentos</p>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          title="Configurar servidor API"
        >
          <Settings className={`w-5 h-5 ${showSettings ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Ajustes de API */}
      {showSettings && (
        <div className="bg-gray-50 border-b border-gray-200 p-4 transition-all duration-300">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">URL Base del Web Service de Tintometría</label>
              <input 
                type="text" 
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://localhost:3000/api/v1"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => saveApiUrl(apiUrl)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Guardar
              </button>
              <button 
                onClick={() => {
                  const def = import.meta.env.VITE_TINTOMETRICO_API_URL || 'http://localhost:3000/api/v1';
                  setApiUrl(def);
                  localStorage.setItem('tintometrico_api_url', def);
                  toast.info('Restaurado a valor predeterminado');
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Restablecer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid Principal */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
        
        {/* PANEL IZQUIERDO: Búsqueda y Resultados (4 columnas) */}
        <div className="lg:col-span-4 p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            Buscador de Catálogo
          </h3>
          
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nombre, código o alternativa..."
                className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 outline-none shadow-sm"
              />
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            </div>

            <div className="flex gap-2">
              <select 
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 focus:border-blue-500 outline-none"
              >
                <option value="all">Todas las Marcas</option>
                <option value="alba">Alba</option>
                <option value="plavicon">Plavicon</option>
                <option value="tersuave">Tersuave</option>
              </select>

              <button 
                type="submit"
                disabled={loadingColors}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-xs px-5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {loadingColors ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : 'Buscar'}
              </button>
            </div>
          </form>

          {/* Listado de Resultados */}
          <div className="flex-grow overflow-y-auto max-h-[400px] lg:max-h-[500px] border border-gray-150 rounded-xl divide-y divide-gray-100 bg-gray-50/50">
            {loadingColors ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-gray-250 border-t-blue-600 animate-spin" />
                <span className="text-xs text-gray-500">Buscando colores en la base de datos...</span>
              </div>
            ) : colors.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs italic">
                Realiza una búsqueda para ver los colores.
              </div>
            ) : (
              colors.map((color) => (
                <button
                  key={color.id}
                  onClick={() => handleSelectColor(color)}
                  className={`w-full text-left p-3.5 transition-all flex items-center gap-3 group relative ${
                    selectedColor?.id === color.id 
                      ? 'bg-blue-50/80 border-l-4 border-blue-600 pl-2.5' 
                      : 'hover:bg-white border-l-4 border-transparent'
                  }`}
                >
                  <span 
                    className="w-10 h-10 rounded-full border border-gray-200 flex-shrink-0 shadow-inner"
                    style={{ backgroundColor: color.hex || '#ccc' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-1">
                      <span className="font-bold text-gray-800 text-sm truncate leading-tight group-hover:text-blue-700">
                        {color.nombre}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        color.brand === 'alba' 
                          ? 'bg-purple-100 text-purple-700' 
                          : color.brand === 'plavicon'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {color.brand}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs font-mono text-gray-500 font-semibold">{color.codigo}</span>
                      {color.coleccion && (
                        <>
                          <span className="text-gray-300 text-[10px]">•</span>
                          <span className="text-[10px] text-gray-400 truncate">{color.coleccion}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* PANEL DERECHO: Detalles, Equivalencias y Fórmula (8 columnas) */}
        <div className="lg:col-span-8 p-5 flex flex-col gap-6">
          {loadingDetail ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Cargando equivalencias CIELAB y fórmulas...</span>
            </div>
          ) : !selectedColor ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-400 text-center gap-3">
              <Paintbrush className="w-12 h-12 text-gray-300 stroke-1" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Ningún color seleccionado</p>
                <p className="text-xs text-gray-400 max-w-xs leading-normal">
                  Busca y selecciona un color del catálogo en el panel izquierdo para calcular su receta y equivalencias.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Bloque Detalle Cabecera del Color */}
              <div className="bg-gray-50 border border-gray-150 rounded-2xl p-4.5 flex flex-col sm:flex-row gap-4 items-center sm:items-start shadow-sm">
                <span 
                  className="w-16 h-16 rounded-full border border-gray-200 shadow-inner flex-shrink-0"
                  style={{ backgroundColor: selectedColor.hex || '#ccc' }}
                />
                <div className="flex-grow text-center sm:text-left space-y-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 justify-center sm:justify-start">
                    <h3 className="text-lg font-black text-gray-900 leading-tight">{selectedColor.nombre}</h3>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase self-center ${
                      selectedColor.brand === 'alba' 
                        ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                        : selectedColor.brand === 'plavicon'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}>
                      {selectedColor.brand}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-2 text-xs font-medium">
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase font-bold block">Código</span>
                      <span className="font-mono text-gray-800">{selectedColor.codigo}</span>
                    </div>
                    {selectedColor.technical_code && (
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold block">Cod. Técnico</span>
                        <span className="font-mono text-gray-800">{selectedColor.technical_code}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase font-bold block">Catálogo</span>
                      <span className="text-gray-800 truncate block max-w-[140px]">{selectedColor.coleccion || 'General'}</span>
                    </div>
                    {selectedColor.lab && (
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold block">CIELAB L*a*b*</span>
                        <span className="font-mono text-gray-850">
                          {selectedColor.lab.l.toFixed(1)}, {selectedColor.lab.a.toFixed(1)}, {selectedColor.lab.b.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sección: Equivalentes LAB */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  Equivalencias entre Marcas (Fórmula LAB Delta E)
                </h4>
                
                {equivalents.length === 0 ? (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
                    No se encontraron equivalencias cercanas en otras cartas de colores.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {equivalents.map((eq) => (
                      <div 
                        key={eq.id}
                        className="bg-white border border-gray-250 hover:border-gray-300 rounded-xl p-3 flex items-center gap-3 shadow-sm transition-all"
                      >
                        <span 
                          className="w-8 h-8 rounded-full border border-gray-150 flex-shrink-0 shadow-inner"
                          style={{ backgroundColor: eq.hex || '#ccc' }}
                        />
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-center gap-1">
                            <span className="font-bold text-gray-800 text-xs truncate">{eq.nombre}</span>
                            <span className={`text-[9px] font-bold px-1 py-0.2 rounded uppercase ${
                              eq.brand === 'alba' 
                                ? 'bg-purple-100 text-purple-700' 
                                : eq.brand === 'plavicon'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {eq.brand}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center mt-1">
                            <span className="font-mono text-[11px] text-gray-500">{eq.codigo}</span>
                            <div className="flex items-center gap-1">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                eq.distance <= 1.5 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : eq.distance <= 3.0
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-amber-100 text-amber-800'
                              }`}>
                                {eq.similarity}
                              </span>
                              <span className="text-[10px] font-mono text-gray-400">ΔE: {eq.distance.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sección: Dosificador de Recetas */}
              <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50/50 space-y-4">
                <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-4.5 h-4.5 text-blue-600" />
                  Calculador y Dosificador de Recetas
                </h4>

                {products.length === 0 ? (
                  <div className="text-xs text-amber-600 bg-amber-50 rounded-xl p-4 border border-amber-100/60 leading-normal flex items-start gap-2">
                    <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>No hay bases o productos mapeados disponibles para la marca {selectedColor.brand.toUpperCase()}. Registra las bases en el administrador para calcular dosificaciones.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">1. Seleccionar Producto Base</label>
                        <select
                          value={selectedProductId}
                          onChange={(e) => {
                            setSelectedProductId(e.target.value);
                            setSelectedCapacity('');
                            setFormulaData(null);
                          }}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-800 focus:border-blue-500 outline-none shadow-sm"
                        >
                          <option value="">Seleccione producto base...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">2. Seleccionar Capacidad (Envase)</label>
                        <select
                          value={selectedCapacity}
                          disabled={!selectedProductId}
                          onChange={(e) => {
                            setSelectedCapacity(e.target.value);
                            setFormulaData(null);
                          }}
                          className="w-full rounded-xl border border-gray-300 bg-white disabled:bg-gray-100 px-3.5 py-2.5 text-sm text-gray-850 focus:border-blue-500 outline-none shadow-sm"
                        >
                          <option value="">Seleccione tamaño...</option>
                          {availableCapacities.map((c, i) => (
                            <option key={i} value={c.capacidadLitros}>
                              {c.capacidadLitros} {c.unidad} (Base {c.base})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleCalculateFormula}
                        disabled={loadingFormula || !selectedProductId || !selectedCapacity}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-xs px-6 py-3 rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center gap-1.5 cursor-pointer"
                      >
                        {loadingFormula ? (
                          <>
                            <RotateCw className="w-3.5 h-3.5 animate-spin" />
                            Calculando Dosificación...
                          </>
                        ) : (
                          <>
                            Calcular Dosificación
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>

                    {/* Mostrar receta calculada */}
                    {formulaData && (
                      <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-4 shadow-sm animate-fadeIn">
                        
                        {/* Cabecera Fórmula */}
                        <div className="flex justify-between items-start gap-4 border-b border-gray-100 pb-3">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Producto Mezclado</span>
                            <span className="text-sm font-bold text-gray-800">{formulaData.product.name}</span>
                            <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-semibold">
                              Base {formulaData.base} ({formulaData.capacity.value} {formulaData.capacity.unit})
                            </span>
                          </div>
                          
                          {formulaData.capacity.codigoComercial && (
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Código Comercial</span>
                              <button 
                                onClick={() => copyToClipboard(formulaData.capacity.codigoComercial, 'Código de base')}
                                className="font-mono text-xs font-bold text-blue-600 hover:underline flex items-center gap-1.5 cursor-pointer ml-auto"
                              >
                                {formulaData.capacity.codigoComercial}
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Listado de Pigmentos */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pigmentos e Impulsos de Dosificación</span>
                          
                          <div className="overflow-hidden border border-gray-150 rounded-lg">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-gray-150 bg-gray-50 font-bold text-gray-500">
                                  <th className="p-3">Colorante</th>
                                  <th className="p-3 text-center">Código</th>
                                  <th className="p-3 text-right">Impulsos</th>
                                  <th className="p-3 text-right">Costo Colorante</th>
                                  <th className="p-3 text-center">Código DB2</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {formulaData.pigments.map((pig, index) => (
                                  <tr key={index} className="hover:bg-gray-50/50">
                                    <td className="p-3 flex items-center gap-2 font-medium text-gray-700">
                                      <span 
                                        className="h-3.5 w-3.5 rounded-full border border-gray-200" 
                                        style={{ backgroundColor: pig.hex }}
                                      />
                                      {pig.name}
                                    </td>
                                    <td className="p-3 text-center font-mono text-gray-400 font-bold">{pig.code}</td>
                                    <td className="p-3 text-right font-mono text-gray-800 font-bold text-sm">
                                      {pig.cantidadDosificadaFormateada}
                                    </td>
                                    <td className="p-3 text-right font-mono text-gray-650">
                                      {pig.costo ? `$${pig.costo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                                    </td>
                                    <td className="p-3 text-center">
                                      {pig.codigoComercial ? (
                                        <button
                                          onClick={() => copyToClipboard(pig.codigoComercial, 'Código de colorante')}
                                          className="font-mono text-[11px] text-gray-500 hover:text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          {pig.codigoComercial}
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-amber-500 italic">No vinculado</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Caja de Costos Finales */}
                        <div className="bg-gray-50 rounded-xl border border-gray-150 p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                          <div className="space-y-1 text-center sm:text-left">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Desglose de Precios (ARS)</span>
                            <div className="text-xs text-gray-500 font-medium">
                              Base: <span className="font-mono text-gray-750 font-bold">${formulaData.pricing.precioBase?.toLocaleString('es-AR') || '0'}</span>
                              <span className="mx-2">•</span>
                              Colorantes: <span className="font-mono text-gray-750 font-bold">${formulaData.pricing.precioColorantes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          <div className="text-center sm:text-right">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Precio Total Estimado</span>
                            <span className="text-xl font-black text-blue-700 font-mono">
                              ${formulaData.pricing.precioTotal ? formulaData.pricing.precioTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '-'}
                            </span>
                          </div>
                        </div>

                        {/* Alerta de Precio Base Nulo */}
                        {formulaData.pricing.precioBase === null && (
                          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 flex items-start gap-2 leading-relaxed">
                            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <span><strong>Precio Base Indefinido:</strong> Este producto no posee un precio base comercial asignado en el servidor. El precio final solo refleja los colorantes. Consúltese con administración.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
