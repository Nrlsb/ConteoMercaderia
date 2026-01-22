import React, { useState, useEffect, useRef } from 'react';

const FichajeModal = ({ isOpen, onClose, onConfirm, product, existingQuantity, expectedQuantity }) => {
    const [quantity, setQuantity] = useState('');
    const inputRef = useRef(null);

    // Reset quantity when modal opens or product changes
    useEffect(() => {
        if (isOpen) {
            setQuantity('');
            // Focus input after a short delay to ensure modal is rendered
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen, product]);

    const handleSubmit = (e) => {
        e.preventDefault();
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
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-1">{product.description || product.name}</h4>
                        <p className="text-sm text-gray-500 font-mono bg-gray-100 inline-block px-2 py-1 rounded">{product.code}</p>
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
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full h-14 px-4 text-2xl font-bold text-center border-2 border-brand-blue rounded-lg focus:ring-4 focus:ring-brand-blue/20 focus:border-brand-blue outline-none transition"
                            placeholder="0"
                            autoComplete="off"
                        />
                    </div>

                    {isOverExpected && (
                        <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded-lg flex items-center">
                            <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <p className="text-sm text-red-700 font-bold">
                                No puedes superar la cantidad solicitada.
                            </p>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end border-t border-gray-200">
                    <button
                        onClick={onClose}
                        type="button"
                        className="px-6 py-3 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!quantity || parseInt(quantity, 10) < 1 || isOverExpected}
                        type="submit"
                        className={`px-6 py-3 font-bold rounded-lg shadow-md transition transform active:scale-95 flex items-center
                            ${(!quantity || parseInt(quantity, 10) < 1 || isOverExpected)
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                                : 'bg-brand-blue text-white hover:bg-blue-700 hover:shadow-lg'
                            }
                        `}
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FichajeModal;
