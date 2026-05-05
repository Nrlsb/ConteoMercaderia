import React from 'react';
import ReactDOM from 'react-dom';

const Modal = ({ isOpen, onClose, title, message, type = 'info', confirmText, onConfirm }) => {
    if (!isOpen) return null;

    const typeStyles = {
        info: 'bg-blue-100 text-blue-800 border-blue-200',
        success: 'bg-green-100 text-green-800 border-green-200',
        warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        error: 'bg-red-100 text-red-800 border-red-200'
    };

    const buttonStyles = {
        info: 'bg-brand-blue hover:bg-blue-800',
        success: 'bg-green-600 hover:bg-green-700',
        warning: 'bg-yellow-600 hover:bg-yellow-700',
        error: 'bg-red-600 hover:bg-red-700'
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden transform transition-all scale-100 shadow-2xl border border-gray-100">
                {/* Header */}
                <div className={`px-6 py-4 border-b ${typeStyles[type]}`}>
                    <h3 className="text-lg font-bold">{title}</h3>
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-gray-700 text-base leading-relaxed whitespace-pre-wrap">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
                    {onConfirm ? (
                        <>
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 text-gray-700 bg-gray-200 hover:bg-gray-300 font-bold rounded-xl transition-all active:scale-95 shadow-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={onConfirm}
                                className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2 ${buttonStyles[type]}`}
                            >
                                {confirmText || 'Confirmar'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onClose}
                            className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 ${buttonStyles[type]}`}
                        >
                            {confirmText || 'Entendido'}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default Modal;
