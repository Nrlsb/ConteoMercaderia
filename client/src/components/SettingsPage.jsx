import React from 'react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SettingsPage = () => {
    const { countMode, setCountMode } = useSettings();
    const { user } = useAuth();
    const navigate = useNavigate();

    if (user?.role !== 'admin') {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                No tienes permisos para acceder a esta configuración.
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto bg-white md:p-8 p-4 rounded-xl shadow-md my-8 border border-gray-200">
            <h1 className="text-2xl font-bold mb-6 text-brand-dark border-b pb-4">Configuración del Sistema</h1>

            <div className="space-y-6">

                {/* Count Mode Section */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800 mb-2">Modo de Conteo</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Define cómo se cargan los conteos en el escáner principal.
                    </p>

                    <div className="flex flex-col md:flex-row gap-4">
                        <button
                            onClick={() => setCountMode('pre_remito')}
                            className={`flex-1 p-4 rounded-lg border-2 transition text-left flex items-start gap-3 ${countMode === 'pre_remito'
                                    ? 'border-brand-blue bg-blue-50 ring-1 ring-brand-blue'
                                    : 'border-gray-200 hover:border-blue-300'
                                }`}
                        >
                            <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center ${countMode === 'pre_remito' ? 'border-brand-blue' : 'border-gray-400'
                                }`}>
                                {countMode === 'pre_remito' && <div className="w-2.5 h-2.5 rounded-full bg-brand-blue" />}
                            </div>
                            <div>
                                <span className={`block font-bold ${countMode === 'pre_remito' ? 'text-brand-blue' : 'text-gray-700'}`}>
                                    Desde Carga (Pre-Remito)
                                </span>
                                <span className="text-sm text-gray-500 mt-1">
                                    Requiere cargar un pedido/lista antes de escanear. Valida cantidades esperadas.
                                </span>
                            </div>
                        </button>

                        <button
                            onClick={() => setCountMode('products')}
                            className={`flex-1 p-4 rounded-lg border-2 transition text-left flex items-start gap-3 ${countMode === 'products'
                                    ? 'border-brand-blue bg-blue-50 ring-1 ring-brand-blue'
                                    : 'border-gray-200 hover:border-blue-300'
                                }`}
                        >
                            <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center ${countMode === 'products' ? 'border-brand-blue' : 'border-gray-400'
                                }`}>
                                {countMode === 'products' && <div className="w-2.5 h-2.5 rounded-full bg-brand-blue" />}
                            </div>
                            <div>
                                <span className={`block font-bold ${countMode === 'products' ? 'text-brand-blue' : 'text-gray-700'}`}>
                                    Desde Productos (Libre)
                                </span>
                                <span className="text-sm text-gray-500 mt-1">
                                    Escaneo libre contra la base de datos de productos. Sin cantidades pre-definidas.
                                </span>
                            </div>
                        </button>
                    </div>
                </div>

                {/* More settings can go here */}

            </div>

            <div className="mt-8 flex justify-end">
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded hover:bg-gray-300 transition"
                >
                    Volver al Inicio
                </button>
            </div>
        </div>
    );
};

export default SettingsPage;
