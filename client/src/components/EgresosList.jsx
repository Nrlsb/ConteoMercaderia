import React, { useState, useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const EgresosList = () => {
    const { user } = useAuth();
    const [egresos, setEgresos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const fileInputRef = useRef(null);

    // Access control: only Deposito branch, admin, superadmin
    const canAccessEgresos = user?.role === 'superadmin' || user?.role === 'admin' || user?.sucursal_name === 'Deposito';
    const canUploadPdf = user?.role !== 'user';

    useEffect(() => {
        fetchEgresos();
    }, []);

    const fetchEgresos = async () => {
        try {
            const response = await api.get('/api/egresos');
            setEgresos(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching egresos:', error);
            toast.error('Error al cargar los egresos');
            setLoading(false);
        }
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Solo se permiten archivos PDF');
            return;
        }

        setUploading(true);
        setUploadProgress('Procesando PDF...');

        try {
            const formData = new FormData();
            formData.append('pdf', file);

            const response = await api.post('/api/egresos/upload-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const { egreso, results } = response.data;

            if (results.success.length > 0) {
                toast.success(`Egreso creado: ${results.success.length} productos cargados`);
            }
            if (results.failed.length > 0) {
                toast.warning(`${results.failed.length} productos no se encontraron en la base de datos`);
            }

            fetchEgresos();
        } catch (error) {
            console.error('Error uploading PDF:', error);
            const msg = error.response?.data?.message || 'Error al procesar el PDF';
            toast.error(msg);
        } finally {
            setUploading(false);
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Está seguro de que desea eliminar este egreso?')) return;
        try {
            await api.delete(`/api/egresos/${id}`);
            toast.success('Egreso eliminado correctamente');
            fetchEgresos();
        } catch (error) {
            console.error('Error deleting egreso:', error);
            toast.error('Error al eliminar el egreso');
        }
    };

    if (loading) return <div className="p-4 text-center">Cargando...</div>;
    if (!canAccessEgresos) return <Navigate to="/" replace />;

    return (
        <div className="container mx-auto p-4 max-w-lg md:max-w-4xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Egreso de Mercadería</h1>
                {canUploadPdf && (
                    <div className="flex gap-2 w-full sm:w-auto">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="pdf-upload"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="w-full sm:w-auto bg-brand-blue hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {uploading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    {uploadProgress}
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                    </svg>
                                    Cargar PDF
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Upload area visual indicator when no egresos exist */}
            {canUploadPdf && egresos.length === 0 && !uploading && (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-6 p-12 border-2 border-dashed border-gray-300 rounded-xl bg-white hover:border-brand-blue hover:bg-blue-50/30 transition-all cursor-pointer text-center"
                >
                    <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <p className="text-gray-500 font-medium text-lg mb-1">Arrastrá o hacé clic para subir un PDF</p>
                    <p className="text-gray-400 text-sm">Se extraerán automáticamente los productos del documento</p>
                </div>
            )}

            {/* Uploading overlay */}
            {uploading && (
                <div className="mb-6 p-8 bg-white rounded-xl shadow-lg border-l-4 border-brand-blue text-center">
                    <div className="w-12 h-12 border-4 border-blue-100 border-t-brand-blue rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-lg font-bold text-gray-800">Procesando PDF...</p>
                    <p className="text-sm text-gray-500 mt-1">Extrayendo productos y buscando códigos de barras</p>
                </div>
            )}

            {/* Vista de Escritorio (Tabla) */}
            {egresos.length > 0 && (
                <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden">
                    <table className="min-w-full leading-normal">
                        <thead>
                            <tr>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Referencia
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Archivo PDF
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Fecha
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Estado
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Creado Por
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {egresos.map(egreso => (
                                <tr key={egreso.id}>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 whitespace-no-wrap font-bold">{egreso.reference_number}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-600 whitespace-no-wrap">{egreso.pdf_filename || '-'}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 whitespace-no-wrap">
                                            {new Date(egreso.date).toLocaleDateString()} {new Date(egreso.date).toLocaleTimeString()}
                                        </p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <span className={`relative inline-block px-3 py-1 font-semibold leading-tight`}>
                                            <span aria-hidden className={`absolute inset-0 ${egreso.status === 'finalized' ? 'bg-green-200' : 'bg-yellow-200'} opacity-50 rounded-full`}></span>
                                            <span className="relative">{egreso.status === 'finalized' ? 'Finalizado' : 'Abierto'}</span>
                                        </span>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <p className="text-gray-900 whitespace-no-wrap">{egreso.created_by}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                        <div className="flex gap-3 items-center">
                                            <Link to={`/egresos/${egreso.id}`} className="text-blue-600 hover:text-blue-900 font-bold">
                                                Ver Detalles
                                            </Link>
                                            {user && (user.role === 'admin' || user.role === 'superadmin') && (
                                                <button
                                                    onClick={() => handleDelete(egreso.id)}
                                                    className="text-red-600 hover:text-red-900 font-bold"
                                                >
                                                    Eliminar
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Vista Mobile (Tarjetas) */}
            <div className="md:hidden space-y-4">
                {egresos.map(egreso => (
                    <Link
                        to={`/egresos/${egreso.id}`}
                        key={egreso.id}
                        className="block bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{egreso.reference_number}</h3>
                                <p className="text-xs text-brand-gray">
                                    {new Date(egreso.date).toLocaleDateString()} - {new Date(egreso.date).toLocaleTimeString()}
                                </p>
                                {egreso.pdf_filename && (
                                    <p className="text-xs text-gray-400 mt-0.5">📄 {egreso.pdf_filename}</p>
                                )}
                            </div>
                            <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-full ${egreso.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {egreso.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Por: <span className="font-medium">{egreso.created_by}</span></span>
                            <div className="flex gap-3 items-center">
                                {user && (user.role === 'admin' || user.role === 'superadmin') && (
                                    <button
                                        onClick={(e) => { e.preventDefault(); handleDelete(egreso.id); }}
                                        className="text-red-600 hover:text-red-900 font-bold"
                                    >
                                        Eliminar
                                    </button>
                                )}
                                <span className="text-brand-blue font-bold">Ver detalles →</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {egresos.length === 0 && !uploading && (
                <div className="bg-white p-8 text-center rounded-lg shadow-inner text-gray-500 italic mt-4">
                    No hay egresos registrados. Subí un PDF para crear uno.
                </div>
            )}
        </div>
    );
};

export default EgresosList;
