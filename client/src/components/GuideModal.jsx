import React from 'react';
import ReactDOM from 'react-dom';
import { X, HelpCircle, Scan, Keyboard, Mic, WifiOff, FileText, CheckCircle } from 'lucide-react';

const GuideModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const sections = [
        {
            title: '1. Iniciar un Conteo',
            icon: <FileText className="w-5 h-5 text-blue-600" />,
            steps: [
                'Si eres Administrador, puedes crear un nuevo conteo desde el panel superior, asignándole un nombre (ej: "Pasillo 1") y una sucursal.',
                'Si ya existe un conteo activo, simplemente selecciónalo de la lista para comenzar a trabajar.',
                'En modo "Pre-Remito", puedes seleccionar uno o varios pedidos pendientes (o subir un XML) para cargar la lista de productos esperados.'
            ]
        },
        {
            title: '2. Cargar Productos',
            icon: <Scan className="w-5 h-5 text-green-600" />,
            steps: [
                {
                    subtitle: 'Escaneo con Cámara:',
                    text: 'Pulsa "Usar Cámara" para abrir el escáner. Apunta al código de barras. El sistema detectará automáticamente el producto.'
                },
                {
                    subtitle: 'Ingreso Manual / Autocompletado:',
                    text: 'Escribe el nombre o código en el campo de texto. Verás sugerencias en tiempo real. Selecciona el producto correcto para agregarlo.'
                },
                {
                    subtitle: 'Búsqueda por Voz:',
                    text: 'Toca el ícono del micrófono y di el nombre del producto. El sistema buscará coincidencias fonéticas.'
                }
            ]
        },
        {
            title: '3. Gestionar Cantidades',
            icon: <Keyboard className="w-5 h-5 text-orange-600" />,
            steps: [
                'Al escanear un producto por primera vez, se abrirá una ventana para confirmar la cantidad.',
                'Si vuelves a escanear el mismo producto, la cantidad se incrementará automáticamente.',
                'Puedes ajustar las cantidades manualmente usando los botones + y - en la lista de items escaneados.'
            ]
        },
        {
            title: '4. Trabajo Offline (Sin Internet)',
            icon: <WifiOff className="w-5 h-5 text-red-600" />,
            steps: [
                'Si pierdes la conexión, ¡no te detengas! Sigue escaneando normalmente.',
                'Los datos se guardarán en tu dispositivo y aparecerá un aviso amarillo.',
                'Cuando recuperes internet, el sistema sincronizará todo automáticamente. También puedes forzar la sincronización pulsando el botón en el aviso.'
            ]
        },
        {
            title: '5. Finalizar y Revisar',
            icon: <CheckCircle className="w-5 h-5 text-purple-600" />,
            steps: [
                'Si trabajas con un pedido (Pre-Remito), al terminar pulsa "Cargar Conteo" para procesar los resultados.',
                'En conteos generales, tus escaneos se guardan en tiempo real. El administrador cerrará el conteo cuando todo el equipo termine.',
                'Puedes ver el resumen de lo escaneado en la pestaña "Lista de Conteo" (si está habilitada).'
            ]
        }
    ];

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 flex items-center justify-between text-white flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                            <HelpCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold leading-tight">Guía de Uso: Nuevo Conteo</h2>
                            <p className="text-blue-100 text-sm opacity-90">Paso a paso para una gestión eficiente</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-gray-50/30">
                    {sections.map((section, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    {section.icon}
                                </div>
                                <h3 className="text-lg font-bold text-gray-800">{section.title}</h3>
                            </div>
                            <ul className="space-y-3">
                                {section.steps.map((step, stepIdx) => (
                                    <li key={stepIdx} className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                                        <div>
                                            {typeof step === 'string' ? (
                                                step
                                            ) : (
                                                <>
                                                    <span className="font-bold text-gray-700">{step.subtitle}</span> {step.text}
                                                </>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-white flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all active:scale-95 shadow-md shadow-blue-200"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default GuideModal;
