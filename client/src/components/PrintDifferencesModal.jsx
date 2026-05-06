import React from 'react';
import ReactDOM from 'react-dom';
import api from '../api';
import { downloadFile } from '../utils/downloadUtils';
import { toast } from 'sonner';

const PrintDifferencesModal = ({ isOpen, onClose, items, egreso }) => {
    if (!isOpen) return null;

    const diffItems = items.filter(item => {
        const diff = (Number(item.expected_quantity) || 0) - (Number(item.scanned_quantity) || 0);
        return diff !== 0;
    });

    const handlePrint = () => {
        window.print();
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
                <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50 print:hidden">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Reporte de Diferencias</h2>
                        <p className="text-sm text-gray-500">Egreso: {egreso?.reference_number}</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg font-bold hover:bg-blue-700 transition shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                            Imprimir A4
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition">
                            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
                    
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

                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-100 print:bg-gray-200">
                                <th className="border border-gray-300 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider w-32">Código</th>
                                <th className="border border-gray-300 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Descripción</th>
                                <th className="border border-gray-300 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider w-24">Esperado</th>
                                <th className="border border-gray-300 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider w-24">Control</th>
                                <th className="border border-gray-300 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider w-24 print:table-cell">Dif.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {diffItems.map((item, idx) => {
                                const diff = (Number(item.scanned_quantity) || 0) - (Number(item.expected_quantity) || 0);
                                return (
                                    <tr key={idx} className="hover:bg-gray-50 transition print:hover:bg-transparent">
                                        <td className="border border-gray-300 px-4 py-3 text-sm font-mono font-bold">{item.product_code}</td>
                                        <td className="border border-gray-300 px-4 py-3 text-sm">{item.products?.description || 'Sin descripción'}</td>
                                        <td className="border border-gray-300 px-4 py-3 text-sm text-center font-bold">{item.expected_quantity}</td>
                                        <td className="border border-gray-300 px-4 py-3 text-sm text-center font-bold">{item.scanned_quantity}</td>
                                        <td className={`border border-gray-300 px-4 py-3 text-sm text-center font-black ${diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {diff > 0 ? `+${diff}` : diff}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

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

                {/* Footer - Hidden on print */}
                <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 print:hidden">
                    <button
                        onClick={handleDownloadExcel}
                        className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 font-bold rounded-lg hover:bg-green-100 transition shadow-sm flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        Excel
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition shadow-sm"
                    >
                        Cerrar
                    </button>
                    <button 
                        onClick={handlePrint}
                        className="px-6 py-2 bg-brand-blue text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-sm"
                    >
                        Imprimir
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
