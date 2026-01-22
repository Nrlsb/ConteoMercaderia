import React from 'react';

const Modal = ({ isOpen, onClose, title, message, type = 'info' }) => {
    if (!isOpen) return null;

    const typeStyles = {
        info: 'bg-blue-100 text-blue-800 border-blue-200',
        success: 'bg-green-100 text-green-800 border-green-200',
        warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        error: 'bg-red-100 text-red-800 border-red-200'
    };

    const buttonStyles = {
        info: 'bg-blue-600 hover:bg-blue-700',
        success: 'bg-green-600 hover:bg-green-700',
        warning: 'bg-yellow-600 hover:bg-yellow-700',
        error: 'bg-red-600 hover:bg-red-700'
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                {/* Header */}
                <div className={`px-6 py-4 border-b ${typeStyles[type]}`}>
                    <h3 className="text-lg font-bold">{title}</h3>
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-gray-700 text-base leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 text-white font-semibold rounded-lg shadow-md transition duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonStyles[type]}`}
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;
