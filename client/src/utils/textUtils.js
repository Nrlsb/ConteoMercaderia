
/**
 * Normaliza un string quitando acentos y convirtiéndolo a minúsculas.
 * @param {string} str 
 * @returns {string}
 */
export const normalizeText = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};
