import React, { useState, useEffect } from 'react';
import axios from '../api';
import { toast } from 'sonner';
import { Edit2, Save, X } from 'lucide-react';

const UsersManage = () => {
    const [users, setUsers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ role: '', sucursal_id: '', password: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, branchesRes] = await Promise.all([
                axios.get('/api/users'),
                axios.get('/api/sucursales')
            ]);
            setUsers(usersRes.data);
            setBranches(branchesRes.data);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar datos de usuarios');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (user) => {
        setEditingUser(user);
        setFormData({
            role: user.role,
            sucursal_id: user.sucursal_id || '',
            password: '' // Reset password field
        });
    };

    const handleCancel = () => {
        setEditingUser(null);
        setFormData({ role: '', sucursal_id: '', password: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                role: formData.role,
                sucursal_id: formData.sucursal_id === '' ? null : formData.sucursal_id
            };
            if (formData.password) {
                payload.password = formData.password;
            }

            await axios.put(`/api/users/${editingUser.id}`, payload);
            toast.success('Usuario actualizado');
            fetchData();
            handleCancel();
        } catch (error) {
            console.error(error);
            toast.error('Error al actualizar usuario');
        }
    };

    if (loading) return <div className="p-4">Cargando usuarios...</div>;

    return (
        <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
            <h2 className="text-xl font-bold mb-4">Gestión de Usuarios</h2>

            {editingUser && (
                <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
                    <h3 className="text-lg font-semibold mb-3">Editar Usuario: {editingUser.username}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="block text-gray-700 text-sm font-bold mb-2">Rol</label>
                            <select
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            >
                                <option value="user">Usuario</option>
                                <option value="admin">Administrador</option>
                                <option value="supervisor">Supervisor</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-gray-700 text-sm font-bold mb-2">Sucursal</label>
                            <select
                                value={formData.sucursal_id}
                                onChange={(e) => setFormData({ ...formData, sucursal_id: e.target.value })}
                                className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            >
                                <option value="">Sin Asignar</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-gray-700 text-sm font-bold mb-2">Nueva Contraseña (Opcional)</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder="Dejar en blanco para no cambiar"
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
                            <th className="py-2 px-4 border-b text-left">Usuario</th>
                            <th className="py-2 px-4 border-b text-left">Rol</th>
                            <th className="py-2 px-4 border-b text-left">Sucursal</th>
                            <th className="py-2 px-4 border-b text-center">Estado</th>
                            <th className="py-2 px-4 border-b text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50">
                                <td className="py-2 px-4 border-b font-medium">{user.username}</td>
                                <td className="py-2 px-4 border-b capitalize">{user.role}</td>
                                <td className="py-2 px-4 border-b">{user.sucursal_name}</td>
                                <td className="py-2 px-4 border-b text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs ${user.is_session_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {user.is_session_active ? 'Activo' : 'Offline'}
                                    </span>
                                </td>
                                <td className="py-2 px-4 border-b flex justify-center gap-2">
                                    <button
                                        onClick={() => handleEdit(user)}
                                        className="text-blue-600 hover:text-blue-800"
                                        title="Editar"
                                    >
                                        <Edit2 size={18} />
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

export default UsersManage;
