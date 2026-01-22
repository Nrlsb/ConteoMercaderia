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

    return (
        <nav className="bg-brand-blue text-white shadow-lg">
            <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    {/* Optional: Add Logo here if available */}
                    <h1 className="text-xl font-semibold tracking-tight truncate">Control de Remitos</h1>
                </div>

                {/* Desktop Menu */}
                <div className="hidden md:flex items-center space-x-4">
                    {(user?.role === 'admin' || user?.role !== 'supervisor') && (
                        <Link to="/" className={getLinkClass('/')}>Nuevo Pedido de Venta</Link>
                    )}
                    {(user?.role === 'admin' || user?.role === 'supervisor') && (
                        <Link to="/list" className={getLinkClass('/list')}>Historial</Link>
                    )}
                    {user?.role === 'admin' && (
                        <Link to="/discrepancies" className={getLinkClass('/discrepancies')}>Discrepancias</Link>
                    )}
                    <div className="flex items-center space-x-4 ml-6 pl-6 border-l border-blue-400/30">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-medium leading-none">{user?.username}</span>
                            <span className="text-xs text-blue-200">
                                {user?.role === 'admin' ? 'Administrador' : user?.role === 'supervisor' ? 'Supervisor' : 'Operador'}
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
                        {(user?.role === 'admin' || user?.role !== 'supervisor') && (
                            <Link to="/" className={getMobileLinkClass('/')} onClick={() => setIsOpen(false)}>Nuevo Pedido de Venta</Link>
                        )}
                        {(user?.role === 'admin' || user?.role === 'supervisor') && (
                            <Link to="/list" className={getMobileLinkClass('/list')} onClick={() => setIsOpen(false)}>Historial</Link>
                        )}
                        {user?.role === 'admin' && (
                            <Link to="/discrepancies" className={getMobileLinkClass('/discrepancies')} onClick={() => setIsOpen(false)}>Discrepancias</Link>
                        )}
                    </div>
                    <div className="pt-4 pb-4 border-t border-blue-800">
                        <div className="flex items-center px-5">
                            <div className="ml-3">
                                <div className="text-base font-medium leading-none text-white">{user?.username}</div>
                                <div className="text-sm font-medium leading-none text-blue-300 mt-1">
                                    {user?.role === 'admin' ? 'Administrador' : user?.role === 'supervisor' ? 'Supervisor' : 'Operador'}
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
