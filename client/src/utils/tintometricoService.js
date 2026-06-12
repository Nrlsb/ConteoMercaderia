import api from '../api';

export const tintometricoService = {
    async fetchPermissions() {
        const response = await api.get('/api/tintometrico/permissions');
        return response.data;
    },

    async fetchColecciones() {
        const response = await api.get('/api/tintometrico/colecciones');
        return response.data;
    },

    async fetchColores(page, searchTerm, brand, collection, sortBy = 'id', limit = 60) {
        const params = {
            page,
            search: searchTerm,
            brand,
            collection,
            sortBy,
            limit
        };
        const response = await api.get('/api/tintometrico/colores', { params });
        return response.data;
    },

    async fetchDosificacion(colorId) {
        if (!colorId) throw new Error('El ID de color es requerido');
        const response = await api.get(`/api/tintometrico/dosificacion/${colorId}`);
        return response.data;
    },

    async fetchEquivalentes(colorData) {
        if (!colorData || !colorData.hex) throw new Error('El color y su valor HEX son obligatorios para buscar equivalencias');
        const response = await api.post('/api/tintometrico/equivalentes', colorData);
        return response.data;
    }
};
