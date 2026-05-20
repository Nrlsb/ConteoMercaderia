import React, { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '../api';

const BranchDyeTypesManager = () => {
    const [dyeTypes, setDyeTypes] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newBranch, setNewBranch] = useState('');
    const [newDyeType, setNewDyeType] = useState('Automotor');

    useEffect(() => {
        fetchDyeTypes();
    }, []);

    const fetchDyeTypes = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/branch-dye-types');
            setDyeTypes(res.data || {});
        } catch (error) {
            console.error('Error fetching dye types:', error);
            toast.error('Error al cargar tipos de colorante');
        } finally {
            setLoading(false);
        }
    };

    const handleAddOrUpdate = async () => {
        if (!newBranch.trim()) {
            toast.error('Ingresa nombre de sucursal');
            return;
        }

        try {
            setSaving(true);
            const res = await api.put(`/api/branch-dye-types/${newBranch}`, {
                dye_type: newDyeType
            });

            toast.success(res.data.message);
            setDyeTypes(prev => ({
                ...prev,
                [newBranch]: newDyeType
            }));
            setNewBranch('');
            setNewDyeType('Automotor');
        } catch (error) {
            console.error('Error updating dye type:', error);
            toast.error(error.response?.data?.message || 'Error al actualizar');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (branchName) => {
        if (!window.confirm(`¿Eliminar configuración de ${branchName}?`)) return;

        try {
            setSaving(true);
            // Delete by setting a placeholder and removing
            await api.put(`/api/branch-dye-types/${branchName}`, {
                dye_type: 'Automotor' // Reset to default
            });

            setDyeTypes(prev => {
                const updated = { ...prev };
                delete updated[branchName];
                return updated;
            });
            toast.success('Eliminado');
        } catch (error) {
            console.error('Error deleting:', error);
            toast.error('Error al eliminar');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-center py-4">Cargando configuración...</div>;
    }

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Configuración: Tipos de Colorante por Sucursal</h2>

            <div className="mb-6 pb-6 border-b">
                <h3 className="font-semibold mb-3">Agregar / Actualizar</h3>
                <div className="flex gap-3 flex-wrap">
                    <input
                        type="text"
                        placeholder="Nombre sucursal (ej: Sucursal 01)"
                        value={newBranch}
                        onChange={e => setNewBranch(e.target.value)}
                        className="flex-1 min-w-[200px] px-3 py-2 border rounded-md"
                    />
                    <select
                        value={newDyeType}
                        onChange={e => setNewDyeType(e.target.value)}
                        className="px-3 py-2 border rounded-md"
                    >
                        <option value="Automotor">Automotor</option>
                        <option value="Hogar y Obra">Hogar y Obra</option>
                    </select>
                    <button
                        onClick={handleAddOrUpdate}
                        disabled={saving}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Save size={18} />
                        Guardar
                    </button>
                    <button
                        onClick={fetchDyeTypes}
                        disabled={saving}
                        className="flex items-center gap-2 bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 disabled:opacity-50"
                    >
                        <RefreshCw size={18} />
                        Refrescar
                    </button>
                </div>
            </div>

            <div>
                <h3 className="font-semibold mb-3">Configuración Actual</h3>
                {Object.keys(dyeTypes).length === 0 ? (
                    <p className="text-gray-500">No hay configuraciones aún</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(dyeTypes).map(([branch, type]) => (
                            <div key={branch} className="flex items-center justify-between bg-gray-50 p-3 rounded-md border">
                                <div>
                                    <div className="font-semibold">{branch}</div>
                                    <div className="text-sm text-gray-600">{type}</div>
                                </div>
                                <button
                                    onClick={() => handleDelete(branch)}
                                    disabled={saving}
                                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BranchDyeTypesManager;
