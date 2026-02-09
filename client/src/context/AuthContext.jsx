import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import api from '../api'; // Use the api instance

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);
    const lastLoginTime = useRef(0); // Track last login time to prevent race conditions

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
                }
            }
            setLoading(false);
        };

        checkLoggedIn();

        // Session Polling: Check if session is still valid every 30 seconds
        const pollingInterval = setInterval(async () => {
            const token = localStorage.getItem('token');
            if (token && !sessionExpired) {
                try {
                    await api.get('/api/auth/user');
                } catch (error) {
                    // 401 will be caught by the interceptor and fire 'auth:session-expired'
                    console.error('Session polling failed:', error.message);
                }
            }
        }, 30000);

        // Listen for session expiration event from api interceptor
        const handleSessionExpired = (event) => {
            // Ignore expiration events if we just logged in (within last 5 seconds)
            // This prevents race conditions where an old request fails after a new login
            if (Date.now() - lastLoginTime.current < 5000) {
                console.log('Ignoring session expiration event due to recent login');
                return;
            }

            setSessionExpired(true);
        };

        window.addEventListener('auth:session-expired', handleSessionExpired);

        // Heartbeat: Update last_seen every minute
        const heartbeatInterval = setInterval(() => {
            if (isAuthenticated && !sessionExpired) {
                api.post('/api/auth/heartbeat').catch(err => {
                    console.error('Heartbeat failed:', err.message);
                });
            }
        }, 60000);

        return () => {
            clearInterval(pollingInterval);
            clearInterval(heartbeatInterval);
            window.removeEventListener('auth:session-expired', handleSessionExpired);
        };
    }, [isAuthenticated, sessionExpired]);

    const login = async (username, password, force = false) => {
        try {
            const res = await api.post('/api/auth/login', { username, password, force });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setSessionExpired(false);
            lastLoginTime.current = Date.now(); // Record login time
            return { success: true };
        } catch (error) {
            if (error.response?.status === 409) {
                return {
                    success: false,
                    sessionActive: true,
                    message: error.response.data.message
                };
            }
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
            lastLoginTime.current = Date.now(); // Record login time
            return { success: true };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Registration failed'
            };
        }
    };

    const logout = async () => {
        try {
            await api.post('/api/auth/logout');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('token');
            setUser(null);
            setIsAuthenticated(false);
            setSessionExpired(false);
        }
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
