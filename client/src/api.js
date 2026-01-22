import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/'
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['x-auth-token'] = token;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            window.dispatchEvent(new CustomEvent('auth:session-expired', {
                detail: error.response.data?.message || 'Sesión expirada'
            }));
        }
        return Promise.reject(error);
    }
);

export default api;
