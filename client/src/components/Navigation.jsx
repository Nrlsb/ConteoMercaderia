import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bug, ChevronDown } from 'lucide-react';
import BugReportModal from './BugReportModal';
import NotificationBell from './NotificationBell';

const Navigation = () => {
    const { isAuthenticated, logout, user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const location = useLocation();

    if (!isAuthenticated) return null;

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    const isActive = (path) => {
        return location.pathname === path;
    };

    const getLinkClass = (path) => {
        const baseClass = "px-2 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-in-out border border-transparent";
        return isActive(path)
            ? `${baseClass} nav-item-active text-white`
            : `${baseClass} text-blue-100 hover:bg-white/10 hover:text-white hover:border-white/10`;
    };

    const getMobileLinkClass = (path) => {
        const baseClass = "block px-4 py-3 rounded-lg text-base font-medium transition-all duration-200";
        return isActive(path)
            ? `${baseClass} bg-blue-600 text-white shadow-inner`
            : `${baseClass} text-blue-100 hover:bg-blue-800/50 hover:text-white`;
    };

    const isAdminLike = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'branch_admin';

    // Check if user has any tab permissions assigned
    const userPermissions = user?.permissions || [];
    const hasTabPermissions = userPermissions.some(p => p.startsWith('tab_'));

    // Determine if a tab should be visible
    const canSeeTab = (tabPermission, defaultRoleCheck) => {
        // Superadmin always sees everything
        if (user?.role === 'superadmin') return true;
        
        let hasBasePermission = false;
        if (hasTabPermissions) {
            hasBasePermission = userPermissions.includes(tabPermission);
        } else {
            hasBasePermission = defaultRoleCheck;
        }

        if (!hasBasePermission) return false;

        // Validar restricción horaria (tab_schedules) si existe para esta pestaña
        const schedule = user?.tab_schedules?.[tabPermission];
        if (schedule && schedule.from && schedule.to) {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            return currentTime >= schedule.from && currentTime <= schedule.to;
        }

        return true;
    };

    const showNuevoConteo = canSeeTab('tab_nuevo_conteo', user?.role !== 'supervisor');
    const showHistorial = canSeeTab('tab_historial', isAdminLike || user?.role === 'supervisor');
    const showImportar = false; // canSeeTab('tab_importar', isAdminLike);
    const showConfiguracion = canSeeTab('tab_configuracion', isAdminLike);
    const showIngresos = canSeeTab('tab_ingresos', true);
    const showControlCodigos = canSeeTab('tab_control_codigos', true);
    const showEgresos = canSeeTab('tab_egresos', user?.role === 'admin' || user?.role === 'superadmin' || user?.sucursal_name === 'Deposito');
    const showIngresoSucursal = canSeeTab('tab_ingreso_sucursal', user?.role === 'admin' || user?.role === 'superadmin' || (user?.sucursal_name && user?.sucursal_name !== 'Deposito'));
    const showEtiquetas = canSeeTab('tab_etiquetas', true);
    const showPesaje = canSeeTab('tab_pesaje', true);
    const showSeguimientoPedidos = canSeeTab('tab_seguimiento_pedidos', true);
    const showTintometrico = canSeeTab('tab_tintometrico', true);

    const hasMovimientos = showIngresos || showEgresos || showIngresoSucursal;
    const isMovimientosActive = isActive('/receipts') || isActive('/egresos') || isActive('/branch-incomings');
    const isHerramientasActive = isActive('/barcode-control') || isActive('/etiquetas') || isActive('/pesaje') || isActive('/settings') || isActive('/ayuda');

    const getDropdownTriggerClass = (activeState) => {
        const baseClass = "flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-in-out border border-transparent cursor-pointer";
        return activeState
            ? `${baseClass} bg-white/15 text-white`
            : `${baseClass} text-blue-100 hover:bg-white/10 hover:text-white hover:border-white/10`;
    };

    const getDropdownLinkClass = (path) => {
        const baseClass = "block px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out";
        return isActive(path)
            ? `${baseClass} bg-blue-600/50 text-white`
            : `${baseClass} text-blue-100 hover:bg-white/10 hover:text-white`;
    };

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
        <nav className="glass-nav text-white sticky top-0 z-50 transition-all duration-300" style={{ paddingTop: 'var(--safe-area-top)' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 flex items-center">
                            <h1 className="text-sm sm:text-base md:text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-200 uppercase">
                                Control de Mercadería
                            </h1>
                        </div>

                        {/* Desktop Menu */}
                        <div className="hidden xl:flex items-center gap-0.5">
                            {showNuevoConteo && (
                                <Link to="/" className={getLinkClass('/')}>Nuevo Conteo</Link>
                            )}
                            {showHistorial && (
                                <Link to="/list" className={getLinkClass('/list')}>Historial</Link>
                            )}
                            {showSeguimientoPedidos && (
                                <Link to="/seguimiento-pedidos" className={getLinkClass('/seguimiento-pedidos')}>Seguimiento Pedidos</Link>
                            )}
                            {showTintometrico && (
                                <Link to="/tintometrico" className={getLinkClass('/tintometrico')}>Tintométrico</Link>
                            )}

                            {/* Dropdown: Movimientos */}
                            {hasMovimientos && (
                                <div className="relative group">
                                    <button className={getDropdownTriggerClass(isMovimientosActive)}>
                                        <span>Movimientos</span>
                                        <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
                                    </button>
                                    <div className="absolute left-0 mt-1 w-48 rounded-xl bg-blue-950/95 backdrop-blur-md border border-white/10 p-1.5 shadow-xl invisible opacity-0 scale-95 group-hover:visible group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 origin-top-left">
                                        {showIngresos && (
                                            <Link to="/receipts" className={getDropdownLinkClass('/receipts')}>Ingresos</Link>
                                        )}
                                        {showEgresos && (
                                            <Link to="/egresos" className={getDropdownLinkClass('/egresos')}>Egresos</Link>
                                        )}
                                        {showIngresoSucursal && (
                                            <Link to="/branch-incomings" className={getDropdownLinkClass('/branch-incomings')}>Ingreso Sucursal</Link>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Dropdown: Más */}
                            <div className="relative group">
                                <button className={getDropdownTriggerClass(isHerramientasActive)}>
                                    <span>Más</span>
                                    <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
                                </button>
                                <div className="absolute left-0 mt-1 w-48 rounded-xl bg-blue-950/95 backdrop-blur-md border border-white/10 p-1.5 shadow-xl invisible opacity-0 scale-95 group-hover:visible group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 origin-top-left">
                                    {showControlCodigos && (
                                        <Link to="/barcode-control" className={getDropdownLinkClass('/barcode-control')}>Control Códigos</Link>
                                    )}
                                    {showEtiquetas && (
                                        <Link to="/etiquetas" className={getDropdownLinkClass('/etiquetas')}>Etiquetas</Link>
                                    )}
                                    {showPesaje && (
                                        <Link to="/pesaje" className={getDropdownLinkClass('/pesaje')}>Colorantes</Link>
                                    )}
                                    {showConfiguracion && (
                                        <Link to="/settings" className={getDropdownLinkClass('/settings')}>Configuración</Link>
                                    )}
                                    <Link to="/ayuda" className={getDropdownLinkClass('/ayuda')}>Ayuda</Link>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Desktop Right Side - Hidden on Mobile */}
                    <div className="hidden xl:flex items-center gap-4">
                        <NotificationBell />
                        <button
                            onClick={() => setIsReportModalOpen(true)}
                            className="p-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 group relative"
                            title="Reportar un problema"
                        >
                            <Bug className="w-5 h-5 group-hover:animate-pulse" />
                            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                Reportar Bug
                            </span>
                        </button>

                        <div className="flex items-center gap-3 px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold shadow-inner">
                                {user?.username?.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-semibold leading-tight">{user?.username}</span>
                                <span className="text-[10px] text-blue-300 uppercase tracking-wider font-medium">
                                    {getRoleName()}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            className="bg-red-500/10 hover:bg-brand-alert text-red-100 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-red-500/20 hover:border-brand-alert shadow-sm hover:shadow-red-900/40"
                        >
                            Salir
                        </button>
                    </div>

                    {/* Mobile Hamburger Button - Now inside the flex container */}
                    <div className="xl:hidden flex items-center gap-2">
                        <NotificationBell />
                        <button onClick={toggleMenu} className="focus:outline-none text-white hover:text-blue-200 p-2 rounded-lg hover:bg-white/10 transition-all duration-200">
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
            </div>


            {/* Mobile Menu Dropdown */}
            {isOpen && (
                <div className="xl:hidden glass-nav mt-0 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                    <div className="px-4 pt-2 pb-6 space-y-1">
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
                        {showIngresoSucursal && (
                            <Link to="/branch-incomings" className={getMobileLinkClass('/branch-incomings')} onClick={() => setIsOpen(false)}>Ingreso Sucursal</Link>
                        )}
                        {showEtiquetas && (
                            <Link to="/etiquetas" className={getMobileLinkClass('/etiquetas')} onClick={() => setIsOpen(false)}>Etiquetas</Link>
                        )}
                        {showPesaje && (
                            <Link to="/pesaje" className={getMobileLinkClass('/pesaje')} onClick={() => setIsOpen(false)}>Colorantes</Link>
                        )}
                        {showSeguimientoPedidos && (
                            <Link to="/seguimiento-pedidos" className={getMobileLinkClass('/seguimiento-pedidos')} onClick={() => setIsOpen(false)}>Seguimiento Pedidos</Link>
                        )}
                        {showTintometrico && (
                            <Link to="/tintometrico" className={getMobileLinkClass('/tintometrico')} onClick={() => setIsOpen(false)}>Tintométrico</Link>
                        )}
                        <Link to="/ayuda" className={getMobileLinkClass('/ayuda')} onClick={() => setIsOpen(false)}>Ayuda</Link>


                        <button
                            onClick={() => {
                                setIsReportModalOpen(true);
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-blue-100 hover:bg-blue-800/50 hover:text-white transition-all duration-200"
                        >
                            <Bug className="w-5 h-5" />
                            Reportar un Error
                        </button>

                        <div className="pt-6 mt-6 border-t border-white/10">
                            <div className="flex items-center px-2">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-sm font-bold shadow-inner mr-3">
                                    {user?.username?.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div className="text-base font-semibold text-white">{user?.username}</div>
                                    <div className="text-xs font-medium text-blue-300 uppercase tracking-wider">{getRoleName()}</div>
                                </div>
                                <button
                                    onClick={logout}
                                    className="ml-auto bg-brand-alert text-white px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all active:scale-95"
                                >
                                    Salir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <BugReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
            />
        </nav>
    );
};

export default Navigation;
