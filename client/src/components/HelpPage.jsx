import React from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Printer, Download } from 'lucide-react';

const HelpPage = () => {
    const { user } = useAuth();
    const isAdminLike = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'branch_admin';

    const userPermissions = user?.permissions || [];
    const hasTabPermissions = userPermissions.some(p => p.startsWith('tab_'));

    const canSeeTab = (tabPermission, defaultRoleCheck) => {
        if (user?.role === 'superadmin') return true;
        if (hasTabPermissions) return userPermissions.includes(tabPermission);
        return defaultRoleCheck;
    };

    const showNuevoConteo = canSeeTab('tab_nuevo_conteo', user?.role !== 'supervisor');
    const showHistorial = canSeeTab('tab_historial', isAdminLike || user?.role === 'supervisor');
    const showIngresos = canSeeTab('tab_ingresos', true);
    const showIngresoSucursal = canSeeTab('tab_ingreso_sucursal', user?.role === 'admin' || user?.role === 'superadmin' || (user?.sucursal_name && user?.sucursal_name !== 'Deposito'));
    const showEgresos = canSeeTab('tab_egresos', user?.role === 'admin' || user?.role === 'superadmin' || user?.sucursal_name === 'Deposito');
    const showControlCodigos = canSeeTab('tab_control_codigos', true);
    const showEtiquetas = canSeeTab('tab_etiquetas', true);
    const showImportarAdmin = canSeeTab('tab_importar', isAdminLike) || canSeeTab('tab_configuracion', isAdminLike);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="max-w-4xl mx-auto p-4 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 print:hidden">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                        <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Manual de Usuario</h1>
                        <p className="text-gray-500 text-sm">Tu guía personalizada según tus permisos ({user?.role})</p>
                    </div>
                </div>
                <button 
                    onClick={handlePrint}
                    className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Printer className="w-4 h-4" />
                    Imprimir / Guardar PDF
                </button>
            </div>

            {/* Print Cover Page */}
            <div className="hidden print:flex flex-col items-center justify-center h-screen break-after-page text-center">
                <div className="w-full max-w-2xl mx-auto space-y-8">
                    <div className="w-32 h-32 bg-blue-600 rounded-full mx-auto flex items-center justify-center shadow-lg">
                        <BookOpen className="w-16 h-16 text-white" />
                    </div>
                    <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">Manual de Funciones</h1>
                    <div className="w-24 h-2 bg-blue-600 mx-auto rounded-full"></div>
                    <h2 className="text-2xl font-medium text-gray-600">Sistema de Gestión de Mercadería</h2>
                    
                    <div className="mt-24 p-6 bg-gray-50 border border-gray-200 rounded-xl">
                        <p className="text-lg text-gray-700"><strong>Generado para:</strong> {user?.username}</p>
                        <p className="text-lg text-gray-700"><strong>Perfil de Acceso:</strong> {user?.role}</p>
                        <p className="text-md text-gray-500 mt-4">Solo se incluyen los módulos autorizados para este usuario.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-8 print:space-y-8">
                {showNuevoConteo && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-2 print:border-blue-100 print:p-6 print:rounded-2xl print:break-inside-avoid">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500 flex items-center gap-2 print:text-blue-800 print:text-2xl">
                            <span className="bg-blue-100 text-blue-800 text-sm w-6 h-6 rounded-full flex items-center justify-center font-bold">1</span>
                            Nuevo Conteo (Inventario)
                        </h2>
                        <div className="text-gray-600 space-y-3">
                            <p>Este módulo permite realizar auditorías y conteos de mercadería de forma ágil.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Escanear Artículos:</strong> Permite ingresar códigos mediante la cámara del dispositivo, lector de código de barras externo, entrada manual o incluso por voz.</li>
                                <li><strong>Modo Offline:</strong> Si pierde la conexión a internet, los conteos se guardan localmente en su dispositivo y se sincronizarán automáticamente cuando recupere la conexión.</li>
                                <li><strong>Pre-remitos:</strong> Permite cargar documentos previos de control para contrastarlos con el conteo físico.</li>
                            </ul>
                        </div>
                    </section>
                )}

                {showHistorial && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-2 print:border-blue-100 print:p-6 print:rounded-2xl print:break-inside-avoid">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500 flex items-center gap-2 print:text-blue-800 print:text-2xl">
                            <span className="bg-blue-100 text-blue-800 text-sm w-6 h-6 rounded-full flex items-center justify-center font-bold">2</span>
                            Historial
                        </h2>
                        <div className="text-gray-600 space-y-3">
                            <p>Aquí se almacenan todos los registros y remitos generados previamente.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Consultar Remitos:</strong> Ver el detalle de los conteos pasados, quién los realizó y la fecha.</li>
                                <li><strong>Filtros:</strong> Búsqueda rápida por fecha, número de remito o usuario.</li>
                                <li><strong>Revisión:</strong> Posibilidad de auditar y verificar posibles discrepancias en sesiones anteriores.</li>
                            </ul>
                        </div>
                    </section>
                )}

                {showIngresos && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-2 print:border-blue-100 print:p-6 print:rounded-2xl print:break-inside-avoid">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500 flex items-center gap-2 print:text-blue-800 print:text-2xl">
                            <span className="bg-blue-100 text-blue-800 text-sm w-6 h-6 rounded-full flex items-center justify-center font-bold">3</span>
                            Ingresos (Proveedores)
                        </h2>
                        <div className="text-gray-600 space-y-3">
                            <p>Módulo diseñado para gestionar la mercadería que ingresa desde los proveedores.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Carga de Remitos (PDF):</strong> El sistema lee y procesa automáticamente los remitos en formato PDF de los proveedores.</li>
                                <li><strong>Edición de Cantidades:</strong> Permite ajustar manualmente las "cantidades esperadas" en caso de acuerdos previos o diferencias.</li>
                                <li><strong>Vinculación de Productos:</strong> Si un proveedor envía un producto no registrado, el sistema permite vincularlo en la pestaña "No Encontrados" asociando el código del proveedor con el código interno.</li>
                            </ul>
                        </div>
                    </section>
                )}

                {showIngresoSucursal && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-2 print:border-blue-100 print:p-6 print:rounded-2xl print:break-inside-avoid">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500 flex items-center gap-2 print:text-blue-800 print:text-2xl">
                            <span className="bg-blue-100 text-blue-800 text-sm w-6 h-6 rounded-full flex items-center justify-center font-bold">4</span>
                            Ingreso Sucursal
                        </h2>
                        <div className="text-gray-600 space-y-3">
                            <p>Gestiona la recepción de mercadería proveniente de otras sucursales o depósitos centrales.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Consolidación de Remitos:</strong> Permite adjuntar y procesar múltiples remitos de transferencia pendientes dentro de una misma sesión de recepción.</li>
                                <li><strong>Validación de Envíos:</strong> Cruza la información de lo que la sucursal de origen declaró haber enviado contra lo que realmente se está escaneando.</li>
                            </ul>
                        </div>
                    </section>
                )}

                {showEgresos && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-2 print:border-blue-100 print:p-6 print:rounded-2xl print:break-inside-avoid">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500 flex items-center gap-2 print:text-blue-800 print:text-2xl">
                            <span className="bg-blue-100 text-blue-800 text-sm w-6 h-6 rounded-full flex items-center justify-center font-bold">5</span>
                            Egresos
                        </h2>
                        <div className="text-gray-600 space-y-3">
                            <p>Controla la salida de mercadería para despachos o envíos.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Modo Rápido (Rapid Scan):</strong> Optimizado para una lectura continua y veloz sin ventanas emergentes por cada producto.</li>
                                <li><strong>Feedback Auditivo:</strong> Sonidos de confirmación y error al escanear, facilitando la operación.</li>
                            </ul>
                        </div>
                    </section>
                )}

                {showControlCodigos && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-2 print:border-blue-100 print:p-6 print:rounded-2xl print:break-inside-avoid">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500 flex items-center gap-2 print:text-blue-800 print:text-2xl">
                            <span className="bg-blue-100 text-blue-800 text-sm w-6 h-6 rounded-full flex items-center justify-center font-bold">6</span>
                            Control Códigos / Layout
                        </h2>
                        <div className="text-gray-600 space-y-3">
                            <p>Módulo para mantener la coherencia en la disposición física y el catálogo de productos.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Búsqueda Predictiva:</strong> Encuentre productos en tiempo real por descripción, código de barras o código interno.</li>
                                <li><strong>Contexto Visual:</strong> Muestra los productos que deberían estar inmediatamente antes y después en la estantería.</li>
                                <li><strong>Gestión de Faltantes:</strong> Los productos de la lista de faltantes desaparecen automáticamente al ser escaneados en el layout.</li>
                                <li><strong>Inserción Manual:</strong> Permite agregar productos faltantes entre registros existentes para mantener la secuencia perfecta.</li>
                            </ul>
                        </div>
                    </section>
                )}

                {showEtiquetas && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-2 print:border-blue-100 print:p-6 print:rounded-2xl print:break-inside-avoid">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500 flex items-center gap-2 print:text-blue-800 print:text-2xl">
                            <span className="bg-blue-100 text-blue-800 text-sm w-6 h-6 rounded-full flex items-center justify-center font-bold">7</span>
                            Etiquetas
                        </h2>
                        <div className="text-gray-600 space-y-3">
                            <p>Impresión y gestión de precios.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Generación:</strong> Seleccione productos y genere los formatos listos para imprimir y colocar en las góndolas.</li>
                            </ul>
                        </div>
                    </section>
                )}

                {showImportarAdmin && (
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-2 print:border-blue-100 print:p-6 print:rounded-2xl print:break-inside-avoid">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500 flex items-center gap-2 print:text-blue-800 print:text-2xl">
                            <span className="bg-blue-100 text-blue-800 text-sm w-6 h-6 rounded-full flex items-center justify-center font-bold">8</span>
                            Administración
                        </h2>
                        <div className="text-gray-600 space-y-3">
                            <p>Módulos de Importación, Discrepancias y Configuración.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Bases de Datos:</strong> Actualización masiva de listas de precios o maestros de artículos.</li>
                                <li><strong>Discrepancias:</strong> Revisión de errores de stock detectados.</li>
                                <li><strong>Usuarios:</strong> Gestión de roles y permisos a pestañas específicas.</li>
                            </ul>
                        </div>
                    </section>
                )}

            </div>
        </div>
    );
};

export default HelpPage;
