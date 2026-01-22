import React from 'react';

const ReportModal = ({ isOpen, onClose, title, reportData }) => {
    if (!isOpen) return null;

    const totalItems = reportData ? reportData.length : 0;
    const totalUnits = reportData ? reportData.reduce((acc, item) => acc + item.quantity, 0) : 0;

    const handleDownloadCSV = () => {
        if (!reportData || reportData.length === 0) return;

        const headers = ['Código', 'Descripción', 'Código de Barras', 'Stock (SB2)', 'Contado', 'Diferencia'];
        const rows = reportData.map(item => [
            item.code,
            `"${item.description?.replace(/"/g, '""')}"`, // Escape quotes
            item.barcode || '',
            item.stock || 0,
            item.quantity,
            item.difference || 0
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_conteo_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">{title || 'Reporte de Conteo'}</h2>
                        <p className="text-sm text-gray-500">
                            Resumen finalizado. Total Items: <span className="font-semibold">{totalItems}</span> | Unidades: <span className="font-semibold">{totalUnits}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition">
                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {reportData && reportData.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock (SB2)</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">Contado</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Diferencia</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {reportData.map((item, idx) => {
                                    const diff = item.difference || 0;
                                    let diffColor = 'text-gray-500';
                                    if (diff < 0) diffColor = 'text-red-600 font-bold';
                                    if (diff > 0) diffColor = 'text-green-600 font-bold';

                                    return (
                                        <tr key={idx} className="hover:bg-gray-50 transition">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.code}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{item.description}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{item.stock || 0}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-brand-blue bg-blue-50/50">{item.quantity}</td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${diffColor}`}>
                                                {diff > 0 ? `+${diff}` : diff}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            No se encontraron datos para este reporte.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={handleDownloadCSV}
                        className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow hover:bg-green-700 transition flex items-center"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Descargar Excel/CSV
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReportModal;
