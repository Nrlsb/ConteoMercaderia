import React from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import RemitoForm from './components/RemitoForm';
import RemitoList from './components/RemitoList';
import Login from './components/Login';
import Register from './components/Register';
import DiscrepancyList from './components/DiscrepancyList';
import { AuthProvider, useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children, role }) => {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <div className="flex justify-center items-center h-screen">Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (role && user?.role !== role) return <Navigate to="/" />;
  return children;
};

import Navigation from './components/Navigation';

import Modal from './components/Modal';

const RoleBasedHome = () => {
  const { user } = useAuth();
  if (user?.role === 'supervisor') {
    return <Navigate to="/list" replace />;
  }
  return <RemitoForm />;
};

const AppContent = () => {
  const { sessionExpired, closeSessionExpiredModal } = useAuth();

  return (
    <>
      <Toaster richColors position="top-center" />
      <Modal
        isOpen={sessionExpired}
        onClose={closeSessionExpiredModal}
        title="Sesión Cerrada"
        message="Tu sesión ha sido cerrada porque has iniciado sesión en otro dispositivo."
        type="warning"
      />
      <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
        <Navigation />
        <main className="container mx-auto p-4 mt-4">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={
              <ProtectedRoute>
                <RoleBasedHome />
              </ProtectedRoute>
            } />
            <Route path="/list" element={
              <ProtectedRoute>
                <RemitoList />
              </ProtectedRoute>
            } />
            <Route path="/discrepancies" element={
              <ProtectedRoute role="admin">
                <DiscrepancyList />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
      </div>
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
