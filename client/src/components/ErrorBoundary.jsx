import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
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

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return this.props.fallback || (
                <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
                    <h2 className="text-xl font-semibold mb-2">Algo salió mal</h2>
                    <p className="text-gray-600 mb-4">Hubo un error al cargar la aplicación. Intenta recargar la página.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                        Recargar Página
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
