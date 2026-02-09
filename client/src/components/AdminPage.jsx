import React, { useState } from 'react';
import axios from '../api';
import { useNavigate } from 'react-router-dom';
import BranchesManage from './BranchesManage';
import UsersManage from './UsersManage';

const AdminPage = () => {
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('data'); // 'data', 'branches', 'users'
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
            const response = await axios.post('/api/products/import', formData, {
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

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Administración</h1>

            {/* Tabs Navigation */}
            <div className="flex border-b mb-6">
                <button
                    className={`px-4 py-2 font-semibold ${activeTab === 'data' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}
                    onClick={() => setActiveTab('data')}
                >
                    Importación de Datos
                </button>
                <button
                    className={`px-4 py-2 font-semibold ${activeTab === 'branches' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}
                    onClick={() => setActiveTab('branches')}
                >
                    Sucursales
                </button>
                <button
                    className={`px-4 py-2 font-semibold ${activeTab === 'users' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-blue-500'}`}
                    onClick={() => setActiveTab('users')}
                >
                    Usuarios
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'data' && (
                <>
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

                        {status && (
                            <div className={`mt-4 p-3 rounded ${status.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {status}
                            </div>
                        )}
                    </div>

                    {/* Import Stock XML Section */}
                    <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 border-t-4 border-green-500">
                        <h2 className="text-xl mb-4 text-green-700 font-bold">Importar Stock Inicial (XML)</h2>
                        <p className="mb-4 text-gray-600">Sube el archivo XML (DocConteo.xml) del ERP para crear una nueva lista de conteo.</p>

                        <div className="mb-4">
                            <input
                                type="file"
                                accept=".xml"
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
                                        const response = await axios.post('/api/pre-remitos/import-xml', formData, {
                                            headers: { 'Content-Type': 'multipart/form-data' }
                                        });
                                        setStatus(`Éxito: Stock importado correctamente. Pedido: ${response.data.orderNumber}`);
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
                </>
            )}

            {activeTab === 'branches' && <BranchesManage />}
            {activeTab === 'users' && <UsersManage />}

            <div className="mt-8">
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
