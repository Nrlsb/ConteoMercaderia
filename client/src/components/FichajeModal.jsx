import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { toast } from 'sonner';
import Scanner from './Scanner';

const FichajeModal = ({ isOpen, onClose, onConfirm, product, existingQuantity, expectedQuantity, isSubmitting, receiptId, isEgreso = false }) => {
    const [quantity, setQuantity] = useState('');
    const [selectedUnit, setSelectedUnit] = useState('primary');
    const [isEditingBarcode, setIsEditingBarcode] = useState(false);
    const [barcodeInput, setBarcodeInput] = useState('');
    const [currentBarcode, setCurrentBarcode] = useState('');
    const [isUpdatingBarcode, setIsUpdatingBarcode] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [showCalc, setShowCalc] = useState(false);
    const [calcDisplay, setCalcDisplay] = useState('0');
    const [calcExpression, setCalcExpression] = useState('');
    const [calcJustEvaluated, setCalcJustEvaluated] = useState(false);
    const [isScanningBarcode, setIsScanningBarcode] = useState(false);

    const inputRef = useRef(null);
    const barcodeRef = useRef(null);
    const overlayRef = useRef(null);

    // Listen to visualViewport to detect keyboard open/close
    useEffect(() => {
        if (!isOpen) return;

        const viewport = window.visualViewport;
        if (!viewport) return;

        const handleResize = () => {
            // When keyboard opens, visualViewport.height shrinks
            const heightDiff = window.innerHeight - viewport.height;
            setKeyboardHeight(heightDiff > 50 ? heightDiff : 0);
        };

        viewport.addEventListener('resize', handleResize);
        viewport.addEventListener('scroll', handleResize);

        // Initial check
        handleResize();

        return () => {
            viewport.removeEventListener('resize', handleResize);
            viewport.removeEventListener('scroll', handleResize);
            setKeyboardHeight(0);
        };
    }, [isOpen]);

    // Reset quantity when modal opens or product changes
    useEffect(() => {
        if (isOpen) {
            setQuantity(isEgreso ? '1' : '');
            setIsEditingBarcode(false);
            setBarcodeInput(product?.barcode || '');
            setCurrentBarcode(product?.barcode || '');
            setShowCalc(false);
            setCalcDisplay('0');
            setCalcExpression('');
            setCalcJustEvaluated(false);
            setSelectedUnit('primary');
            setIsScanningBarcode(false);
            // Focus input after a short delay to ensure modal is rendered
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen, product]);

    const handleCalcInput = (val) => {
        const operators = ['+', '-', '×', '÷'];
        if (val === 'C') {
            setCalcDisplay('0');
            setCalcExpression('');
            setCalcJustEvaluated(false);
            return;
        }
        if (val === '⌫') {
            setCalcDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
            setCalcJustEvaluated(false);
            return;
        }
        if (val === '=') {
            try {
                const expr = (calcExpression + calcDisplay).replace(/×/g, '*').replace(/÷/g, '/');
                // eslint-disable-next-line no-new-func
                const result = Function('"use strict"; return (' + expr + ')')();
                const rounded = Math.round(result * 1000) / 1000;
                setCalcDisplay(String(rounded));
                setCalcExpression('');
                setCalcJustEvaluated(true);
            } catch {
                setCalcDisplay('Error');
                setCalcExpression('');
            }
            return;
        }
        if (val === '✓') {
            const num = parseFloat(calcDisplay);
            if (!isNaN(num) && num > 0) {
                setQuantity(String(Math.floor(num)));
                setShowCalc(false);
                setCalcDisplay('0');
                setCalcExpression('');
            }
            return;
        }
        if (operators.includes(val)) {
            setCalcExpression(calcExpression + calcDisplay + val);
            setCalcDisplay('0');
            setCalcJustEvaluated(false);
            return;
        }
        if (val === '.') {
            if (calcDisplay.includes('.')) return;
            setCalcDisplay(calcDisplay + '.');
            return;
        }
        // Digit
        if (calcJustEvaluated) {
            setCalcDisplay(val);
            setCalcJustEvaluated(false);
        } else {
            setCalcDisplay(calcDisplay === '0' ? val : calcDisplay + val);
        }
    };

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

    return (
        <div
            ref={overlayRef}
            className={`fixed inset-0 z-50 flex ${keyboardHeight > 0 ? 'items-end' : 'items-center'} justify-center p-4 bg-black/60 backdrop-blur-sm`}
            style={keyboardHeight > 0 ? { paddingBottom: `${keyboardHeight + 8}px` } : {}}
        >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 max-h-[80vh] overflow-y-auto">

                {/* Header */}
                <div className="bg-brand-blue/10 px-6 py-4 border-b border-brand-blue/20 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-brand-dark flex items-center">
                        <svg className="w-6 h-6 mr-2 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        Fichar Producto
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {/* Body */}
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
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl select-none">
                                {/* Display */}
                                <div className="bg-gray-800 text-white rounded-lg px-3 py-2 mb-2 text-right">
                                    {calcExpression && (
                                        <div className="text-xs text-gray-400 truncate">{calcExpression}</div>
                                    )}
                                    <div className="text-2xl font-bold font-mono truncate">{calcDisplay}</div>
                                </div>
                                {/* Buttons */}
                                <div className="grid grid-cols-4 gap-1.5">
                                    {[
                                        'C', '⌫', '÷', '×',
                                        '7', '8', '9', '-',
                                        '4', '5', '6', '+',
                                        '1', '2', '3', '=',
                                        '.', '0', '', '✓',
                                    ].map((btn, i) => {
                                        if (btn === '') return <div key={i} />;
                                        const isOperator = ['÷', '×', '-', '+'].includes(btn);
                                        const isEquals = btn === '=';
                                        const isConfirm = btn === '✓';
                                        const isClear = btn === 'C';
                                        const isBack = btn === '⌫';
                                        return (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => handleCalcInput(btn)}
                                                className={`h-11 rounded-lg text-base font-bold transition-colors active:scale-95
                                                    ${isConfirm ? 'bg-brand-blue text-white hover:bg-blue-700 col-span-1'
                                                        : isEquals ? 'bg-brand-blue/80 text-white hover:bg-brand-blue'
                                                            : isOperator ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                                : isClear ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                                                    : isBack ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                                        : 'bg-white text-gray-800 hover:bg-gray-100 border border-gray-200'}`}
                                            >
                                                {btn}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-xs text-gray-400 text-center mt-2">Presioná ✓ para usar el resultado como cantidad</p>
                            </div>
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

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end border-t border-gray-200">
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
                <div className="fixed inset-0 z-[100] bg-black flex flex-col">
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
        </div >
    );
};

export default FichajeModal;
