import React, { useState, useEffect } from 'react';
import axios from '../api';
import { toast } from 'sonner';
import { Edit2, Save, X, UserPlus, Trash2 } from 'lucide-react';

const UsersManage = () => {
    const [users, setUsers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({ username: '', password: '', role: 'user', sucursal_id: '', permissions: [] });

    // Get current user from storage or context (quick fix as we don't have context here)
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        fetchData();
        checkCurrentUser();
    }, []);

    const checkCurrentUser = async () => {
        try {
            const res = await axios.get('/api/auth/user');
            setCurrentUser(res.data);
        } catch (error) {
            console.error('Error fetching current user', error);
        }
    }

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
        setIsCreating(false);
        setFormData({
            username: user.username,
            role: user.role,
            sucursal_id: user.sucursal_id || '',
            permissions: user.permissions || [],
            password: '' // Reset password field
        });
    };

    const handleCreate = () => {
        setEditingUser(null);
        setIsCreating(true);
        setFormData({
            username: '',
            password: '',
            role: 'user',
            sucursal_id: '',
            permissions: []
        });
    }

    const handleCancel = () => {
        setEditingUser(null);
        setIsCreating(false);
        setFormData({ username: '', password: '', role: '', sucursal_id: '', permissions: [] });
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este usuario?')) return;
        try {
            await axios.delete(`/api/users/${id}`);
            toast.success('Usuario eliminado');
            fetchData();
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar usuario');
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isCreating) {
                if (!formData.username || !formData.password || !formData.role) {
                    return toast.error('Por favor completa todos los campos requeridos');
                }
                const payload = {
                    username: formData.username,
                    password: formData.password,
                    role: formData.role,
                    sucursal_id: formData.sucursal_id === '' ? null : formData.sucursal_id,
                    permissions: formData.permissions
                };
                await axios.post('/api/users', payload);
                toast.success('Usuario creado exitosamente');
            } else {
                const payload = {
                    role: formData.role,
                    sucursal_id: formData.sucursal_id === '' ? null : formData.sucursal_id,
                    permissions: formData.permissions
                };
                if (formData.password) {
                    payload.password = formData.password;
                }

                await axios.put(`/api/users/${editingUser.id}`, payload);
                toast.success('Usuario actualizado');
            }
            fetchData();
            handleCancel();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Error al guardar usuario');
        }
    };

    const handlePermissionChange = (perm) => {
        const newPermissions = formData.permissions.includes(perm)
            ? formData.permissions.filter(p => p !== perm)
            : [...formData.permissions, perm];
        setFormData({ ...formData, permissions: newPermissions });
    };

    // Available permissions to manage
    const availablePermissions = [
        { id: 'delete_counts', name: 'Eliminar Conteos/Remitos' },
        { id: 'export_data', name: 'Exportar a Excel' },
        { id: 'import_data', name: 'Importar Excel/XML' },
        { id: 'edit_products', name: 'Editar Productos/Barcodes' },
        { id: 'manage_settings', name: 'Configuración Global' },
        { id: 'close_counts', name: 'Cerrar/Reabrir Conteos' },
        { id: 'view_history', name: 'Ver Historial Auditar' }
    ];

    if (loading) return <div className="p-4 text-center">Cargando usuarios...</div>;

    const isSuperAdmin = currentUser?.role === 'superadmin';

    return (
        <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Gestión de Usuarios</h2>
                {isSuperAdmin && (
                    <button
                        onClick={handleCreate}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded flex items-center gap-2 text-sm"
                    >
                        <UserPlus size={16} /> Nuevo Usuario
                    </button>
                )}
            </div>

            {(editingUser || isCreating) && (
                <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
                    <h3 className="text-lg font-semibold mb-3">
                        {isCreating ? 'Crear Nuevo Usuario' : `Editar Usuario: ${editingUser.username}`}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        {isCreating && (
                            <div>
                                <label className="block text-gray-700 text-sm font-bold mb-2">Usuario</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    required
                                />
                            </div>
                        )}
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
                                {isSuperAdmin && <option value="superadmin">Superadmin</option>}
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
                            <label className="block text-gray-700 text-sm font-bold mb-2">
                                {isCreating ? 'Contraseña' : 'Nueva Contraseña (Opcional)'}
                            </label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder={isCreating ? "Contraseña requerida" : "Dejar en blanco para no cambiar"}
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                required={isCreating}
                            />
                        </div>
                    </div>

                    {isSuperAdmin && (
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Permisos Especiales</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 bg-white p-3 border rounded">
                                {availablePermissions.map(perm => (
                                    <label key={perm.id} className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={formData.permissions.includes(perm.id)}
                                            onChange={() => handlePermissionChange(perm.id)}
                                            className="form-checkbox h-4 w-4 text-blue-600 rounded"
                                        />
                                        <span>{perm.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

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

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {users.map((user) => (
                    <div key={user.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-bold text-gray-900 text-lg">{user.username}</h3>
                                <div className="text-sm text-gray-500 capitalize">{user.role}</div>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.is_session_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                {user.is_session_active ? 'Activo' : 'Offline'}
                            </span>
                        </div>
                        <div className="text-sm text-gray-600 mb-3">
                            <span className="font-medium">Sucursal:</span> {user.sucursal_name || 'Sin Asignar'}
                        </div>

                        <div className="flex justify-end pt-3 border-t border-gray-100 gap-2">
                            <button
                                onClick={() => handleEdit(user)}
                                className="flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                                <Edit2 size={16} className="mr-1" /> Editar
                            </button>
                            {isSuperAdmin && (
                                <button
                                    onClick={() => handleDelete(user.id)}
                                    className="flex items-center text-red-600 hover:text-red-800 text-sm font-medium"
                                >
                                    <Trash2 size={16} className="mr-1" /> Eliminar
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
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
                                <td className="py-2 px-4 border-b">
                                    <div className="flex justify-center gap-2">
                                        <button
                                            onClick={() => handleEdit(user)}
                                            className="text-blue-600 hover:text-blue-800"
                                            title="Editar"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        {isSuperAdmin && (
                                            <button
                                                onClick={() => handleDelete(user.id)}
                                                className="text-red-600 hover:text-red-800"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
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
