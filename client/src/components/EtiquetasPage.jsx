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
        // Verificar si ya existe? No, permitir duplicados si el usuario quiere
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
        
        let y = margin + 10;

        // Título
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('ETIQUETA DE PRODUCTOS MÚLTIPLES', pageWidth / 2, y, { align: 'center' });
        y += 10;

        // Cabecera de Tabla
        doc.setFontSize(10);
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.text('DESCRIPCIÓN', margin + 2, y + 5);
        doc.text('CANT', margin + contentWidth - 65, y + 5);
        doc.text('CÓDIGO DE BARRAS', margin + contentWidth - 35, y + 5);
        y += 12;

        for (const item of multiProducts) {
            // Verificar si entra en la página
            if (y > pageHeight - 30) {
                doc.addPage();
                y = margin + 10;
                // Repeater header on new page?
                doc.setFillColor(240, 240, 240);
                doc.rect(margin, y, contentWidth, 8, 'F');
                doc.text('DESCRIPCIÓN', margin + 2, y + 5);
                doc.text('CANT', margin + contentWidth - 65, y + 5);
                doc.text('CÓDIGO DE BARRAS', margin + contentWidth - 35, y + 5);
                y += 12;
            }

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            
            // Descripción (puede ser larga)
            const descLines = doc.splitTextToSize(item.description || 'Sin descripción', contentWidth - 80);
            doc.text(descLines, margin + 2, y + 4);
            
            // Cantidad
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(String(item.labelCantidad || '-'), margin + contentWidth - 65, y + 4);
            
            // Código de barras
            const barcodeText = item.barcode || item.code;
            if (barcodeText) {
                try {
                    const barcodeImg = await generateBarcodeBase64(String(barcodeText));
                    doc.addImage(barcodeImg, 'PNG', margin + contentWidth - 45, y - 2, 40, 12);
                } catch (err) {
                    console.error('Error in multi-barcode:', err);
                    doc.setFontSize(7);
                    doc.text(String(barcodeText), margin + contentWidth - 45, y + 4);
                }
            }

            const rowHeight = Math.max(descLines.length * 5, 15);
            y += rowHeight;
            
            // Línea separadora
            doc.setDrawColor(230);
            doc.line(margin, y - 2, margin + contentWidth, y - 2);
            y += 2;
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
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-4 sm:p-6 text-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2 sm:p-3 bg-white/10 rounded-xl backdrop-blur-md">
                            <PrinterIcon className="w-6 h-6 sm:w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">Impresión de Etiquetas</h1>
                            <p className="text-blue-100 text-[11px] sm:text-sm">Genera etiquetas A4 para tus productos con códigos de barras.</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                    <button 
                        onClick={() => setActiveTab('individual')}
                        className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'individual' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Tags className="w-4 h-4" />
                        Etiqueta Individual
                    </button>
                    <button 
                        onClick={() => setActiveTab('multiple')}
                        className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'multiple' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                    >
                        <LayoutList className="w-4 h-4" />
                        Etiqueta Múltiple
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
                                                    onClick={() => {setSearchTerm(''); setSuggestions([]); setShowSuggestions(false);}}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full text-gray-400"
                                                >
                                                    <X className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleVoiceSearch}
                                            className={`p-3 sm:p-4 rounded-xl border-2 transition-all flex items-center justify-center ${isListening ? 'bg-red-100 border-red-500 text-red-600 animate-pulse' : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-blue-500 hover:text-blue-600'}`}
                                            title="Buscar por Voz"
                                        >
                                            <Mic className={`w-5 h-5 sm:w-6 h-6 ${isListening ? 'animate-bounce' : ''}`} />
                                        </button>
                                        <button
                                            onClick={() => setIsScanning(true)}
                                            className="p-3 sm:p-4 rounded-xl border-2 bg-gray-50 border-gray-200 text-gray-400 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center"
                                            title="Buscar con Escáner"
                                        >
                                            <Camera className="w-5 h-5 sm:w-6 h-6" />
                                        </button>
                                    </div>

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
                                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 sm:p-6 animate-in zoom-in duration-300">
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-bold uppercase rounded-full tracking-widest">Seleccionado</span>
                                        <button onClick={() => setSelectedProduct(null)} className="text-blue-400 hover:text-blue-600 p-1">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <h3 className="text-xl sm:text-3xl font-bold text-blue-900 mb-2 leading-tight">{selectedProduct.description}</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 mt-4">
                                        <div className="bg-white/50 p-3 rounded-xl border border-blue-100">
                                            <div className="text-[10px] text-blue-500 uppercase font-bold mb-1">Código Interno</div>
                                            <div className="font-mono text-blue-900 font-bold">{selectedProduct.code}</div>
                                        </div>
                                        <div className={`p-3 rounded-xl border transition-all ${isEditingBarcode ? 'bg-white border-blue-500 ring-4 ring-blue-50' : 'bg-white/50 border-blue-100'}`}>
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="text-[10px] text-blue-500 uppercase font-bold">Código Barras</div>
                                                {!isEditingBarcode ? (
                                                    <div className="flex gap-1">
                                                        <button 
                                                            onClick={() => setIsEditingBarcode(true)}
                                                            className="p-1 hover:bg-white rounded shadow-sm text-blue-500"
                                                            title="Editar manualmente"
                                                        >
                                                            <Edit2 className="w-3 h-3" />
                                                        </button>
                                                        <button 
                                                            onClick={() => {setIsScanning(true); setIsScanningForUpdate(true);}}
                                                            className="p-1 hover:bg-white rounded shadow-sm text-green-500"
                                                            title="Escanear nuevo código"
                                                        >
                                                            <Camera className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        onClick={() => setIsEditingBarcode(false)}
                                                        className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                                    >
                                                        <X className="w-3 h-3" />
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
                                                        className="w-full bg-transparent font-mono text-blue-900 font-bold outline-none"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleUpdateBarcode();
                                                            if (e.key === 'Escape') setIsEditingBarcode(false);
                                                        }}
                                                    />
                                                    <button 
                                                        onClick={() => handleUpdateBarcode()}
                                                        disabled={isUpdatingBarcode}
                                                        className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700 disabled:opacity-50"
                                                    >
                                                        {isUpdatingBarcode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div 
                                                    className="cursor-pointer"
                                                    onClick={() => setIsEditingBarcode(true)}
                                                >
                                                    <div className={`font-mono font-bold ${selectedProduct.barcode ? 'text-blue-900' : 'text-blue-300 italic'}`}>
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
                                    className={`w-full py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95
                                        ${!selectedProduct || printing || generating
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' 
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200 shadow-indigo-100'}`}
                                >
                                    {printing ? (
                                        <Loader2 className="w-5 h-5 sm:w-6 h-6 animate-spin" />
                                    ) : (
                                        <PrinterIcon className="w-5 h-5 sm:w-6 h-6" />
                                    )}
                                    {printing ? 'Preparando...' : 'Imprimir Etiqueta'}
                                </button>

                                {/* Botón de Descargar (Secundario) */}
                                <button
                                    onClick={handleGeneratePDF}
                                    disabled={!selectedProduct || generating || printing}
                                    className={`w-full py-2 sm:py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all border-2
                                        ${!selectedProduct || generating || printing
                                            ? 'border-gray-200 text-gray-400 cursor-not-allowed' 
                                            : 'border-blue-600 text-blue-600 hover:bg-blue-50'}`}
                                >
                                    {generating ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Download className="w-4 h-4" />
                                    )}
                                    {generating ? 'Generando PDF...' : 'Descargar como PDF'}
                                </button>

                                {!selectedProduct && (
                                    <p className="text-center text-xs text-red-500 mt-3 font-medium animate-pulse">Debes elegir un producto primero</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in duration-500">
                            {/* Multiple Products Content */}
                            <div className="bg-blue-50/50 border-2 border-blue-100 rounded-2xl p-4 sm:p-6">
                                <label className="block text-xs sm:text-sm font-bold text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    Añadir productos a la etiqueta
                                </label>
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        placeholder="Busca por nombre o código para añadir..."
                                        className="w-full px-4 py-4 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-base sm:text-lg"
                                    />
                                    {showSuggestions && (
                                        <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 max-h-60 overflow-y-auto">
                                            {suggestions.map((p) => (
                                                <button
                                                    key={p.code}
                                                    onClick={() => handleSelectProduct(p)}
                                                    className="w-full flex items-center gap-4 p-4 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                                                >
                                                    <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center text-blue-600 flex-shrink-0">
                                                        <Package className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex-grow">
                                                        <div className="font-bold text-gray-900 text-sm">{p.description}</div>
                                                        <div className="text-[11px] text-gray-500">COD: {p.code}</div>
                                                    </div>
                                                    <Plus className="w-5 h-5 text-blue-400" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Producto</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Cantidad</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-20"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {multiProducts.length === 0 ? (
                                                <tr>
                                                    <td colSpan="3" className="px-6 py-12 text-center text-gray-400 italic">
                                                        No hay productos seleccionados. Usa el buscador superior para añadir.
                                                    </td>
                                                </tr>
                                            ) : (
                                                multiProducts.map((item, idx) => (
                                                    <tr key={`${item.code}-${idx}`} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="font-bold text-gray-900">{item.description}</div>
                                                            <div className="text-[11px] text-gray-500 font-mono">{item.barcode || item.code}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <input 
                                                                type="text"
                                                                value={item.labelCantidad}
                                                                onChange={(e) => handleUpdateMultiQty(idx, e.target.value)}
                                                                placeholder="Ej: 10"
                                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:border-blue-500 outline-none text-sm"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <button 
                                                                onClick={() => handleRemoveMultiProduct(idx)}
                                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                            >
                                                                <Trash2 className="w-5 h-5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                                <button
                                    onClick={handlePrintMultiPDF}
                                    disabled={multiProducts.length === 0 || printing || generating}
                                    className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-100"
                                >
                                    {printing ? <Loader2 className="w-6 h-6 animate-spin" /> : <PrinterIcon className="w-6 h-6" />}
                                    Imprimir Etiqueta Múltiple
                                </button>
                                <button
                                    onClick={handleGenerateMultiPDF}
                                    disabled={multiProducts.length === 0 || generating || printing}
                                    className="flex-1 py-4 border-2 border-blue-600 text-blue-600 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-blue-50 disabled:opacity-50 transition-all"
                                >
                                    {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                    Descargar PDF
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Info Bar */}
                <div className="bg-gray-50 border-t border-gray-100 px-4 sm:px-8 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-[10px] sm:text-xs text-gray-400 font-medium">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`}></div>
                        {isSyncing ? 'Sincronizando...' : 'Base actualizada'}
                    </div>
                    <div className="flex items-center gap-4">
                        <span>A4</span>
                        <span>WiFi / Direct Print</span>
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
