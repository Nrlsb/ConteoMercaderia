import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import Scanner from './Scanner';
import api from '../api';

const BarcodeControl = () => {
    const [scannedBarcode, setScannedBarcode] = useState('');
    const [inputBarcode, setInputBarcode] = useState('');
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    // Edit state
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});

    // Search state (for linking new barcodes)
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Scanner state
    const [showScanner, setShowScanner] = useState(false);

    // Focus input on mount and whenever we are not in edit mode or searching
    useEffect(() => {
        if (!editMode && product === null && !searchQuery) {
            inputRef.current?.focus();
        }
    }, [editMode, product, searchQuery]);

    const handleScan = async (e) => {
        e.preventDefault();
        const code = inputBarcode.trim();
        if (!code) return;

        setScannedBarcode(code);
        await lookupProduct(code);
    };

    const lookupProduct = async (code) => {
        setLoading(true);
        setError(null);
        setProduct(null);
        setEditMode(false);
        setSearchQuery('');
        setSearchResults([]);

        try {
            const response = await api.get(`/api/products/barcode/${code}`);
            const data = response.data;
            setProduct(data);
            setEditData({
                description: data.description || '',
                code: data.code || '',
                barcode: data.barcode || '',
                provider_code: data.provider_code || ''
            });
        } catch (err) {
            console.error('Lookup error:', err);
            if (err.response && err.response.status === 404) {
                setError('code_not_found'); // Special error state
            } else {
                const msg = err.response?.data?.message || 'Error al buscar el producto';
                setError(msg);
                toast.error(msg);
            }
        } finally {
            setLoading(false);
            setInputBarcode(''); // clear input for next scan
            // Only focus if we are not showing the scanner
            if (inputRef.current && !showScanner) inputRef.current.focus();
        }
    };

    const handleSaveEdit = async () => {
        if (!product) return;
        setLoading(true);
        try {
            const response = await api.put(`/api/products/${product.id}`, editData);
            const updated = response.data;
            setProduct(updated);
            setEditMode(false);
            toast.success('Producto actualizado correctamente');
        } catch (err) {
            console.error('Update error:', err);
            const msg = err.response?.data?.message || 'Error al actualizar';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setSearching(true);
        try {
            const response = await api.get(`/api/products/search?q=${encodeURIComponent(searchQuery)}`);
            const data = response.data;
            setSearchResults(data);
            if (data.length === 0) {
                toast.info('No se encontraron productos para esta búsqueda');
            }
        } catch (err) {
            console.error('Search error:', err);
            toast.error('Error de conexión al buscar');
        } finally {
            setSearching(false);
        }
    };

    const handleLinkProduct = async (selectedProduct) => {
        if (!window.confirm(`¿Estás seguro de que quieres asignar el código de barras "${scannedBarcode}" al producto:\n${selectedProduct.description}?`)) {
            return;
        }

        setLoading(true);
        try {
            const response = await api.put(`/api/products/${selectedProduct.id}`, { barcode: scannedBarcode });
            const updated = response.data;
            toast.success('Código de barras vinculado exitosamente');
            // Refresh the view to show the newly linked product
            setProduct(updated);
            setEditData({
                description: updated.description || '',
                code: updated.code || '',
                barcode: updated.barcode || '',
                provider_code: updated.provider_code || ''
            });
            setError(null);
            setSearchQuery('');
            setSearchResults([]);
        } catch (err) {
            console.error('Link error:', err);
            const msg = err.response?.data?.message || 'Error al vincular el código';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const resetView = () => {
        setProduct(null);
        setError(null);
        setScannedBarcode('');
        setInputBarcode('');
        setSearchQuery('');
        setSearchResults([]);
        setTimeout(() => { if (!showScanner) inputRef.current?.focus() }, 100);
    };

    const onScannerDecode = async (code) => {
        setShowScanner(false);
        setScannedBarcode(code);
        await lookupProduct(code);
    };

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Control de Códigos de Barras</h2>
                    <button
                        onClick={resetView}
                        className="btn btn-secondary text-sm flex items-center gap-2"
                        title="Limpiar pantalla"
                    >
                        <i className="fas fa-redo"></i> Limpiar
                    </button>
                </div>

                {/* Main Scanner Input */}
                <form onSubmit={handleScan} className="mb-8">
                    <div className="relative flex items-center max-w-lg mx-auto">
                        <i className="fas fa-barcode absolute left-4 text-gray-400 text-xl"></i>
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputBarcode}
                            onChange={(e) => setInputBarcode(e.target.value)}
                            placeholder="Escanea o ingresa un código de barras..."
                            className="w-full pl-12 pr-4 py-4 rounded-lg border-2 border-primary-500 focus:ring-4 focus:ring-primary-200 focus:border-primary-600 transition-all text-lg shadow-sm"
                            disabled={loading}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={loading || !inputBarcode.trim()}
                            className="absolute right-2 px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition disabled:opacity-50 font-medium"
                        >
                            Buscar
                        </button>
                    </div>
                    <div className="flex justify-center mt-4">
                        <button
                            type="button"
                            onClick={() => setShowScanner(true)}
                            className="btn bg-gray-800 text-white hover:bg-gray-700 flex items-center gap-2"
                        >
                            <i className="fas fa-camera"></i> Usar Cámara / Escáner Nativo
                        </button>
                    </div>
                    <p className="text-center text-sm text-gray-500 mt-4">
                        El escáner de mano debería enviar automáticamente la consulta tras leer el código.
                    </p>
                </form>

                {loading && (
                    <div className="flex justify-center p-8">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                    </div>
                )}

                {/* Product Found Section */}
                {product && !loading && (
                    <div className="border border-green-200 bg-green-50 rounded-lg p-6 animate-fade-in shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold text-green-800 flex items-center gap-2">
                                <i className="fas fa-check-circle text-green-600"></i>
                                Producto Encontrado
                            </h3>
                            {!editMode && (
                                <button
                                    onClick={() => setEditMode(true)}
                                    className="btn btn-primary flex items-center gap-2"
                                >
                                    <i className="fas fa-edit"></i> Editar
                                </button>
                            )}
                        </div>

                        {editMode ? (
                            <div className="space-y-4 bg-white p-4 rounded border border-gray-200">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                                    <input
                                        type="text"
                                        value={editData.description}
                                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                                        className="input-field"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Código Interno</label>
                                        <input
                                            type="text"
                                            value={editData.code}
                                            onChange={(e) => setEditData({ ...editData, code: e.target.value })}
                                            className="input-field"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Cód. Proveedor</label>
                                        <input
                                            type="text"
                                            value={editData.provider_code}
                                            onChange={(e) => setEditData({ ...editData, provider_code: e.target.value })}
                                            className="input-field"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Cód. Barras</label>
                                        <input
                                            type="text"
                                            value={editData.barcode}
                                            onChange={(e) => setEditData({ ...editData, barcode: e.target.value })}
                                            className="input-field bg-gray-50"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                                    <button
                                        onClick={() => {
                                            setEditMode(false);
                                            // revert changes
                                            setEditData({
                                                description: product.description || '',
                                                code: product.code || '',
                                                barcode: product.barcode || '',
                                                provider_code: product.provider_code || ''
                                            });
                                        }}
                                        className="btn btn-secondary"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        className="btn btn-primary"
                                    >
                                        Guardar Cambios
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 bg-white p-5 rounded border border-green-100">
                                <div className="col-span-1 md:col-span-2 border-b border-gray-100 pb-3">
                                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Descripción</p>
                                    <p className="text-lg font-medium text-gray-900">{product.description || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Código Interno</p>
                                    <p className="text-base text-gray-900 font-mono bg-gray-50 p-1 rounded inline-block mt-1">{product.code || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Cód. Proveedor</p>
                                    <p className="text-base text-gray-900 font-mono bg-gray-50 p-1 rounded inline-block mt-1">{product.provider_code || '-'}</p>
                                </div>
                                <div className="col-span-1 md:col-span-2 mt-2 pt-3 border-t border-gray-100">
                                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                        <i className="fas fa-barcode"></i> Cód. Barras Activo
                                    </p>
                                    <p className="text-lg font-bold text-primary-700 bg-primary-50 p-2 rounded inline-block mt-1 border border-primary-100 tracking-widest">{product.barcode || '-'}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Not Found / Link Section */}
                {error === 'code_not_found' && !loading && (
                    <div className="border border-amber-200 bg-amber-50 rounded-lg p-6 animate-fade-in shadow-sm">
                        <div className="flex items-center gap-3 mb-4 text-amber-800">
                            <i className="fas fa-exclamation-triangle text-2xl text-amber-500"></i>
                            <div>
                                <h3 className="text-lg font-bold">Código no encontrado</h3>
                                <p className="text-sm">El código de barras <span className="font-bold underline">{scannedBarcode}</span> no está asociado a ningún producto.</p>
                            </div>
                        </div>

                        <div className="mt-6 bg-white p-5 rounded border border-amber-100">
                            <h4 className="font-semibold text-gray-800 mb-3">Buscar producto para vincular:</h4>
                            <form onSubmit={handleSearch} className="flex gap-2">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar por descripción, código interno o proveedor..."
                                    className="input-field flex-grow shadow-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={searching || !searchQuery.trim()}
                                    className="btn btn-primary flex items-center gap-2"
                                >
                                    {searching ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>} Buscar
                                </button>
                            </form>

                            {/* Search Results */}
                            {searchResults.length > 0 && (
                                <div className="mt-4 max-h-80 overflow-y-auto border border-gray-200 rounded">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código Interno</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cód. Barras Actual</th>
                                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {searchResults.map((item) => (
                                                <tr key={item.id} className="hover:bg-primary-50 transition-colors">
                                                    <td className="px-4 py-3 text-sm font-mono text-gray-600">{item.code}</td>
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.description}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-500">{item.barcode || '-'}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button
                                                            onClick={() => handleLinkProduct(item)}
                                                            className="px-3 py-1 bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800 rounded font-medium transition-colors text-sm flex items-center justify-center gap-1 mx-auto"
                                                        >
                                                            <i className="fas fa-link text-xs"></i> Vincular
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Generic Error */}
                {error && error !== 'code_not_found' && !loading && (
                    <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}
            </div>

            {/* Scanner Modal overlay */}
            {showScanner && (
                <div className="fixed inset-0 z-50 flex flex-col bg-black">
                    <div className="flex justify-between items-center p-4 bg-gray-900 text-white">
                        <h3 className="text-lg font-bold">Escanear Código</h3>
                        <button
                            onClick={() => setShowScanner(false)}
                            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
                        >
                            <i className="fas fa-times text-xl w-6 h-6 flex items-center justify-center"></i>
                        </button>
                    </div>
                    <div className="flex-1 relative">
                        <Scanner
                            onScan={onScannerDecode}
                            isEnabled={showScanner}
                        />
                        <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
                            <p className="bg-black/50 text-white px-4 py-2 rounded-full text-sm pointer-events-none backdrop-blur-sm">
                                Apunta la cámara al código de barras
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BarcodeControl;
