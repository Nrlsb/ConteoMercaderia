import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ChevronLeft, ChevronRight, X, Play, HelpCircle } from 'lucide-react';

const InteractiveTour = ({ isOpen, onClose, steps }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState(null);
    const popoverRef = useRef(null);
    const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0, placement: 'center' });

    // Restablecer al paso 0 cuando se abre
    useEffect(() => {
        if (isOpen) {
            setCurrentStep(0);
        }
    }, [isOpen]);

    // Calcular la posición del elemento objetivo
    useEffect(() => {
        if (!isOpen || currentStep >= steps.length) return;

        const step = steps[currentStep];
        
        const updatePosition = () => {
            if (!step.target) {
                setTargetRect(null);
                setPopoverPosition({ top: 0, left: 0, placement: 'center' });
                return;
            }

            const element = document.querySelector(step.target);
            if (element) {
                // Hacer scroll hasta el elemento
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Esperar a que el scroll termine para calcular las coordenadas exactas
                setTimeout(() => {
                    const rect = element.getBoundingClientRect();
                    setTargetRect(rect);

                    // Posicionar el popover respecto al elemento
                    const margin = 16;
                    const popoverWidth = 340;
                    const popoverHeight = popoverRef.current ? popoverRef.current.offsetHeight : 180;
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    let placement = step.placement || 'bottom';
                    let top = 0;
                    let left = 0;

                    // Fallback para pantallas pequeñas si no cabe a los lados
                    if (viewportWidth < 768 && (placement === 'left' || placement === 'right')) {
                        placement = 'bottom';
                    }

                    if (placement === 'bottom') {
                        top = rect.bottom + margin;
                        left = rect.left + (rect.width - popoverWidth) / 2;
                        // Si se sale por abajo de la pantalla
                        if (top + popoverHeight > viewportHeight - 10) {
                            top = rect.top - popoverHeight - margin;
                            placement = 'top';
                        }
                    } else if (placement === 'top') {
                        top = rect.top - popoverHeight - margin;
                        left = rect.left + (rect.width - popoverWidth) / 2;
                        // Si se sale por arriba
                        if (top < 10) {
                            top = rect.bottom + margin;
                            placement = 'bottom';
                        }
                    } else if (placement === 'left') {
                        top = rect.top + (rect.height - popoverHeight) / 2;
                        left = rect.left - popoverWidth - margin;
                    } else if (placement === 'right') {
                        top = rect.top + (rect.height - popoverHeight) / 2;
                        left = rect.left + rect.width + margin;
                    }

                    // Ajustar límites de pantalla horizontales
                    if (left < 10) left = 10;
                    if (left + popoverWidth > viewportWidth - 10) {
                        left = viewportWidth - popoverWidth - 10;
                    }

                    // Ajustar límites verticales generales
                    if (top < 10) top = 10;
                    if (top + popoverHeight > viewportHeight - 10) {
                        top = viewportHeight - popoverHeight - 10;
                    }

                    setPopoverPosition({ top, left, placement });
                }, 350);
            } else {
                // Si el elemento objetivo no está en el DOM en este modo, mostrar como central
                setTargetRect(null);
                setPopoverPosition({ top: 0, left: 0, placement: 'center' });
            }
        };

        updatePosition();
        
        // Agregar listeners para actualizar posición
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen, currentStep, steps]);

    // Recalcular tamaño de popover cuando cambia el contenido
    useEffect(() => {
        if (isOpen && popoverRef.current) {
            // Un pequeño re-calculo después del render
            const step = steps[currentStep];
            if (step && step.target) {
                const element = document.querySelector(step.target);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    const margin = 16;
                    const popoverWidth = 340;
                    const popoverHeight = popoverRef.current.offsetHeight;
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    let placement = step.placement || 'bottom';
                    let top = 0;
                    let left = 0;

                    if (viewportWidth < 768 && (placement === 'left' || placement === 'right')) {
                        placement = 'bottom';
                    }

                    if (placement === 'bottom') {
                        top = rect.bottom + margin;
                        left = rect.left + (rect.width - popoverWidth) / 2;
                    } else if (placement === 'top') {
                        top = rect.top - popoverHeight - margin;
                        left = rect.left + (rect.width - popoverWidth) / 2;
                    } else if (placement === 'left') {
                        top = rect.top + (rect.height - popoverHeight) / 2;
                        left = rect.left - popoverWidth - margin;
                    } else if (placement === 'right') {
                        top = rect.top + (rect.height - popoverHeight) / 2;
                        left = rect.left + rect.width + margin;
                    }

                    if (left < 10) left = 10;
                    if (left + popoverWidth > viewportWidth - 10) {
                        left = viewportWidth - popoverWidth - 10;
                    }
                    if (top < 10) top = 10;
                    if (top + popoverHeight > viewportHeight - 10) {
                        top = viewportHeight - popoverHeight - 10;
                    }

                    setPopoverPosition({ top, left, placement });
                }
            }
        }
    }, [currentStep, isOpen]);

    if (!isOpen) return null;

    const step = steps[currentStep];
    const isFirst = currentStep === 0;
    const isLast = currentStep === steps.length - 1;

    const handleNext = () => {
        if (isLast) {
            onClose();
        } else {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (!isFirst) {
            setCurrentStep(prev => prev - 1);
        }
    };

    // Máscara SVG
    const svgOverlay = () => {
        if (!targetRect) {
            return (
                <div className="fixed inset-0 bg-black/75 z-[4000] transition-all duration-300" />
            );
        }

        const padding = 6;
        const x = targetRect.left - padding;
        const y = targetRect.top - padding;
        const width = targetRect.width + padding * 2;
        const height = targetRect.height + padding * 2;

        return (
            <svg className="fixed inset-0 w-full h-full pointer-events-none z-[4000] transition-all duration-300">
                <defs>
                    <mask id="tour-spotlight-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        <rect x={x} y={y} width={width} height={height} rx="8" ry="8" fill="black" />
                    </mask>
                </defs>
                <rect 
                    x="0" 
                    y="0" 
                    width="100%" 
                    height="100%" 
                    fill="rgba(0, 0, 0, 0.65)" 
                    mask="url(#tour-spotlight-mask)" 
                    className="pointer-events-auto cursor-default"
                />
                {/* Borde sutil al rededor del spotlight */}
                <rect 
                    x={x} 
                    y={y} 
                    width={width} 
                    height={height} 
                    rx="8" 
                    ry="8" 
                    fill="none" 
                    stroke="#3b82f6" 
                    strokeWidth="2" 
                    className="animate-pulse"
                />
            </svg>
        );
    };

    return ReactDOM.createPortal(
        <>
            {/* Máscara del Spotlight */}
            {svgOverlay()}

            {/* Diálogo / Popover */}
            <div
                ref={popoverRef}
                style={
                    popoverPosition.placement === 'center'
                        ? {
                              position: 'fixed',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: '90%',
                              maxWidth: '420px',
                              zIndex: 4001,
                          }
                        : {
                              position: 'fixed',
                              top: `${popoverPosition.top}px`,
                              left: `${popoverPosition.left}px`,
                              width: '340px',
                              zIndex: 4001,
                          }
                }
                className="bg-white rounded-2xl shadow-2xl p-6 border border-gray-100 flex flex-col transition-all duration-300 animate-in zoom-in-95"
            >
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                        Guía {currentStep + 1} de {steps.length}
                    </span>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors"
                        title="Omitir guía"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 mb-6">
                    <h4 className="text-lg font-bold text-gray-900 mb-2 leading-snug">
                        {step?.title}
                    </h4>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        {step?.content}
                    </p>
                </div>

                {/* Footer / Controles */}
                <div className="flex items-center justify-between border-t pt-4 border-gray-100 mt-auto">
                    <button
                        onClick={onClose}
                        className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Omitir
                    </button>

                    <div className="flex items-center gap-2">
                        {!isFirst && (
                            <button
                                onClick={handlePrev}
                                className="flex items-center justify-center p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition"
                                title="Anterior"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition active:scale-95 ${
                                isLast
                                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-100'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100'
                            }`}
                        >
                            {isLast ? 'Finalizar' : 'Siguiente'}
                            {!isLast && <ChevronRight className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
};

export default InteractiveTour;
