import React, { useState, useEffect } from 'react';
import axios from '../api';
import { toast } from 'sonner';
import { Trash2, Edit2, Plus, Save, X } from 'lucide-react';

const BranchesManage = () => {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingBranch, setEditingBranch] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({ name: '', location: '' });

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            const response = await axios.get('/api/sucursales');
            setBranches(response.data);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar sucursales');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (branch) => {
        setEditingBranch(branch);
        setFormData({ name: branch.name, location: branch.location || '' });
        setIsCreating(false);
    };

    const handleCreate = () => {
        setEditingBranch(null);
        setFormData({ name: '', location: '' });
        setIsCreating(true);
    };

    const handleCancel = () => {
        setEditingBranch(null);
        setIsCreating(false);
        setFormData({ name: '', location: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isCreating) {
                await axios.post('/api/sucursales', formData);
                toast.success('Sucursal creada');
            } else if (editingBranch) {
                await axios.put(`/api/sucursales/${editingBranch.id}`, formData);
                toast.success('Sucursal actualizada');
            }
            fetchBranches();
            handleCancel();
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar sucursal');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Estás seguro de eliminar esta sucursal?')) return;
        try {
            await axios.delete(`/api/sucursales/${id}`);
            toast.success('Sucursal eliminada');
            fetchBranches();
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar sucursal');
        }
    };

    if (loading) return <div className="p-4">Cargando sucursales...</div>;

    return (
        <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Gestión de Sucursales</h2>
                {!isCreating && !editingBranch && (
                    <button
                        onClick={handleCreate}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2"
                    >
                        <Plus size={16} /> Nueva Sucursal
                    </button>
                )}
            </div>

            {(isCreating || editingBranch) && (
                <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
                    <h3 className="text-lg font-semibold mb-3">{isCreating ? 'Nueva Sucursal' : 'Editar Sucursal'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-gray-700 text-sm font-bold mb-2">Nombre</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-gray-700 text-sm font-bold mb-2">Ubicación</label>
                            <input
                                type="text"
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded flex items-center gap-2"
                        >
                            <X size={16} /> Cancelar
                        </button>
                        <button
                            type="submit"
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2"
                        >
                            <Save size={16} /> Guardar
                        </button>
                    </div>
                </form>
            )}

            <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="py-2 px-4 border-b text-left">Nombre</th>
                            <th className="py-2 px-4 border-b text-left">Ubicación</th>
                            <th className="py-2 px-4 border-b text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {branches.map((branch) => (
                            <tr key={branch.id} className="hover:bg-gray-50">
                                <td className="py-2 px-4 border-b">{branch.name}</td>
                                <td className="py-2 px-4 border-b">{branch.location || '-'}</td>
                                <td className="py-2 px-4 border-b flex justify-center gap-2">
                                    <button
                                        onClick={() => handleEdit(branch)}
                                        className="text-blue-600 hover:text-blue-800"
                                        title="Editar"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(branch.id)}
                                        className="text-red-600 hover:text-red-800"
                                        title="Eliminar"
                                        disabled={branch.name === 'Deposito'} // Prevent deleting default
                                    >
                                        {branch.name !== 'Deposito' && <Trash2 size={18} />}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BranchesManage;
