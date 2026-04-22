import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Search, Printer as PrinterIcon, Calendar, Package, X, Loader2, Download, Barcode as BarcodeIcon, Mic, Camera, Edit2, Check, RefreshCw, Plus, Trash2, LayoutList, Tags, User } from 'lucide-react';
import { jsPDF } from 'jspdf';
import bwipjs from 'bwip-js';
import { toast } from 'sonner';
import { useProductSync } from '../hooks/useProductSync';
import { normalizeText } from '../utils/textUtils';
import { Printer } from '@capgo/capacitor-printer';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const Scanner = lazy(() => import('./Scanner'));

const EtiquetasPage = () => {
    const { user } = useAuth();
    const { syncProducts, searchProductsLocally, isSyncing } = useProductSync();

    const [activeTab, setActiveTab] = useState('individual'); // 'individual' | 'multiple'
    const [multiProducts, setMultiProducts] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().split('T')[0]);
    const [fechaVencimiento, setFechaVencimiento] = useState('');
    const [cantidad, setCantidad] = useState('');
    const [generating, setGenerating] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [fechaIngresoError, setFechaIngresoError] = useState(false);
    const [isEditingBarcode, setIsEditingBarcode] = useState(false);
    const [tempBarcode, setTempBarcode] = useState('');
    const [isUpdatingBarcode, setIsUpdatingBarcode] = useState(false);
    const [isScanningForUpdate, setIsScanningForUpdate] = useState(false);

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
        if (activeTab === 'multiple') {
            handleAddMultiProduct(product);
            return;
        }
        setSelectedProduct(product);
        setTempBarcode(product.barcode || '');
        setIsEditingBarcode(false);
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
        setIsScanning(false);
        setIsScanningForUpdate(false);
    };

    const handleVoiceSearch = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const { available } = await SpeechRecognition.available();
                if (!available) {
                    toast.error('El reconocimiento de voz no está disponible.');
                    return;
                }

                const { speechRecognition } = await SpeechRecognition.checkPermissions();
                if (speechRecognition !== 'granted') {
                    const { speechRecognition: newPermission } = await SpeechRecognition.requestPermissions();
                    if (newPermission !== 'granted') {
                        toast.error('Se requiere permiso de micrófono.');
                        return;
                    }
                }

                setIsListening(true);
                SpeechRecognition.start({
                    language: 'es-AR',
                    maxResults: 5,
                    prompt: 'Diga el nombre del producto',
                    partialResults: false,
                    popup: true
                }).then(async result => {
                    if (result && result.matches && result.matches.length > 0) {
                        const term = result.matches[0];
                        setSearchTerm(term);
                        handleSearch(term);
                    }
                }).catch(e => {
                    console.error('Voice error:', e);
                }).finally(() => {
                    setIsListening(false);
                });
            } catch (error) {
                console.error('Speech recognition error:', error);
                setIsListening(false);
            }
            return;
        }

        // Web Fallback
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            toast.error('Tu navegador no soporta búsqueda por voz.');
            return;
        }

        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = 'es-AR';
        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event) => {
            const term = event.results[0][0].transcript;
            setSearchTerm(term);
            handleSearch(term);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
    };

    const handleScan = async (code) => {
        if (isScanningForUpdate) {
            setTempBarcode(code);
            setIsEditingBarcode(true);
            setIsScanning(false);
            setIsScanningForUpdate(false);
            // Auto-save if scanning for update? Let's do it for better UX
            handleUpdateBarcode(code);
            return;
        }

        try {
            const results = await searchProductsLocally(code);
            if (results && results.length > 0) {
                handleSelectProduct(results[0]);
                toast.success('Producto identificado!');
            } else {
                toast.error(`Código ${code} no encontrado.`);
            }
        } catch (error) {
            console.error('Scan error:', error);
            toast.error('Error al buscar el código.');
        } finally {
            setIsScanning(false);
            setIsScanningForUpdate(false);
        }
    };

    const handleUpdateBarcode = async (newBarcodeValue) => {
        const barcodeToSave = newBarcodeValue !== undefined ? newBarcodeValue : tempBarcode;

        if (!selectedProduct || !selectedProduct.id) return;

        setIsUpdatingBarcode(true);
        try {
            const response = await api.put(`/api/products/${selectedProduct.id}`, {
                barcode: barcodeToSave
            });

            // Update local state
            setSelectedProduct(prev => ({ ...prev, barcode: response.data.barcode }));
            setTempBarcode(response.data.barcode);
            setIsEditingBarcode(false);
            toast.success('Código de barras actualizado correctamente');

            // Refresh local sync to keep offline DB updated
            syncProducts();
        } catch (error) {
            console.error('Error updating barcode:', error);
            toast.error('No se pudo actualizar el código de barras');
        } finally {
            setIsUpdatingBarcode(false);
        }
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

    const generatePDFInstance = async () => {
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        const margin = 15;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const contentWidth = pageWidth - (margin * 2);

        // DESCRIPCIÓN (SUPER GIGANTE)
        doc.setTextColor(0);
        doc.setFontSize(60);
        doc.setFont('helvetica', 'bold');

        const splitDesc = doc.splitTextToSize(selectedProduct.description || 'Sin descripción', contentWidth - 60);
        doc.text(splitDesc, margin, 30);

        // CANTIDAD (Cant) en la esquina superior derecha
        if (cantidad) {
            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.text('Cant:', pageWidth - margin, 20, { align: 'right' });
            doc.setFontSize(80);
            doc.text(cantidad, pageWidth - margin, 45, { align: 'right' });
        }

        let currentY = 30 + (splitDesc.length * 22);

        // FECHAS (EXTRA GRANDES - DISPUESTAS VERTICALMENTE)
        currentY += 5;

        doc.setDrawColor(245);
        doc.setFillColor(252, 252, 252);
        doc.roundedRect(margin, currentY - 5, contentWidth, 105, 2, 2, 'FD');

        doc.setTextColor(0);
        doc.setFontSize(70);
        doc.setFont('helvetica', 'bold');
        doc.text('INGRESO:', margin + 10, currentY + 15);
        doc.setFont('helvetica', 'normal');
        doc.text(fechaIngreso || '-', margin + 130, currentY + 15);

        doc.setFont('helvetica', 'bold');
        doc.text('VENCE:', margin + 10, currentY + 45);
        doc.setFont('helvetica', 'normal');
        doc.text(fechaVencimiento || 'N/A', margin + 130, currentY + 45);

        // Código de Barras
        const barcodeText = selectedProduct.barcode || selectedProduct.code;
        if (barcodeText) {
            try {
                const barcodeImg = await generateBarcodeBase64(String(barcodeText));
                const imgWidth = 55;
                const imgHeight = 22;
                // Posición fija a la derecha, debajo de la cantidad
                const barcodeX = pageWidth - margin - imgWidth;
                const barcodeY = 65;

                doc.addImage(barcodeImg, 'PNG', barcodeX, barcodeY, imgWidth, imgHeight);

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
        doc.text(`Generado el: ${new Date().toLocaleString()}`, margin, pageHeight - 5);

        if (user && user.nombre_completo) {
            doc.text(`Creado por: ${user.nombre_completo}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
        } else if (user && user.username) {
            doc.text(`Creado por: ${user.username}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
        }

        return doc;
    };

    const handleAddMultiProduct = (product) => {
        if (multiProducts.length >= 6) {
            toast.error('Límite alcanzado (máx. 6 productos por hoja)');
            return;
        }

        setMultiProducts(prev => [...prev, { ...product, labelCantidad: '' }]);
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
        toast.success(`${product.description} añadido a la lista`);
    };

    const handleRemoveMultiProduct = (index) => {
        setMultiProducts(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpdateMultiQty = (index, value) => {
        setMultiProducts(prev => {
            const newList = [...prev];
            newList[index].labelCantidad = value;
            return newList;
        });
    };

    const generateMultiProductPDF = async () => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const margin = 10;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const contentWidth = pageWidth - (margin * 2);
        const labelHeight = (pageHeight - (margin * 2)) / 6; // Aproximadamente 46mm por etiqueta

        let y = margin;

        for (const item of multiProducts) {
            // Dibujar recuadro de la etiqueta
            doc.setDrawColor(230);
            doc.setLineWidth(0.1);
            doc.rect(margin, y, contentWidth, labelHeight);

            // Línea decorativa lateral
            doc.setFillColor(37, 99, 235); // Blue-600
            doc.rect(margin, y, 2, labelHeight, 'F');

            // Descripción (GIGANTE)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor(0);
            const descLines = doc.splitTextToSize(item.description || 'Sin descripción', contentWidth - 70);
            doc.text(descLines, margin + 7, y + 12);

            // Cantidad (A la derecha)
            if (item.labelCantidad) {
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text('CANTIDAD', margin + contentWidth - 45, y + 10);
                doc.setFontSize(32);
                doc.setTextColor(0);
                doc.text(String(item.labelCantidad), margin + contentWidth - 45, y + 22);
            }

            // Código de Barras (Abajo a la derecha)
            const barcodeText = item.barcode || item.code;
            if (barcodeText) {
                try {
                    const barcodeImg = await generateBarcodeBase64(String(barcodeText));
                    const barcodeWidth = 50;
                    const barcodeHeight = 16;
                    doc.addImage(barcodeImg, 'PNG', margin + contentWidth - barcodeWidth - 5, y + labelHeight - barcodeHeight - 6, barcodeWidth, barcodeHeight);

                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(150);
                    doc.text(`* ${barcodeText} *`, margin + contentWidth - (barcodeWidth / 2) - 5, y + labelHeight - 2, { align: 'center' });
                } catch (err) {
                    console.error('Error in multi-barcode:', err);
                }
            }

            // Información de auditoría y fecha
            doc.setFontSize(7);
            doc.setTextColor(180);
            const userTag = user?.nombre_completo || user?.username || 'Admin';
            doc.text(`Audit: ${userTag} | Generado: ${new Date().toLocaleString()}`, margin + 7, y + labelHeight - 3);

            y += labelHeight;
        }

        return doc;
    };

    const handleGenerateMultiPDF = async () => {
        if (multiProducts.length === 0) {
            toast.error('La lista de productos está vacía');
            return;
        }

        setGenerating(true);
        try {
            const doc = await generateMultiProductPDF();
            doc.save('Etiqueta_Multiple.pdf');
            toast.success('PDF generado correctamente');
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error al generar el PDF');
        } finally {
            setGenerating(false);
        }
    };

    const handlePrintMultiPDF = async () => {
        if (multiProducts.length === 0) {
            toast.error('La lista de productos está vacía');
            return;
        }

        setPrinting(true);
        try {
            const doc = await generateMultiProductPDF();
            const isNative = Capacitor.getPlatform() !== 'web';

            if (isNative) {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                await Printer.printBase64({
                    name: `Etiqueta_Multiple`,
                    data: pdfBase64,
                    mimeType: 'application/pdf'
                });
            } else {
                const pdfBlob = doc.output('blob');
                const url = URL.createObjectURL(pdfBlob);
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = url;
                document.body.appendChild(iframe);
                iframe.onload = () => {
                    setTimeout(() => {
                        iframe.contentWindow.print();
                        setTimeout(() => {
                            document.body.removeChild(iframe);
                            URL.revokeObjectURL(url);
                        }, 1000);
                    }, 500);
                };
            }
            toast.success('Enviando a impresión...');
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error al imprimir');
        } finally {
            setPrinting(false);
        }
    };

    const handleGeneratePDF = async () => {
        if (!selectedProduct) {
            toast.error('Por favor selecciona un producto');
            return;
        }

        if (!fechaIngreso) {
            setFechaIngresoError(true);
            toast.error('La fecha de ingreso es obligatoria');
            return;
        }
        setFechaIngresoError(false);

        setGenerating(true);
        try {
            const doc = await generatePDFInstance();
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

    const handlePrintPDF = async () => {
        if (!selectedProduct) {
            toast.error('Por favor selecciona un producto');
            return;
        }

        if (!fechaIngreso) {
            setFechaIngresoError(true);
            toast.error('La fecha de ingreso es obligatoria');
            return;
        }
        setFechaIngresoError(false);

        setPrinting(true);
        try {
            const doc = await generatePDFInstance();

            // Comprobamos la plataforma usando el objeto oficial de Capacitor
            const isNative = Capacitor.getPlatform() !== 'web';

            if (isNative) {
                // Modo Nativo (Android): Usar el plugin Printer con el método correcto
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                await Printer.printBase64({
                    name: `Etiqueta_${selectedProduct.code}`,
                    data: pdfBase64,
                    mimeType: 'application/pdf'
                });
            } else {
                // Modo Web: Usar iframe oculto para disparar impresión del sistema
                const pdfBlob = doc.output('blob');
                const url = URL.createObjectURL(pdfBlob);

                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = url;
                document.body.appendChild(iframe);

                iframe.onload = () => {
                    setTimeout(() => {
                        iframe.contentWindow.print();
                        // Limpieza después de un tiempo para asegurar que el diálogo se abrió
                        setTimeout(() => {
                            document.body.removeChild(iframe);
                            URL.revokeObjectURL(url);
                        }, 1000);
                    }, 500);
                };
            }
            toast.success('Enviando a la cola de impresión...');
        } catch (error) {
            console.error('Error printing PDF:', error);
            toast.error('Error al intentar imprimir');
        } finally {
            setPrinting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-2 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-3 sm:p-6 text-white">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <div className="p-2 sm:p-3 bg-white/10 rounded-xl backdrop-blur-md">
                            <PrinterIcon className="w-5 h-5 sm:w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Impresión de Etiquetas</h1>
                            <p className="text-blue-100/80 text-[10px] sm:text-sm leading-tight">Crea etiquetas A4 con códigos de barras.</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                    <button
                        onClick={() => setActiveTab('individual')}
                        className={`flex-1 py-3 sm:py-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'individual' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Tags className="w-3.5 h-3.5 sm:w-4 h-4" />
                        Individual
                    </button>
                    <button
                        onClick={() => setActiveTab('multiple')}
                        className={`flex-1 py-3 sm:py-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'multiple' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                    >
                        <LayoutList className="w-3.5 h-3.5 sm:w-4 h-4" />
                        Múltiple
                    </button>
                </div>

                <div className="p-4 sm:p-8">
                    {activeTab === 'individual' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12 animate-in fade-in duration-500">
                            {/* Selector de Producto */}
                            <div className="space-y-4 sm:space-y-6">
                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Search className="w-4 h-4 text-blue-600" />
                                        Buscar Producto
                                    </label>
                                    <div className="relative">
                                        <div className="flex gap-2">
                                            <div className="relative flex-grow">
                                                <div className="relative">
                                                    <input
                                                        ref={inputRef}
                                                        type="text"
                                                        value={searchTerm}
                                                        onChange={(e) => handleSearch(e.target.value)}
                                                        placeholder="Nombre o código..."
                                                        className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-base sm:text-lg"
                                                    />
                                                    {searchTerm && (
                                                        <button
                                                            onClick={() => { setSearchTerm(''); setSuggestions([]); setShowSuggestions(false); }}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors z-10"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleVoiceSearch}
                                                    className={`p-3 sm:p-4 rounded-xl border-2 transition-all flex items-center justify-center shadow-sm ${isListening ? 'bg-red-50 border-red-200 text-red-600' : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-blue-500 hover:text-blue-600 active:scale-95'}`}
                                                    title="Voz"
                                                >
                                                    <Mic className={`w-4 h-4 sm:w-5 h-5 ${isListening ? 'animate-pulse' : ''}`} />
                                                </button>
                                                <button
                                                    onClick={() => setIsScanning(true)}
                                                    className="p-3 sm:p-4 rounded-xl border-2 bg-gray-50 border-gray-200 text-gray-400 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center shadow-sm active:scale-95"
                                                    title="Cámara"
                                                >
                                                    <Camera className="w-4 h-4 sm:w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Sugerencias Flotantes */}
                                        {showSuggestions && (
                                            <div className="absolute z-[60] left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-80 overflow-y-auto animate-in slide-in-from-top-2">
                                                <div className="sticky top-0 bg-gray-50/90 backdrop-blur-sm px-4 py-2 text-[10px] font-bold text-gray-400 flex justify-between items-center border-b border-gray-100 z-10">
                                                    <span>RESULTADOS</span>
                                                    <span>{suggestions.length} encontrados</span>
                                                </div>
                                                <div className="divide-y divide-gray-50">
                                                    {suggestions.map((p) => (
                                                        <button
                                                            key={p.code}
                                                            onClick={() => handleSelectProduct(p)}
                                                            className="w-full flex items-center gap-3 p-4 hover:bg-blue-50 active:bg-blue-100 transition-all text-left group"
                                                        >
                                                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 flex-shrink-0 group-hover:scale-110 transition-transform">
                                                                <Package className="w-5 h-5" />
                                                            </div>
                                                            <div className="flex-grow min-w-0">
                                                                <div className="font-bold text-gray-900 truncate">{p.description}</div>
                                                                <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                                                                    ID: {p.code} {p.barcode && <span className="ml-2 text-blue-400 font-bold">| {p.barcode}</span>}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                                        {selectedProduct && (
                                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 sm:p-6 animate-in zoom-in duration-300 relative overflow-hidden">
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-full"></div>
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black uppercase rounded shadow-sm tracking-widest">Seleccionado</span>
                                            <button onClick={() => setSelectedProduct(null)} className="text-blue-300 hover:text-blue-600 p-1 transition-colors">
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <h3 className="text-base sm:text-2xl font-black text-blue-900 mb-4 leading-tight uppercase pr-4">{selectedProduct.description}</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="bg-white p-3 rounded-xl border border-blue-50 shadow-sm">
                                                <div className="text-[9px] text-blue-400 uppercase font-black mb-1 tracking-tighter">Código Interno</div>
                                                <div className="font-mono text-blue-800 font-bold text-sm">{selectedProduct.code}</div>
                                            </div>
                                            <div className={`p-3 rounded-xl border transition-all shadow-sm ${isEditingBarcode ? 'bg-white border-blue-500 ring-4 ring-blue-50' : 'bg-white border-blue-50'}`}>
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="text-[9px] text-blue-400 uppercase font-black tracking-tighter">Código Barras</div>
                                                    {!isEditingBarcode ? (
                                                        <div className="flex gap-1.5">
                                                            <button
                                                                onClick={() => setIsEditingBarcode(true)}
                                                                className="p-1 hover:bg-blue-50 rounded text-blue-400 transition-colors"
                                                                title="Editar"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => { setIsScanning(true); setIsScanningForUpdate(true); }}
                                                                className="p-1 hover:bg-green-50 rounded text-green-400 transition-colors"
                                                                title="Escanear"
                                                            >
                                                                <Camera className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setIsEditingBarcode(false)}
                                                            className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>

                                                {isEditingBarcode ? (
                                                    <div className="flex gap-2">
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={tempBarcode}
                                                            onChange={(e) => setTempBarcode(e.target.value)}
                                                            className="w-full bg-transparent font-mono text-blue-900 font-bold outline-none text-sm"
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleUpdateBarcode();
                                                                if (e.key === 'Escape') setIsEditingBarcode(false);
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => handleUpdateBarcode()}
                                                            disabled={isUpdatingBarcode}
                                                            className="bg-blue-600 text-white p-1 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-200"
                                                        >
                                                            {isUpdatingBarcode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="cursor-pointer"
                                                        onClick={() => setIsEditingBarcode(true)}
                                                    >
                                                        <div className={`font-mono font-bold text-sm ${selectedProduct.barcode ? 'text-blue-900' : 'text-blue-200 italic'}`}>
                                                            {selectedProduct.barcode || 'Sin código'}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Formulario de Fechas */}
                            <div className="bg-gray-50 rounded-2xl p-4 sm:p-8 border border-gray-100 space-y-4 sm:space-y-6">
                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                        Fecha de Ingreso
                                    </label>
                                    <input
                                        type="date"
                                        value={fechaIngreso}
                                        onChange={(e) => {
                                            setFechaIngreso(e.target.value);
                                            if (e.target.value) setFechaIngresoError(false);
                                        }}
                                        className={`w-full px-3 py-2 sm:px-4 sm:py-3 bg-white border-2 rounded-xl outline-none transition-all ${fechaIngresoError ? 'border-red-500 ring-4 ring-red-100' : 'border-gray-200 focus:border-blue-500'}`}
                                    />
                                    {fechaIngresoError && <p className="text-red-500 text-[10px] mt-1 font-bold animate-bounce">* Campo obligatorio</p>}
                                </div>

                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                        Fecha de Vencimiento
                                    </label>
                                    <input
                                        type="date"
                                        value={fechaVencimiento}
                                        onChange={(e) => setFechaVencimiento(e.target.value)}
                                        className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-2 italic">Opcional. Deja vacío si no aplica.</p>
                                </div>

                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-gray-400" />
                                        Cantidad
                                    </label>
                                    <input
                                        type="text"
                                        value={cantidad}
                                        onChange={(e) => setCantidad(e.target.value)}
                                        placeholder="Ej: 50 unidades, 10kg, etc."
                                        className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>

                                <div className="pt-4 sm:pt-6 space-y-2 sm:space-y-3">
                                    {/* Botón de Impresión (Principal) */}
                                    <button
                                        onClick={handlePrintPDF}
                                        disabled={!selectedProduct || printing || generating}
                                        className={`w-full py-4 rounded-2xl font-black text-sm sm:text-lg flex items-center justify-center gap-3 transition-all shadow-xl active:scale-95
                                        ${!selectedProduct || printing || generating
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                                                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'}`}
                                    >
                                        {printing ? (
                                            <Loader2 className="w-5 h-5 sm:w-6 h-6 animate-spin" />
                                        ) : (
                                            <PrinterIcon className="w-5 h-5 sm:w-6 h-6" />
                                        )}
                                        {printing ? 'Preparando...' : 'IMPRIMIR ETIQUETA'}
                                    </button>

                                    {/* Botón de Descargar (Secundario) */}
                                    <button
                                        onClick={handleGeneratePDF}
                                        disabled={!selectedProduct || generating || printing}
                                        className={`w-full py-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all border-2
                                        ${!selectedProduct || generating || printing
                                                ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                                                : 'border-blue-600 text-blue-600 hover:bg-blue-50 hover:border-blue-700'}`}
                                    >
                                        {generating ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                        {generating ? 'Generando...' : 'DESCARGAR PDF'}
                                    </button>

                                    {!selectedProduct && (
                                        <p className="text-center text-xs text-red-500 mt-3 font-medium animate-pulse">Debes elegir un producto primero</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
                            {/* Multiple Products Selector */}
                            <div className="bg-blue-50/30 border-2 border-blue-100 rounded-2xl p-4 sm:p-8">
                                <div className="flex justify-between items-center mb-3 sm:mb-6">
                                    <label className="text-[10px] sm:text-sm font-bold text-blue-700 uppercase tracking-widest flex items-center gap-2">
                                        <Plus className="w-4 h-4 sm:w-5 h-5" />
                                        Añadir productos
                                    </label>
                                    <div className="flex items-center gap-2 bg-white px-2 py-0.5 sm:px-3 sm:py-1 rounded-full border border-blue-100 shadow-sm">
                                        <span className={`text-[10px] sm:text-xs font-black ${multiProducts.length >= 6 ? 'text-red-500' : 'text-blue-600'}`}>
                                            {multiProducts.length} / 6
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3">
                                    <div className="relative w-full">
                                        <div className="relative">
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={searchTerm}
                                                onChange={(e) => handleSearch(e.target.value)}
                                                placeholder={multiProducts.length >= 6 ? "Límite alcanzado" : "Buscar nombre o código..."}
                                                disabled={multiProducts.length >= 6}
                                                className={`w-full px-4 py-3 sm:px-6 sm:py-5 bg-white border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-base sm:text-lg shadow-sm ${multiProducts.length >= 6 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            />
                                            {searchTerm && (
                                                <button
                                                    onClick={() => { setSearchTerm(''); setSuggestions([]); setShowSuggestions(false); }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors z-10"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Sugerencias Flotantes con mejor posicionamiento */}
                                        {showSuggestions && (
                                            <div className="absolute z-[60] left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-blue-100 max-h-[60vh] overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                                                <div className="sticky top-0 bg-blue-50/90 backdrop-blur-sm px-4 py-2.5 text-[10px] font-bold text-blue-600 flex justify-between items-center border-b border-blue-100">
                                                    <span className="flex items-center gap-2 tracking-widest"><Search className="w-3 h-3" /> RESULTADOS</span>
                                                    <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full">{suggestions.length}</span>
                                                </div>
                                                <div className="divide-y divide-gray-50">
                                                    {suggestions.map((p) => (
                                                        <button
                                                            key={p.code}
                                                            onClick={() => handleSelectProduct(p)}
                                                            className="w-full flex items-center gap-3 p-4 hover:bg-blue-50 active:bg-blue-100 transition-all text-left group"
                                                        >
                                                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform flex-shrink-0 border border-blue-100">
                                                                <Package className="w-5 h-5" />
                                                            </div>
                                                            <div className="flex-grow min-w-0">
                                                                <div className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors truncate">{p.description}</div>
                                                                <div className="text-[10px] text-gray-500 font-mono flex items-center gap-2">
                                                                    <span className="bg-gray-100 px-1 py-0.5 rounded">COD: {p.code}</span>
                                                                    {p.barcode && <span className="text-blue-400 font-bold">| {p.barcode}</span>}
                                                                </div>
                                                            </div>
                                                            <div className="bg-blue-600 text-white p-2 rounded-xl shadow-lg shadow-blue-200 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-all">
                                                                <Plus className="w-4 h-4" />
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2 w-full">
                                        <button
                                            onClick={handleVoiceSearch}
                                            disabled={multiProducts.length >= 6}
                                            className={`flex-1 p-3.5 rounded-xl border-2 transition-all flex items-center justify-center gap-2 font-bold text-xs shadow-sm ${isListening ? 'bg-red-50 border-red-200 text-red-600 active:scale-95' : 'bg-white border-gray-100 text-gray-500 hover:border-blue-500 hover:text-blue-600 active:scale-95'} ${multiProducts.length >= 6 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <Mic className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
                                            {isListening ? 'Escuchando...' : 'Voz'}
                                        </button>
                                        <button
                                            onClick={() => setIsScanning(true)}
                                            disabled={multiProducts.length >= 6}
                                            className={`flex-1 p-3.5 rounded-xl border-2 bg-white border-gray-100 text-gray-500 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center gap-2 font-bold text-xs shadow-sm active:scale-95 ${multiProducts.length >= 6 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <Camera className="w-4 h-4" />
                                            Cámara
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Lista de Productos (Cards Responsivas) */}
                            <div className={`space-y-4 transition-all duration-300 ${showSuggestions ? 'opacity-20 blur-[1px] pointer-events-none' : 'opacity-100'}`}>
                                <div className="flex items-center gap-3 px-2">
                                    <LayoutList className="w-5 h-5 text-gray-400" />
                                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Productos Seleccionados</h3>
                                </div>

                                {multiProducts.length === 0 ? (
                                    !showSuggestions && (
                                        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl py-16 px-8 text-center">
                                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                                                <Package className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-gray-400 font-medium max-w-[200px] mx-auto text-sm">No hay productos. Usa el buscador para añadir.</p>
                                        </div>
                                    )
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        {multiProducts.map((item, idx) => (
                                            <div
                                                key={`${item.code}-${idx}`}
                                                className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-4 hover:shadow-lg hover:shadow-blue-500/5 transition-all group relative overflow-hidden"
                                            >
                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-full"></div>

                                                <div className="flex justify-between items-start gap-3">
                                                    <div className="min-w-0">
                                                        <h4 className="font-bold text-gray-900 leading-tight pr-2 group-hover:text-blue-700 transition-colors uppercase text-xs sm:text-base">
                                                            {item.description}
                                                        </h4>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="font-mono text-[9px] sm:text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-100 uppercase">
                                                                COD: {item.code}
                                                            </span>
                                                            {item.barcode && (
                                                                <span className="flex items-center gap-1 text-[9px] text-blue-500 font-bold uppercase tracking-tighter">
                                                                    <BarcodeIcon className="w-3 h-3" /> BCD
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveMultiProduct(idx)}
                                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all flex-shrink-0"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-3 pt-3 border-t border-gray-50">
                                                    <div className="flex-grow">
                                                        <div className="relative">
                                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                                                <LayoutList className="w-4 h-4" />
                                                            </div>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={item.labelCantidad}
                                                                onChange={(e) => handleUpdateMultiQty(idx, e.target.value)}
                                                                placeholder="Ingresar cantidad..."
                                                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:border-blue-500 focus:bg-white outline-none text-sm font-bold transition-all shadow-inner"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Botones de Acción Globales */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={handlePrintMultiPDF}
                                    disabled={multiProducts.length === 0 || printing || generating}
                                    className={`group py-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-3 transition-all shadow-xl active:scale-95
                                    ${multiProducts.length === 0 || printing || generating
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 active:shadow-inner'}`}
                                >
                                    {printing ? <Loader2 className="w-5 h-5 animate-spin" /> : <PrinterIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                                    {printing ? 'Preparando...' : 'IMPRIMIR PLIEGO'}
                                </button>
                                <button
                                    onClick={handleGenerateMultiPDF}
                                    disabled={multiProducts.length === 0 || generating || printing}
                                    className={`py-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all border-2
                                    ${multiProducts.length === 0 || generating || printing
                                            ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                                            : 'border-blue-600 text-blue-600 hover:bg-blue-50 hover:border-blue-700 active:scale-95'}`}
                                >
                                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    {generating ? 'Generando...' : 'DESCARGAR PDF'}
                                </button>
                            </div>
                        </div>
                    )}

                </div>

                {/* Info Bar */}
                <div className="bg-gray-50/50 border-t border-gray-100 px-4 sm:px-8 py-3 flex flex-row justify-between items-center text-[9px] sm:text-xs text-gray-400 font-bold uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`}></div>
                        {isSyncing ? 'Sincronizando' : 'Sistema Online'}
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} /> A4</span>
                        <span>WiFi Direct</span>
                    </div>
                </div>
            </div>

            {/* Scanner Overlay */}
            {isScanning && (
                <div className="fixed inset-0 z-[100] bg-black">
                    <Suspense fallback={<div className="flex items-center justify-center h-full text-white">Cargando escáner...</div>}>
                        <Scanner
                            onScan={handleScan}
                            onCancel={() => setIsScanning(false)}
                            isEnabled={isScanning}
                        />
                    </Suspense>
                </div>
            )}
        </div>
    );
};

export default EtiquetasPage;
