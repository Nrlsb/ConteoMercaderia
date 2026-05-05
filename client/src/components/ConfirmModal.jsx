import React from 'react';
import ReactDOM from 'react-dom';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden transform transition-all scale-100 shadow-2xl border border-gray-100">
                {/* Header */}
                <div className="px-6 py-4 border-b bg-brand-blue text-white">
                    <h3 className="text-lg font-bold">{title}</h3>
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-gray-700 text-base leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition-all active:scale-95 shadow-sm"
                    >
                        No
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-5 py-2.5 bg-brand-blue text-white font-bold rounded-xl shadow-lg hover:bg-blue-800 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2"
                    >
                        Si
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmModal;
