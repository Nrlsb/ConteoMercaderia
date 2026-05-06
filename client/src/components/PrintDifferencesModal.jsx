import React from 'react';
import ReactDOM from 'react-dom';
import api from '../api';
import { downloadFile } from '../utils/downloadUtils';
import { toast } from 'sonner';
import { Printer } from '@capgo/capacitor-printer';
import { Capacitor } from '@capacitor/core';

const PrintDifferencesModal = ({ isOpen, onClose, items, egreso }) => {
    if (!isOpen) return null;

    const diffItems = items.filter(item => {
        const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
        return diff !== 0;
    });

    const handlePrint = async () => {
        const isNative = Capacitor.getPlatform() !== 'web';

        if (isNative) {
            try {
                // Generar un HTML completo con estilos básicos para el motor de impresión nativo
                const printContent = document.querySelector('.print-container-content').innerHTML;
                const html = `
                    <html>
                        <head>
                            <style>
                                body { font-family: sans-serif; padding: 20px; }
                                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                                th { background-color: #f2f2f2; font-weight: bold; }
                                .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                                .header h1 { margin: 0; font-size: 20px; }
                                .footer { margin-top: 50px; display: flex; justify-content: space-between; }
                                .signature { border-top: 1px solid #333; width: 45%; text-align: center; padding-top: 5px; font-size: 10px; }
                                .text-red { color: red; }
                                .text-green { color: green; }
                                .text-center { text-align: center; }
                                .font-bold { font-weight: bold; }
                            </style>
                        </head>
                        <body>
                            <div class="header">
                                <h1>REPORTE DE DIFERENCIAS</h1>
                                <p><strong>Egreso:</strong> ${egreso?.reference_number}</p>
                                <p><strong>Sucursal:</strong> ${egreso?.branch_name || 'N/A'}</p>
                                <p style="font-size: 10px; color: #666;">Fecha: ${new Date().toLocaleString()}</p>
                            </div>
                            ${printContent}
                            <div class="footer">
                                <div class="signature">Firma Responsable Control</div>
                                <div class="signature">Firma Responsable Sucursal</div>
                            </div>
                        </body>
                    </html>
                `;

                toast.info('Preparando impresión...');
                await Printer.printHtml({
                    html: html,
                    name: `Diferencias_${egreso?.reference_number}`
                });
            } catch (error) {
                console.error('Error printing native:', error);
                toast.error('Error al iniciar impresión nativa');
            }
        } else {
            window.print();
        }
    };

    const handleDownloadExcel = async () => {
        try {
            const response = await api.get(`/api/egresos/${egreso.id}/export?onlyDifferences=true`, { responseType: 'blob' });
            await downloadFile(new Blob([response.data]), `Diferencias_Egreso_${egreso?.reference_number}.xlsx`);
            toast.success('Excel descargado');
        } catch (err) {
            console.error('Download error:', err);
            toast.error('Error al descargar Excel');
        }
    };

    return ReactDOM.createPortal(
        <div id="print-root" className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in print:p-0 print:static print:bg-white">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:rounded-none print:w-full">
                
                {/* Header - Hidden on print if we use a specific print header */}
                <div className="px-4 sm:px-6 py-4 border-b flex justify-between items-center bg-gray-50 print:hidden">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-800 truncate">Reporte de Diferencias</h2>
                        <p className="text-xs sm:text-sm text-gray-500 truncate">Egreso: {egreso?.reference_number}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                        <button 
                            onClick={handlePrint}
                            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg font-bold hover:bg-blue-700 transition shadow-sm whitespace-nowrap"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                            Imprimir A4
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition" aria-label="Cerrar">
                            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 print:p-0 print:overflow-visible">
                    
                    <div className="print-container-content">
                        {/* Print-only Header */}
                        <div className="hidden print:block mb-8 border-b-2 border-gray-800 pb-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-black uppercase tracking-tighter">REPORTE DE DIFERENCIAS</h1>
                                <p className="text-sm font-bold text-gray-700">EGRESO: {egreso?.reference_number}</p>
                                <p className="text-xs text-gray-500">Sucursal: {egreso?.branch_name || 'N/A'}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-gray-400">FECHA: {new Date().toLocaleDateString()}</p>
                                <p className="text-xs font-bold text-gray-400">HORA: {new Date().toLocaleTimeString()}</p>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto -mx-4 sm:mx-0 print:overflow-visible">
                        <table className="w-full border-collapse min-w-[600px] sm:min-w-0">
                            <thead>
                                <tr className="bg-gray-100 print:bg-gray-200">
                                    <th className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-bold uppercase tracking-wider w-24 sm:w-32">Código</th>
                                    <th className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-bold uppercase tracking-wider">Descripción</th>
                                    <th className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider w-16 sm:w-24">Esp.</th>
                                    <th className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider w-16 sm:w-24">Ctrl.</th>
                                    <th className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider w-16 sm:w-24">Dif.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {diffItems.map((item, idx) => {
                                    const diff = (Number(item.scanned_quantity) || 0) - (Number(item.expected_quantity) || 0);
                                    return (
                                        <tr key={idx} className="hover:bg-gray-50 transition print:hover:bg-transparent">
                                            <td className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-[11px] sm:text-sm font-mono font-bold whitespace-nowrap">{item.product_code}</td>
                                            <td className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-[11px] sm:text-sm leading-tight sm:leading-normal">{item.products?.description || 'Sin descripción'}</td>
                                            <td className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-[11px] sm:text-sm text-center font-bold">{item.expected_quantity}</td>
                                            <td className="border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-[11px] sm:text-sm text-center font-bold">{item.scanned_quantity}</td>
                                            <td className={`border border-gray-300 px-2 sm:px-4 py-2 sm:py-3 text-[11px] sm:text-sm text-center font-black ${diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {diff > 0 ? `+${diff}` : diff}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {diffItems.length === 0 && (
                        <div className="text-center py-12 text-gray-500 font-medium italic">
                            No se encontraron diferencias en este egreso.
                        </div>
                    )}

                    {/* Print-only Footer */}
                    <div className="hidden print:block mt-12 pt-8 border-t border-gray-200">
                        <div className="flex justify-between gap-12">
                            <div className="flex-1 border-t border-gray-400 pt-2 text-center">
                                <p className="text-[10px] font-bold uppercase text-gray-400">Firma Responsable Control</p>
                            </div>
                            <div className="flex-1 border-t border-gray-400 pt-2 text-center">
                                <p className="text-[10px] font-bold uppercase text-gray-400">Firma Responsable Sucursal</p>
                            </div>
                        </div>
                            <div className="mt-8 text-[8px] text-gray-300 text-center uppercase tracking-widest">
                                Sistema de Control de Mercadería - Generado Automáticamente
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer - Hidden on print */}
                <div className="px-4 sm:px-6 py-4 border-t bg-gray-50 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 print:hidden">
                    <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                        <button
                            onClick={handleDownloadExcel}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 font-bold rounded-xl hover:bg-green-100 transition shadow-sm flex items-center justify-center gap-2 text-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Excel
                        </button>
                        <button
                            onClick={onClose}
                            className="flex-1 sm:flex-none px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition shadow-sm text-sm"
                        >
                            Cerrar
                        </button>
                    </div>
                    <button 
                        onClick={handlePrint}
                        className="w-full sm:w-auto px-8 py-3 bg-brand-blue text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-md text-sm sm:text-base flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                        Imprimir Reporte
                    </button>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #print-root, #print-root * {
                        visibility: visible;
                    }
                    #print-root {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    @page {
                        size: A4;
                        margin: 15mm;
                    }
                }
            `}} />
        </div>,
        document.body
    );
};

export default PrintDifferencesModal;
