import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

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
            const token = localStorage.getItem('token');
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/products/import`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'x-auth-token': token
                }
            });

            setStatus(`Éxito: ${response.data.message}. Procesados: ${response.data.totalProcessed}. Importados: ${response.data.imported}.`);
        } catch (error) {
            console.error(error);
            if (error.response && error.response.status === 403) {
                setStatus('Error: No tienes permisos de administrador.');
            } else {
                setStatus('Error al subir el archivo. Revisa la consola o intenta de nuevo.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Administración</h1>

            <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
                <h2 className="text-xl mb-4">Importar Productos</h2>
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

                    <button
                        onClick={() => navigate('/')}
                        className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800"
                    >
                        Volver al Inicio
                    </button>
                </div>

                {status && (
                    <div className={`mt-4 p-3 rounded ${status.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPage;
