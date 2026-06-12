import api from '../api';

export const colorRegistrationsService = {
    async getAll() {
        const response = await api.get('/api/color-registrations');
        return response.data;
    },

    async create(registrationData) {
        const response = await api.post('/api/color-registrations', registrationData);
        return response.data;
    },

    async delete(id) {
        const response = await api.delete(`/api/color-registrations/${id}`);
        return response.data;
    },

    async searchProducts(q) {
        if (!q || q.length < 2) return [];
        const response = await api.get(`/api/products/search`, { params: { q } });
        return response.data;
    },

    async getUsersSelector() {
        const response = await api.get('/api/users/selector');
        return response.data;
    }
};
