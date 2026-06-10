import React, { useState } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';
import BranchDyeTypesManager from './BranchDyeTypesManager';

const AdminPage = () => {
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setStatus('');
    };

    const handleUpload = async () => {
        if (!file) {
            setStatus('Por favor selecciona un archivo.');
            return;
        }

        setIsLoading(true);
        setStatus('Subiendo y procesando...');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await api.post('/api/products/import', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            setStatus(`Éxito: ${response.data.message}. Procesados: ${response.data.totalProcessed}. Importados: ${response.data.imported}.`);
        } catch (error) {
            console.error(error);
            setStatus('Error al subir el archivo. Revisa la consola o intenta de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportProtheus = async () => {
        setIsLoading(true);
        setStatus('Generando archivos CSV...');
        try {
            const response = await api.get('/api/products/export-protheus/csv');
            if (response.data && response.data.files) {
                response.data.files.forEach((file, index) => {
                    setTimeout(() => {
                        const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8;' });
                        const downloadUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = downloadUrl;
                        link.download = file.filename;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(downloadUrl);
                    }, index * 500); // Retardo entre descargas para evitar bloqueos del navegador
                });
                setStatus(`Éxito: Se generaron y descargaron ${response.data.files.length} archivo(s) CSV.`);
            } else {
                setStatus('No se recibieron archivos para descargar.');
            }
        } catch (error) {
            console.error('Error al exportar productos Protheus:', error);
            const errMsg = error.response?.data?.message || 'Error al exportar productos';
            setStatus(`Error: ${errMsg}`);
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Administración</h1>

            <>
                {false && (
                    <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
                        <h2 className="text-xl mb-4 font-semibold">Importar Productos</h2>
                        <p className="mb-4 text-gray-600">Sube el archivo Excel (BDConteo.xlsx) para actualizar la base de datos de productos.</p>

                        <div className="mb-4">
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-gray-500
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-full file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-blue-50 file:text-blue-700
                                    hover:file:bg-blue-100"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                onClick={handleUpload}
                                disabled={isLoading}
                                className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isLoading ? 'Procesando...' : 'Subir Archivo'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Import Stock XML Section */}
                <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 border-t-4 border-green-500">
                    <h2 className="text-xl mb-4 text-green-700 font-bold">Importar Stock Inicial (XML)</h2>
                    <p className="mb-4 text-gray-600">Sube el archivo XML (DocConteo.xml) del ERP para crear una nueva lista de conteo.</p>

                    <div className="mb-4">
                        <input
                            type="file"
                            accept=".xml, .xlsx, .xls"
                            onChange={(e) => {
                                setFile(e.target.files[0]);
                                setStatus('');
                            }}
                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-green-50 file:text-green-700
                                hover:file:bg-green-100"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <button
                            onClick={async () => {
                                if (!file) {
                                    setStatus('Por favor selecciona un archivo XML.');
                                    return;
                                }
                                setIsLoading(true);
                                setStatus('Subiendo XML...');

                                const formData = new FormData();
                                formData.append('file', file);

                                try {
                                    const response = await api.post('/api/pre-remitos/import-xml', formData, {
                                        headers: { 'Content-Type': 'multipart/form-data' }
                                    });
                                    setStatus(`Éxito: Stock importado correctamente. Conteo: ${response.data.orderNumber}`);
                                } catch (error) {
                                    console.error(error);
                                    setStatus('Error al importar XML Stock.');
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                            disabled={isLoading}
                            className={`bg-green-600 hover:bg-green-800 text-white font-bold py-2 px-4 rounded focus:outline-none shadow-lg transition
                                     ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isLoading ? 'Procesando...' : 'Subir Stock XML'}
                        </button>
                    </div>
                </div>

                {/* Import Stock by Branch Section */}
                {false && (
                    <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 border-t-4 border-orange-500">
                        <h2 className="text-xl mb-4 text-orange-700 font-bold">Importar Stock por Sucursal (Excel)</h2>
                        <p className="mb-4 text-gray-600">Sube el archivo Excel con el stock de todas las sucursales para actualizar la tabla de stock.</p>

                        <div className="mb-4">
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={(e) => {
                                    setFile(e.target.files[0]);
                                    setStatus('');
                                }}
                                className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-orange-50 file:text-orange-700
                                hover:file:bg-orange-100"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                onClick={async () => {
                                    if (!file) {
                                        setStatus('Por favor selecciona un archivo Excel.');
                                        return;
                                    }
                                    setIsLoading(true);
                                    setStatus('Subiendo y vinculando stock...');

                                    const formData = new FormData();
                                    formData.append('file', file);

                                    try {
                                        const response = await api.post('/api/stock/import', formData, {
                                            headers: { 'Content-Type': 'multipart/form-data' }
                                        });
                                        setStatus(`Éxito: ${response.data.message}. Procesados: ${response.data.totalRows}. Importados: ${response.data.imported}. Saltados: ${response.data.skipped}.`);
                                    } catch (error) {
                                        console.error(error);
                                        setStatus('Error al importar Stock por Sucursal. Asegúrate de haber cargado los códigos en las sucursales.');
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                                disabled={isLoading}
                                className={`bg-orange-600 hover:bg-orange-800 text-white font-bold py-2 px-4 rounded focus:outline-none shadow-lg transition
                                     ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isLoading ? 'Procesando...' : 'Subir Stock Sucursal'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Export All Products with Barcode Section */}
                <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 border-t-4 border-blue-500 hover:shadow-lg transition-shadow duration-300">
                    <h2 className="text-xl mb-4 text-blue-700 font-bold flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Exportar Productos para Protheus (CSV)
                    </h2>
                    <p className="mb-4 text-gray-600">
                        Descarga todos los productos con código de barra en archivos CSV de máximo 299 líneas con el formato requerido por Protheus (<code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-sm">B1_COD;B1_CODBAR</code>).
                    </p>

                    <div className="flex items-center justify-between">
                        <button
                            onClick={handleExportProtheus}
                            disabled={isLoading}
                            className={`bg-blue-600 hover:bg-blue-800 text-white font-bold py-2.5 px-6 rounded-lg focus:outline-none shadow-lg transition duration-200 flex items-center gap-2
                                     ${isLoading ? 'opacity-50 cursor-not-allowed font-medium' : 'hover:scale-[1.02] active:scale-95'}`}
                        >
                            {isLoading ? 'Generando...' : 'Descargar Archivos CSV'}
                        </button>
                    </div>
                </div>

                {status && (
                    <div className={`mt-4 p-3 rounded ${status.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {status}
                    </div>
                )}

                {/* Branch Dye Types Configuration */}
                <div className="mt-8 bg-white shadow-md rounded px-8 pt-6 pb-8 border-t-4 border-purple-500">
                    <BranchDyeTypesManager />
                </div>
            </>            <div className="mt-8">
                <button
                    onClick={() => navigate('/')}
                    className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800"
                >
                    Volver al Inicio
                </button>
            </div>
        </div>
    );
};

export default AdminPage;
