import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

import api from '../api';
import { toast } from 'sonner';
import Scanner from './Scanner';
import Calculator from './Calculator';

const FichajeModal = ({ isOpen, onClose, onConfirm, product, existingQuantity, expectedQuantity, isSubmitting, receiptId, isEgreso = false }) => {
    const [quantity, setQuantity] = useState('');
    const [selectedUnit, setSelectedUnit] = useState('primary');
    const [isEditingBarcode, setIsEditingBarcode] = useState(false);
    const [barcodeInput, setBarcodeInput] = useState('');
    const [currentBarcode, setCurrentBarcode] = useState('');
    const [isUpdatingBarcode, setIsUpdatingBarcode] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
    const [viewportOffset, setViewportOffset] = useState(0);
    const [showCalc, setShowCalc] = useState(false);
    const [isScanningBarcode, setIsScanningBarcode] = useState(false);
    const [isEditingSecondaryBarcode, setIsEditingSecondaryBarcode] = useState(false);
    const [secondaryBarcodeInput, setSecondaryBarcodeInput] = useState('');
    const [currentSecondaryBarcode, setCurrentSecondaryBarcode] = useState('');
    const [isUpdatingSecondaryBarcode, setIsUpdatingSecondaryBarcode] = useState(false);
    const [isScanningSecondaryBarcode, setIsScanningSecondaryBarcode] = useState(false);

    const inputRef = useRef(null);
    const barcodeRef = useRef(null);
    const secondaryBarcodeRef = useRef(null);
    const overlayRef = useRef(null);

    // Listen to visualViewport to detect keyboard open/close
    useEffect(() => {
        if (!isOpen) return;

        const viewport = window.visualViewport;
        if (!viewport) return;

        const handleResize = () => {
            setViewportHeight(viewport.height);
            setViewportOffset(viewport.offsetTop);
        };

        viewport.addEventListener('resize', handleResize);
        viewport.addEventListener('scroll', handleResize);

        // Initial check
        handleResize();

        return () => {
            viewport.removeEventListener('resize', handleResize);
            viewport.removeEventListener('scroll', handleResize);
        };
    }, [isOpen]);

    // Reset quantity when modal opens or product changes
    useEffect(() => {
        if (isOpen) {
            setQuantity('1'); // Siempre por defecto 1
            setIsEditingBarcode(false);
            setBarcodeInput(product?.barcode || '');
            setCurrentBarcode(product?.barcode || '');
            setSecondaryBarcodeInput(product?.barcode_secondary || '');
            setCurrentSecondaryBarcode(product?.barcode_secondary || '');
            setIsEditingSecondaryBarcode(false);
            setShowCalc(false);
            setSelectedUnit('primary');
            setIsScanningBarcode(false);
            setIsScanningSecondaryBarcode(false);
            // Focus input inmediatamente en el siguiente frame de pintura
            requestAnimationFrame(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.select();
                }
            });
        }
    }, [isOpen, product]);


    const handleUpdateBarcode = async () => {
        if (!barcodeInput.trim()) {
            toast.error("El código de barras no puede estar vacío.");
            return;
        }

        setIsUpdatingBarcode(true);
        try {
            const oldBarcode = currentBarcode; // Save old barcode for history
            const response = await api.put(`/api/products/${product.code}/barcode`, {
                barcode: barcodeInput.trim()
            });
            setCurrentBarcode(barcodeInput.trim());
            setIsEditingBarcode(false);
            product.barcode = barcodeInput.trim(); // Update the local product object too
            toast.success("Código de barras actualizado en la base de datos.");

            // Log history
            try {
                // Determine the correct product_id (it could be 'id' if pure product, or 'product_id' if from a remito item)
                const pId = response.data?.id || product.id || product.product_id;

                if (pId) {
                    await api.post('/api/barcode-history', {
                        action_type: 'edit',
                        product_id: pId,
                        product_description: product.description || product.name || 'Producto sin descripción',
                        details: `Cód Barras modificado a: ${barcodeInput.trim()}`
                    });
                }

                // If we are within a receipt, log to receipt history too
                if (receiptId) {
                    await api.post('/api/receipt-items-history/barcode', {
                        receipt_id: receiptId,
                        product_code: product.code,
                        new_barcode: barcodeInput.trim(),
                        old_barcode: oldBarcode
                    });
                }
            } catch (historyErr) {
                console.error('Error logging history:', historyErr);
                // Non-blocking error
            }

            // Refocus quantity input
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);

        } catch (error) {
            console.error('Error updating barcode:', error);
            const msg = error.response?.data?.message || 'Error al actualizar el código de barras';
            toast.error(msg);
        } finally {
            setIsUpdatingBarcode(false);
        }
    };

    const handleUpdateSecondaryBarcode = async () => {
        if (!secondaryBarcodeInput.trim()) {
            toast.error("El código secundario no puede estar vacío.");
            return;
        }

        setIsUpdatingSecondaryBarcode(true);
        try {
            const response = await api.put(`/api/products/${product.code}/barcode-secondary`, {
                barcode_secondary: secondaryBarcodeInput.trim()
            });
            setCurrentSecondaryBarcode(secondaryBarcodeInput.trim());
            setIsEditingSecondaryBarcode(false);
            product.barcode_secondary = secondaryBarcodeInput.trim();
            toast.success("Código secundario actualizado.");

            // Log history
            try {
                const pId = response.data?.id || product.id || product.product_id;
                if (pId) {
                    await api.post('/api/barcode-history', {
                        action_type: 'edit_secondary',
                        product_id: pId,
                        product_description: product.description || product.name || 'Producto sin descripción',
                        details: `Cód Secundario modificado a: ${secondaryBarcodeInput.trim()}`
                    });
                }
            } catch (err) { console.error(err); }

            setTimeout(() => { inputRef.current?.focus(); }, 100);
        } catch (error) {
            console.error('Error updating secondary barcode:', error);
            toast.error(error.response?.data?.message || 'Error al actualizar el código secundario');
        } finally {
            setIsUpdatingSecondaryBarcode(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isSubmitting) return; // Guard
        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) return;

        let finalQty = qty;
        if (selectedUnit === 'secondary' && product?.conversion_factor) {
            const factor = Number(product.conversion_factor);
            // Invert logic: If IM is selected, the input is in UNITS, and we want to record BOXES
            if (product.conversion_type === 'Divisor') {
                finalQty = qty * factor;
            } else {
                finalQty = qty / factor;
            }
        }

        onConfirm(finalQty);
    };

    if (!isOpen || !product) return null;

    // Converted quantity for display
    const parsedQty = parseFloat(quantity) || 0;
    let convertedQtyText = '';
    if (parsedQty > 0 && product?.conversion_factor && selectedUnit === 'secondary') {
        const factor = Number(product.conversion_factor);
        const finalVal = product.conversion_type === 'Divisor' ? parsedQty * factor : parsedQty / factor;
        // Round to 3 decimals to avoid floating point issues
        const roundedVal = Math.round(finalVal * 1000) / 1000;
        convertedQtyText = `Equivale a ${roundedVal} ${product.secondary_unit}`;
    }

    // Excess validation
    const actualQtyToAdd = selectedUnit === 'secondary' && product?.conversion_factor ? (product.conversion_type === 'Divisor' ? parsedQty / Number(product.conversion_factor) : parsedQty * Number(product.conversion_factor)) : parsedQty;
    const wouldExceed = expectedQuantity > 0 && (existingQuantity + actualQtyToAdd) > expectedQuantity;
    const excessAmount = wouldExceed ? (existingQuantity + actualQtyToAdd) - expectedQuantity : 0;

    return ReactDOM.createPortal(
        <div
            ref={overlayRef}
            className={`fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4 pb-8 sm:pb-4 ${(isScanningBarcode || isScanningSecondaryBarcode) ? 'bg-transparent' : 'bg-black/60'}`}
            style={{ 
                height: `${viewportHeight}px`,
                top: `${viewportOffset}px`,
                overflow: 'hidden'
            }}
        >
            <div 
                className={`bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col transition-transform duration-150 ease-out ${(isScanningBarcode || isScanningSecondaryBarcode) ? 'opacity-0 invisible pointer-events-none' : 'opacity-100 visible animate-[slideUp_150ms_ease-out]'}`}
                style={{ maxHeight: viewportHeight < 500 ? '85vh' : `${viewportHeight * 0.95}px` }}
            >
                {/* Header */}
                <div className="bg-brand-blue/10 px-6 py-4 border-b border-brand-blue/20 flex-shrink-0 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-brand-dark flex items-center">
                        <svg className="w-6 h-6 mr-2 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        Fichar Producto
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {/* Body - Scrollable wrapper */}
                <div className="flex-grow overflow-y-auto">
                    <form id="fichaje-form" onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-1">{product.description || product.name}</h4>
                        <div className="flex flex-col gap-2">
                            <div>
                                <span className="text-xs font-bold text-gray-500 uppercase">Código Interno: </span>
                                <span className="text-sm text-gray-700 font-mono bg-gray-100 inline-block px-2 py-0.5 rounded">{product.code}</span>
                            </div>

                            {/* Barcode Edit Section */}
                            <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Código de Barras (Escaneable)</label>

                                {isEditingBarcode ? (
                                    <div className="flex gap-2">
                                        <input
                                            ref={barcodeRef}
                                            type="text"
                                            value={barcodeInput}
                                            onChange={(e) => setBarcodeInput(e.target.value)}
                                            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue outline-none text-sm"
                                            placeholder="Escanear o tipear código..."
                                            disabled={isUpdatingBarcode}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setIsScanningBarcode(true)}
                                            disabled={isUpdatingBarcode}
                                            className="p-2 bg-brand-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                                            title="Escanear con cámara"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleUpdateBarcode}
                                            disabled={isUpdatingBarcode}
                                            className="px-3 py-2 bg-brand-success text-white rounded-lg text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors"
                                        >
                                            {isUpdatingBarcode ? '...' : 'Guardar'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingBarcode(false);
                                                setBarcodeInput(currentBarcode);
                                            }}
                                            disabled={isUpdatingBarcode}
                                            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300 disabled:opacity-50 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-bold text-gray-900 font-mono">
                                            {currentBarcode ? currentBarcode : <span className="text-gray-400 italic">Sin código de barras</span>}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingBarcode(true);
                                                setTimeout(() => barcodeRef.current?.focus(), 50);
                                            }}
                                            className="p-1.5 text-brand-blue hover:bg-blue-50 rounded-md transition-colors"
                                            title="Editar código de barras"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                            {/* Secondary Barcode Edit Section */}
                            <div className="mt-2 p-3 bg-blue-50/30 rounded-lg border border-blue-100">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Código Secundario (Bulto/Caja)</label>

                                {isEditingSecondaryBarcode ? (
                                    <div className="flex gap-2">
                                        <input
                                            ref={secondaryBarcodeRef}
                                            type="text"
                                            value={secondaryBarcodeInput}
                                            onChange={(e) => setSecondaryBarcodeInput(e.target.value)}
                                            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue outline-none text-sm"
                                            placeholder="Escanear bulto..."
                                            disabled={isUpdatingSecondaryBarcode}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setIsScanningSecondaryBarcode(true)}
                                            disabled={isUpdatingSecondaryBarcode}
                                            className="p-2 bg-brand-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleUpdateSecondaryBarcode}
                                            disabled={isUpdatingSecondaryBarcode}
                                            className="px-3 py-2 bg-brand-success text-white rounded-lg text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors"
                                        >
                                            {isUpdatingSecondaryBarcode ? '...' : 'Guardar'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingSecondaryBarcode(false);
                                                setSecondaryBarcodeInput(currentSecondaryBarcode);
                                            }}
                                            disabled={isUpdatingSecondaryBarcode}
                                            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300 disabled:opacity-50 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-bold text-gray-900 font-mono">
                                            {currentSecondaryBarcode ? currentSecondaryBarcode : <span className="text-gray-400 italic">No asociado</span>}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingSecondaryBarcode(true);
                                                setTimeout(() => secondaryBarcodeRef.current?.focus(), 50);
                                            }}
                                            className="p-1.5 text-brand-blue hover:bg-blue-100 rounded-md transition-colors"
                                            title="Editar código secundario"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Unit Selection Toggle */}
                    {product?.secondary_unit && (
                        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Unidad de Medida</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedUnit('primary')}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-colors ${selectedUnit === 'primary' ? 'bg-brand-blue text-white shadow-md' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-10'}`}
                                >
                                    {product.primary_unit || 'Unidad Base'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedUnit('secondary')}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-colors ${selectedUnit === 'secondary' ? 'bg-brand-blue text-white shadow-md' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-10'}`}
                                >
                                    {product.secondary_unit}
                                </button>
                            </div>
                            {product.conversion_factor && (
                                <p className="text-xs text-brand-blue mt-2 font-medium">
                                    Factor: 1 {product.secondary_unit} = {product.conversion_type === 'Divisor' ? `1/${product.conversion_factor}` : product.conversion_factor} {product.primary_unit || 'UN'}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="mb-2">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700">
                                Cantidad a Agregar
                            </label>
                            <button
                                type="button"
                                onClick={() => setShowCalc(prev => !prev)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${showCalc ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                title="Calculadora"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
                                </svg>
                                Calc
                            </button>
                        </div>
                        <input
                            ref={inputRef}
                            type="number"
                            min="1"
                            value={quantity}
                            disabled={isSubmitting}
                            onChange={(e) => setQuantity(e.target.value)}
                            className={`w-full h-14 px-4 text-2xl font-bold text-center border-2 rounded-lg focus:ring-4 outline-none transition disabled:opacity-50 ${(isEgreso && wouldExceed) ? 'border-red-500 focus:ring-red-200 focus:border-red-500' : 'border-brand-blue focus:ring-brand-blue/20 focus:border-brand-blue'}`}
                            placeholder="0"
                            autoComplete="off"
                        />

                        {convertedQtyText && (
                            <p className="text-sm text-green-600 font-bold mt-2 text-center bg-green-50 py-1 rounded-md border border-green-100">
                                {convertedQtyText}
                            </p>
                        )}

                        {/* Inline Calculator */}
                        {showCalc && (
                            <Calculator 
                                onConfirm={(val) => {
                                    setQuantity(String(Math.floor(parseFloat(val))));
                                    setShowCalc(false);
                                }}
                                onCancel={() => setShowCalc(false)}
                                initialValue={quantity || '0'}
                            />
                        )}
                    </div>

                    {/* Excess Warning */}
                    {isEgreso && wouldExceed && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                            </svg>
                            <div>
                                <p className="text-sm font-bold text-red-700">¡Cantidad excedida!</p>
                                <p className="text-xs text-red-800 font-bold mt-1">
                                    Excedido por {excessAmount} {excessAmount === 1 ? 'unidad' : 'unidades'}
                                </p>
                            </div>
                        </div>
                    )}


                    </form>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 flex-shrink-0 flex gap-3 justify-end border-t border-gray-200">
                    <button
                        onClick={onClose}
                        type="button"
                        disabled={isSubmitting}
                        className="px-6 py-3 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        disabled={!quantity || parseInt(quantity, 10) < 1 || isSubmitting || (isEgreso && wouldExceed)}
                        type="submit"
                        form="fichaje-form"
                        className={`px-6 py-3 font-bold rounded-lg shadow-md transition transform active:scale-95 flex items-center
                            ${(!quantity || parseInt(quantity, 10) < 1 || isSubmitting || (isEgreso && wouldExceed))
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                                : 'bg-brand-blue text-white hover:bg-blue-700 hover:shadow-lg'
                            }
                        `}
                    >
                        {isSubmitting ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        ) : (
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        )}
                        {isSubmitting ? 'Confirmando...' : 'Confirmar'}
                    </button>
                </div>
            </div>

            {/* Barcode Scanner Overlay */}
            {isScanningBarcode && (
                <div className="fixed inset-0 z-[100] bg-transparent flex flex-col">
                    <div className="flex-1 relative">
                        <Scanner
                            onScan={(code) => {
                                setBarcodeInput(code);
                                setIsScanningBarcode(false);
                                toast.success("Código escaneado correctamente");
                            }}
                            onCancel={() => setIsScanningBarcode(false)}
                        />
                    </div>
                </div>
            )}
            {/* Barcode Scanner Overlay (Secondary) */}
            {isScanningSecondaryBarcode && (
                <div className="fixed inset-0 z-[2100] bg-transparent flex flex-col">
                    <div className="flex-1 relative">
                        <Scanner
                            onScan={(code) => {
                                setSecondaryBarcodeInput(code);
                                setIsScanningSecondaryBarcode(false);
                                toast.success("Código secundario escaneado");
                            }}
                            onCancel={() => setIsScanningSecondaryBarcode(false)}
                        />
                    </div>
                </div>
            )}
        </div >,
        document.body
    );
};

export default FichajeModal;
