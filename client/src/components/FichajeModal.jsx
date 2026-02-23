import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { toast } from 'sonner';

const FichajeModal = ({ isOpen, onClose, onConfirm, product, existingQuantity, expectedQuantity, isSubmitting }) => {
    const [quantity, setQuantity] = useState('');
    const [isEditingBarcode, setIsEditingBarcode] = useState(false);
    const [barcodeInput, setBarcodeInput] = useState('');
    const [currentBarcode, setCurrentBarcode] = useState('');
    const [isUpdatingBarcode, setIsUpdatingBarcode] = useState(false);

    const inputRef = useRef(null);
    const barcodeRef = useRef(null);

    // Reset quantity when modal opens or product changes
    useEffect(() => {
        if (isOpen) {
            setQuantity('');
            setIsEditingBarcode(false);
            setBarcodeInput(product?.barcode || '');
            setCurrentBarcode(product?.barcode || '');
            // Focus input after a short delay to ensure modal is rendered
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen, product]);

    const handleUpdateBarcode = async () => {
        if (!barcodeInput.trim()) {
            toast.error("El código de barras no puede estar vacío.");
            return;
        }

        setIsUpdatingBarcode(true);
        try {
            const response = await api.put(`/api/products/${product.code}/barcode`, {
                barcode: barcodeInput.trim()
            });
            setCurrentBarcode(barcodeInput.trim());
            setIsEditingBarcode(false);
            product.barcode = barcodeInput.trim(); // Update the local product object too
            toast.success("Código de barras actualizado en la base de datos.");

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
        const qty = parseInt(quantity, 10);
        if (!qty || qty < 1) return;
        onConfirm(qty);
    };

    if (!isOpen || !product) return null;

    const isOverExpected = expectedQuantity && (existingQuantity + (parseInt(quantity, 10) || 0) > expectedQuantity);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">

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



                    <div className="mb-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cantidad a Agregar
                        </label>
                        <input
                            ref={inputRef}
                            type="number"
                            min="1"
                            value={quantity}
                            disabled={isSubmitting}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full h-14 px-4 text-2xl font-bold text-center border-2 border-brand-blue rounded-lg focus:ring-4 focus:ring-brand-blue/20 focus:border-brand-blue outline-none transition disabled:opacity-50"
                            placeholder="0"
                            autoComplete="off"
                        />
                    </div>

                    {isOverExpected && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center">
                            <svg className="w-5 h-5 text-amber-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            <p className="text-sm text-amber-700 font-bold">
                                Atención: Estas superando la cantidad solicitada.
                            </p>
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
                        disabled={!quantity || parseInt(quantity, 10) < 1 || isSubmitting}
                        type="submit"
                        form="fichaje-form"
                        className={`px-6 py-3 font-bold rounded-lg shadow-md transition transform active:scale-95 flex items-center
                            ${(!quantity || parseInt(quantity, 10) < 1 || isSubmitting)
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
        </div>
    );
};

export default FichajeModal;
