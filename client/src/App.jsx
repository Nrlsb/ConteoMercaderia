import React, { Suspense, lazy, useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import Login from './components/Login';
import Register from './components/Register';
import Navigation from './components/Navigation';
import Modal from './components/Modal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy Load Components
const RemitoForm = lazy(() => import('./components/RemitoForm'));
const RemitoList = lazy(() => import('./components/RemitoList'));
const RemitoDetailsPage = lazy(() => import('./components/RemitoDetailsPage'));
const DiscrepancyList = lazy(() => import('./components/DiscrepancyList'));
const AdminPage = lazy(() => import('./components/AdminPage'));
const InventoryPage = lazy(() => import('./components/InventoryPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const StockPage = lazy(() => import('./components/StockPage'));
const ReceiptsList = lazy(() => import('./components/ReceiptsList'));
const ReceiptDetailsPage = lazy(() => import('./components/ReceiptDetailsPage'));
const BarcodeControl = lazy(() => import('./components/BarcodeControl'));

const ProtectedRoute = ({ children, role }) => {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <div className="flex justify-center items-center h-screen">Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;

  if (role === 'admin' && user?.role === 'superadmin') {
    return children;
  }

  if (role && user?.role !== role) return <Navigate to="/" />;
  return children;
};

const RoleBasedHome = () => {
  const { user } = useAuth();
  if (user?.role === 'supervisor') {
    return <Navigate to="/list" replace />;
  }
  return <RemitoForm />;
};

const LoadingFallback = () => (
  <div className="flex justify-center items-center h-full p-10">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
  </div>
);

const AppContent = () => {
  const { sessionExpired, closeSessionExpiredModal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const attachListener = async () => {
      const backListener = await CapacitorApp.addListener('backButton', () => {
        if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/list') {
          CapacitorApp.exitApp();
        } else {
          navigate(-1);
        }
      });
      return backListener;
    };

    let listenerPromise = attachListener();

    return () => {
      listenerPromise.then(listener => listener.remove());
    };
  }, [navigate, location]);

  return (
    <>
      <Toaster richColors position="top-center" swipeDirections={['left', 'right']} />
      <Modal
        isOpen={sessionExpired}
        onClose={closeSessionExpiredModal}
        title="Sesión Cerrada"
        message="Tu sesión ha sido cerrada porque has iniciado sesión en otro dispositivo."
        type="warning"
      />
      <div className="min-h-screen bg-gray-100 font-sans text-gray-900 flex flex-col" style={{ paddingBottom: 'var(--safe-area-bottom)' }}>
        <Navigation />
        <main className="container mx-auto p-4 mt-4 flex-grow">
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/" element={
                  <ProtectedRoute>
                    <RoleBasedHome />
                  </ProtectedRoute>
                } />
                <Route path="/inventory" element={
                  <ProtectedRoute>
                    <InventoryPage />
                  </ProtectedRoute>
                } />
                <Route path="/list" element={
                  <ProtectedRoute>
                    <RemitoList />
                  </ProtectedRoute>
                } />
                <Route path="/remitos/:id" element={
                  <ProtectedRoute>
                    <RemitoDetailsPage />
                  </ProtectedRoute>
                } />
                <Route path="/discrepancies" element={
                  <ProtectedRoute role="admin">
                    <DiscrepancyList />
                  </ProtectedRoute>
                } />
                <Route path="/admin" element={
                  <ProtectedRoute role="admin">
                    <AdminPage />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute role="admin">
                    <SettingsPage />
                  </ProtectedRoute>
                } />
                <Route path="/stock" element={
                  <ProtectedRoute>
                    <StockPage />
                  </ProtectedRoute>
                } />
                <Route path="/receipts" element={
                  <ProtectedRoute>
                    <ReceiptsList />
                  </ProtectedRoute>
                } />
                <Route path="/receipts/:id" element={
                  <ProtectedRoute>
                    <ReceiptDetailsPage />
                  </ProtectedRoute>
                } />
                <Route path="/barcode-control" element={
                  <ProtectedRoute>
                    <BarcodeControl />
                  </ProtectedRoute>
                } />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <Router>
          <AppContent />
        </Router>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
