import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navigation = () => {
    const { isAuthenticated, logout, user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const location = useLocation();

    if (!isAuthenticated) return null;

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    const isActive = (path) => {
        return location.pathname === path;
    };

    const getLinkClass = (path) => {
        const baseClass = "px-3 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out";
        return isActive(path)
            ? `${baseClass} bg-blue-700 text-white shadow-sm`
            : `${baseClass} text-blue-100 hover:bg-blue-600 hover:text-white`;
    };

    const getMobileLinkClass = (path) => {
        const baseClass = "block px-3 py-2 rounded-md text-base font-medium transition duration-150 ease-in-out";
        return isActive(path)
            ? `${baseClass} bg-blue-800 text-white`
            : `${baseClass} text-blue-100 hover:bg-blue-700 hover:text-white`;
    };

    const isAdminLike = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'branch_admin';

    // Check if user has any tab permissions assigned
    const userPermissions = user?.permissions || [];
    const hasTabPermissions = userPermissions.some(p => p.startsWith('tab_'));

    // Determine if a tab should be visible
    const canSeeTab = (tabPermission, defaultRoleCheck) => {
        // Superadmin always sees everything
        if (user?.role === 'superadmin') return true;
        // If user has tab permissions assigned, only show those tabs
        if (hasTabPermissions) return userPermissions.includes(tabPermission);
        // Otherwise, fall back to the default role-based check
        return defaultRoleCheck;
    };

    const showNuevoConteo = canSeeTab('tab_nuevo_conteo', user?.role !== 'supervisor');
    const showHistorial = canSeeTab('tab_historial', isAdminLike || user?.role === 'supervisor');
    const showImportar = false; // canSeeTab('tab_importar', isAdminLike);
    const showConfiguracion = canSeeTab('tab_configuracion', isAdminLike);
    const showIngresos = canSeeTab('tab_ingresos', true);
    const showControlCodigos = canSeeTab('tab_control_codigos', true);
    const showEgresos = canSeeTab('tab_egresos', user?.role === 'admin' || user?.role === 'superadmin' || user?.sucursal_name === 'Deposito');

    const getRoleName = () => {
        switch (user?.role) {
            case 'superadmin': return 'Superadmin';
            case 'admin': return 'Administrador';
            case 'branch_admin': return 'Admin Sucursal';
            case 'supervisor': return 'Supervisor';
            default: return 'Operador';
        }
    };

    return (
        <nav className="bg-brand-blue text-white shadow-lg" style={{ paddingTop: 'var(--safe-area-top)' }}>
            <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    {/* Optional: Add Logo here if available */}
                    <h1 className="text-xl font-semibold tracking-tight truncate">Control de Remitos</h1>
                </div>

                {/* Desktop Menu */}
                <div className="hidden md:flex items-center space-x-4">
                    {showNuevoConteo && (
                        <Link to="/" className={getLinkClass('/')}>Nuevo Conteo</Link>
                    )}
                    {showHistorial && (
                        <Link to="/list" className={getLinkClass('/list')}>Historial</Link>
                    )}
                    {showImportar && (
                        <Link to="/admin" className={getLinkClass('/admin')}>Importar</Link>
                    )}
                    {showConfiguracion && (
                        <Link to="/settings" className={getLinkClass('/settings')}>Configuración</Link>
                    )}
                    {showIngresos && (
                        <Link to="/receipts" className={getLinkClass('/receipts')}>Ingresos</Link>
                    )}
                    {showControlCodigos && (
                        <Link to="/barcode-control" className={getLinkClass('/barcode-control')}>Control Códigos</Link>
                    )}
                    {showEgresos && (
                        <Link to="/egresos" className={getLinkClass('/egresos')}>Egresos</Link>
                    )}
                    <div className="flex items-center space-x-4 ml-6 pl-6 border-l border-blue-400/30">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-medium leading-none">{user?.username}</span>
                            <span className="text-xs text-blue-200">
                                {getRoleName()}
                            </span>
                        </div>
                        <button
                            onClick={logout}
                            className="bg-blue-800/50 hover:bg-brand-alert text-white px-4 py-2 rounded-md text-sm transition duration-200 border border-blue-400/20 hover:border-brand-alert"
                        >
                            Salir
                        </button>
                    </div>
                </div>

                {/* Mobile Hamburger Button */}
                <div className="md:hidden">
                    <button onClick={toggleMenu} className="focus:outline-none text-white hover:text-blue-200 p-1 rounded-md hover:bg-blue-800/50 transition">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            {isOpen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                            )}
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {isOpen && (
                <div className="md:hidden bg-blue-900 border-t border-blue-800">
                    <div className="px-2 pt-2 pb-3 space-y-1">
                        {showNuevoConteo && (
                            <Link to="/" className={getMobileLinkClass('/')} onClick={() => setIsOpen(false)}>Nuevo Conteo</Link>
                        )}
                        {showHistorial && (
                            <Link to="/list" className={getMobileLinkClass('/list')} onClick={() => setIsOpen(false)}>Historial</Link>
                        )}
                        {showImportar && (
                            <Link to="/admin" className={getMobileLinkClass('/admin')} onClick={() => setIsOpen(false)}>Importar</Link>
                        )}
                        {showConfiguracion && (
                            <Link to="/settings" className={getMobileLinkClass('/settings')} onClick={() => setIsOpen(false)}>Configuración</Link>
                        )}
                        {showIngresos && (
                            <Link to="/receipts" className={getMobileLinkClass('/receipts')} onClick={() => setIsOpen(false)}>Ingresos</Link>
                        )}
                        {showControlCodigos && (
                            <Link to="/barcode-control" className={getMobileLinkClass('/barcode-control')} onClick={() => setIsOpen(false)}>Control Códigos</Link>
                        )}
                        {showEgresos && (
                            <Link to="/egresos" className={getMobileLinkClass('/egresos')} onClick={() => setIsOpen(false)}>Egresos</Link>
                        )}
                    </div>
                    <div className="pt-4 pb-4 border-t border-blue-800">
                        <div className="flex items-center px-5">
                            <div className="ml-3">
                                <div className="text-base font-medium leading-none text-white">{user?.username}</div>
                                <div className="text-sm font-medium leading-none text-blue-300 mt-1">
                                    {getRoleName()}
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                className="ml-auto bg-brand-alert hover:bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium transition"
                            >
                                Salir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Navigation;
