import React, { useState, useEffect, useRef } from 'react';
import { Search, Printer, Calendar, Package, X, Loader2, Download, Barcode as BarcodeIcon } from 'lucide-react';
import { jsPDF } from 'jspdf';
import bwipjs from 'bwip-js';
import { toast } from 'sonner';
import { useProductSync } from '../hooks/useProductSync';
import { normalizeText } from '../utils/textUtils';

const EtiquetasPage = () => {
    const { searchProductsLocally, syncProducts, isSyncing } = useProductSync();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().split('T')[0]);
    const [fechaVencimiento, setFechaVencimiento] = useState('');
    const [cantidad, setCantidad] = useState('');
    const [generating, setGenerating] = useState(false);
    
    const searchTimeoutRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        syncProducts();
        inputRef.current?.focus();
    }, [syncProducts]);

    const handleSearch = async (value) => {
        setSearchTerm(value);
        if (!value || value.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(async () => {
            const results = await searchProductsLocally(value);
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
        }, 300);
    };

    const handleSelectProduct = (product) => {
        setSelectedProduct(product);
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const generateBarcodeBase64 = async (text) => {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            try {
                bwipjs.toCanvas(canvas, {
                    bcid: 'code128',       // Barcode type
                    text: text,            // Text to encode
                    scale: 3,              // 3x scaling factor
                    height: 10,            // Bar height, in millimeters
                    includetext: true,      // Show human-readable text
                    textxalign: 'center',  // Always good to set this
                });
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                reject(e);
            }
        });
    };

    const handleGeneratePDF = async () => {
        if (!selectedProduct) {
            toast.error('Por favor selecciona un producto');
            return;
        }

        setGenerating(true);
        try {
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            const margin = 15;
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const contentWidth = pageWidth - (margin * 2);
            
            /* Título/Encabezado eliminado por solicitud del usuario */
            
            // doc.setDrawColor(200);
            // doc.setLineWidth(0.3);
            // doc.line(margin, 18, pageWidth - margin, 18);

            // DESCRIPCIÓN (SUPER GIGANTE)
            doc.setTextColor(0);
            doc.setFontSize(60); // Aumentado a 60 para máxima visibilidad
            doc.setFont('helvetica', 'bold');
            
            const splitDesc = doc.splitTextToSize(selectedProduct.description || 'Sin descripción', contentWidth - 60);
            doc.text(splitDesc, margin, 30); // Subido de 45 a 30
            
            // CANTIDAD (Cant) en la esquina superior derecha
            if (cantidad) {
                doc.setFontSize(24);
                doc.setFont('helvetica', 'bold');
                doc.text('Cant:', pageWidth - margin, 20, { align: 'right' }); // Subido de 30 a 20
                doc.setFontSize(80); 
                doc.text(cantidad, pageWidth - margin, 45, { align: 'right' }); // Subido de 60 a 45
            }
            
            // Ajustamos el salto de línea basado en el nuevo tamaño de fuente
            let currentY = 30 + (splitDesc.length * 22); // Subido de 45 a 30 para coincidir con el inicio del texto

            // CÓDIGO INTERNO (ELIMINADO POR SOLICITUD)
            // let currentY = 45 + (splitDesc.length * 22);
            // doc.setFontSize(16);
            // doc.setFont('helvetica', 'normal');
            // doc.setTextColor(100);
            // doc.text(`Cód. Interno: ${selectedProduct.code}`, margin, currentY + 5);

            // FECHAS (EXTRA GRANDES - DISPUESTAS VERTICALMENTE)
            currentY += 5;
            
            // Fondo gris muy tenue para las fechas y código (Lo ampliamos para que quepa todo en vertical)
            doc.setDrawColor(245);
            doc.setFillColor(252, 252, 252);
            // Rectángulo para cubrir fechas y barcode (altura de 105mm para reducir espacio sobrante)
            doc.roundedRect(margin, currentY - 5, contentWidth, 105, 2, 2, 'FD'); 

            doc.setTextColor(0);
            doc.setFontSize(70); 
            doc.setFont('helvetica', 'bold');
            doc.text('INGRESO:', margin + 10, currentY + 15);
            doc.setFont('helvetica', 'normal');
            doc.text(fechaIngreso || '-', margin + 130, currentY + 15); // Aumentado de 110 a 130 para evitar solapamiento

            doc.setFont('helvetica', 'bold');
            doc.text('VENCE:', margin + 10, currentY + 45);
            doc.setFont('helvetica', 'normal');
            doc.text(fechaVencimiento || 'N/A', margin + 130, currentY + 45); // Aumentado de 110 a 130 para evitar solapamiento

            // Código de Barras (Movido a la esquina inferior derecha, zona del recuadro rojo)
            const barcodeText = selectedProduct.barcode || selectedProduct.code;
            if (barcodeText) {
                try {
                    const barcodeImg = await generateBarcodeBase64(String(barcodeText));
                    const imgWidth = 70; 
                    const imgHeight = 28;
                    
                    // Posicionado DEBAJO de las fechas, centrado horizontalmente
                    const barcodeX = margin + (contentWidth / 2) - (imgWidth / 2);
                    const barcodeY = currentY + 68; 
                    
                    doc.addImage(barcodeImg, 'PNG', barcodeX, barcodeY, imgWidth, imgHeight);
                    
                    // Texto del código más pequeño
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'italic');
                    doc.setTextColor(150);
                    doc.text(`Cód: ${barcodeText}`, barcodeX + (imgWidth / 2), barcodeY + imgHeight + 4, { align: 'center' });
                } catch (err) {
                    console.error('Error generating barcode image:', err);
                }
            }

            // Pie de página
            doc.setFontSize(8);
            doc.setTextColor(180);
            doc.text(`Generado el: ${new Date().toLocaleString()}`, pageWidth - margin, pageHeight - 5, { align: 'right' });

            // Descarga
            const fileName = `Etiqueta_${selectedProduct.code}_${fechaIngreso}.pdf`;
            doc.save(fileName);
            toast.success('PDF generado y descargado correctamente');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Error al generar el PDF');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md">
                            <Printer className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Impresión de Etiquetas</h1>
                            <p className="text-blue-100 text-sm">Genera etiquetas A4 para tus productos con códigos de barras.</p>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Selector de Producto */}
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Search className="w-4 h-4 text-blue-600" />
                                    Buscar Producto
                                </label>
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        placeholder="Nombre o código del producto..."
                                        className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-lg"
                                    />
                                    {searchTerm && (
                                        <button 
                                            onClick={() => {setSearchTerm(''); setSuggestions([]); setShowSuggestions(false);}}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full text-gray-400"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    )}

                                    {/* Sugerencias */}
                                    {showSuggestions && (
                                        <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 max-h-80 overflow-y-auto animate-in slide-in-from-top-2">
                                            {suggestions.map((p) => (
                                                <button
                                                    key={p.code}
                                                    onClick={() => handleSelectProduct(p)}
                                                    className="w-full flex items-center gap-4 p-4 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                                                >
                                                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 flex-shrink-0">
                                                        <Package className="w-6 h-6" />
                                                    </div>
                                                    <div className="flex-grow">
                                                        <div className="font-bold text-gray-900">{p.description}</div>
                                                        <div className="text-sm text-gray-500 flex items-center gap-3">
                                                            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">ID: {p.code}</span>
                                                            {p.barcode && <span className="flex items-center gap-1"><BarcodeIcon className="w-3 h-3"/> {p.barcode}</span>}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Producto Seleccionado */}
                            {selectedProduct && (
                                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 animate-in zoom-in duration-300">
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-bold uppercase rounded-full tracking-widest">Seleccionado</span>
                                        <button onClick={() => setSelectedProduct(null)} className="text-blue-400 hover:text-blue-600 p-1">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <h3 className="text-3xl font-bold text-blue-900 mb-2">{selectedProduct.description}</h3>
                                    <div className="grid grid-cols-2 gap-4 mt-4">
                                        <div className="bg-white/50 p-3 rounded-xl border border-blue-100">
                                            <div className="text-[10px] text-blue-500 uppercase font-bold mb-1">Código Interno</div>
                                            <div className="font-mono text-blue-900 font-bold">{selectedProduct.code}</div>
                                        </div>
                                        <div className="bg-white/50 p-3 rounded-xl border border-blue-100">
                                            <div className="text-[10px] text-blue-500 uppercase font-bold mb-1">Código Barras</div>
                                            <div className="font-mono text-blue-900 font-bold">{selectedProduct.barcode || 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Formulario de Fechas */}
                        <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    Fecha de Ingreso
                                </label>
                                <input
                                    type="date"
                                    value={fechaIngreso}
                                    onChange={(e) => setFechaIngreso(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    Fecha de Vencimiento
                                </label>
                                <input
                                    type="date"
                                    value={fechaVencimiento}
                                    onChange={(e) => setFechaVencimiento(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                                />
                                <p className="text-[10px] text-gray-400 mt-2 italic">Opcional. Deja vacío si no aplica.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Package className="w-4 h-4 text-gray-400" />
                                    Cantidad
                                </label>
                                <input
                                    type="text"
                                    value={cantidad}
                                    onChange={(e) => setCantidad(e.target.value)}
                                    placeholder="Ej: 50 unidades, 10kg, etc."
                                    className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div className="pt-6">
                                <button
                                    onClick={handleGeneratePDF}
                                    disabled={!selectedProduct || generating}
                                    className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95
                                        ${!selectedProduct || generating 
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' 
                                            : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 shadow-blue-100'}`}
                                >
                                    {generating ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <Download className="w-6 h-6" />
                                    )}
                                    {generating ? 'Generando...' : 'Descargar Etiqueta PDF'}
                                </button>
                                {!selectedProduct && (
                                    <p className="text-center text-xs text-red-500 mt-3 font-medium animate-pulse">Debes elegir un producto primero</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Bar */}
                <div className="bg-gray-50 border-t border-gray-100 px-8 py-4 flex justify-between items-center text-xs text-gray-400 font-medium">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`}></div>
                        {isSyncing ? 'Sincronizando catálogo...' : 'Base de datos actualizada'}
                    </div>
                    <div className="flex items-center gap-4">
                        <span>Formato: A4</span>
                        <span>Estándar: Code128</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EtiquetasPage;
