import React from 'react';
import axios from 'axios';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { 
            hasError: false, 
            error: null, 
            errorInfo: null,
            reporting: false,
            reported: false 
        };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("ErrorBoundary caught an error:", error, errorInfo);

        // Check if the error is a chunk load error
        if (error.message && (
            error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Importing a module script failed')
        )) {
            console.log('Chunk load error detected. Reloading page...');
            window.location.reload();
        }
    }

    reportError = async () => {
        this.setState({ reporting: true });
        try {
            const token = localStorage.getItem('token');
            const { error, errorInfo } = this.state;
            
            await axios.post('/api/bug-reports', {
                description: `Error automático: ${error?.message || 'Error desconocido'}`,
                errorData: {
                    message: error?.message,
                    stack: error?.stack,
                    componentStack: errorInfo?.componentStack
                },
                pageUrl: window.location.href,
                userAgent: navigator.userAgent,
                appVersion: 'crash-report'
            }, {
                headers: token ? { 'x-auth-token': token } : {}
            });

            this.setState({ reported: true });
        } catch (err) {
            console.error('Failed to report error:', err);
            alert('No se pudo enviar el reporte automáticamente.');
        } finally {
            this.setState({ reporting: false });
        }
    };

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-in fade-in duration-500">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                        <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Algo salió mal</h2>
                    <p className="text-gray-600 mb-8 max-w-md">
                        Hubo un error inesperado en la aplicación. Hemos sido notificados (si reportas abajo) y trabajaremos en solucionarlo.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                        >
                            Recargar Página
                        </button>
                        
                        {!this.state.reported ? (
                            <button
                                onClick={this.reportError}
                                disabled={this.state.reporting}
                                className="flex-1 px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
                            >
                                {this.state.reporting ? 'Enviando...' : 'Reportar Error'}
                            </button>
                        ) : (
                            <div className="flex-1 px-6 py-3 bg-green-50 text-green-700 font-semibold rounded-xl border border-green-200">
                                ¡Reportado!
                            </div>
                        )}
                    </div>

                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <div className="mt-10 p-4 bg-gray-900 text-left rounded-lg overflow-auto max-w-2xl w-full">
                            <pre className="text-red-400 text-xs">{this.state.error.stack}</pre>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

