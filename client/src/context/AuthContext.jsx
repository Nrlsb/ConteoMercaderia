import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../api'; // Use the api instance

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);

    useEffect(() => {
        const checkLoggedIn = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    // Verify token with backend
                    const res = await api.get('/api/auth/user');
                    setUser(res.data);
                    setIsAuthenticated(true);
                } catch (error) {
                    // If token is invalid or session expired (401), clear it
                    console.log('Session check failed:', error.response?.data?.message);
                    localStorage.removeItem('token');
                    setUser(null);
                    setIsAuthenticated(false);
                    // If it was a 401, the interceptor might have already fired, 
                    // or we can fire it manually if we want the modal to show on load.
                    // But usually on load we just want to redirect to login silently if session is invalid.
                    // So we might NOT want to show the modal on initial load, only on active usage.
                }
            }
            setLoading(false);
        };

        checkLoggedIn();

        // Listen for session expiration event from api interceptor
        const handleSessionExpired = () => {
            setSessionExpired(true);
            // We don't immediately logout here to allow the modal to show "You have been logged out"
            // But actually we SHOULD logout state so the UI updates behind the modal?
            // Or keep the state until user clicks OK?
            // Let's keep state until user clicks OK in the modal.
        };

        window.addEventListener('auth:session-expired', handleSessionExpired);

        return () => {
            window.removeEventListener('auth:session-expired', handleSessionExpired);
        };
    }, []);

    const login = async (username, password) => {
        try {
            const res = await api.post('/api/auth/login', { username, password });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setSessionExpired(false);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Login failed'
            };
        }
    };

    const register = async (username, password) => {
        try {
            const res = await api.post('/api/auth/register', { username, password });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setSessionExpired(false);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Registration failed'
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setIsAuthenticated(false);
        setSessionExpired(false);
    };

    const closeSessionExpiredModal = () => {
        setSessionExpired(false);
        logout(); // Ensure we are logged out when closing the modal
    };

    return (
        <AuthContext.Provider value={{ user, loading, isAuthenticated, login, register, logout, sessionExpired, closeSessionExpiredModal }}>
            {children}
        </AuthContext.Provider>
    );
};
