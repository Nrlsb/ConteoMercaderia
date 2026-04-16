
/**
 * Normaliza un string quitando acentos y convirtiéndolo a minúsculas.
 * @param {string} str
 * @returns {string}
 */
export const normalizeText = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

/**
 * Normalización fonética para español rioplatense.
 * Mapea equivalencias sonoras para tolerar errores de transcripción por voz.
 * b/v → b, s/z/c(e,i) → s, ll/y → y, h mudo, qu → k, güe/güi → ge/gi
 * @param {string} str
 * @returns {string}
 */
export const normalizePhonetic = (str) => {
    if (!str) return '';
    return normalizeText(str)
        .replace(/v/g, 'b')
        .replace(/z/g, 's')
        .replace(/c([ei])/g, 's$1')
        .replace(/ll/g, 'y')
        .replace(/h/g, '')
        .replace(/qu/g, 'k')
        .replace(/gu([ei])/g, 'g$1')
        .replace(/x/g, 'ks')
        .replace(/sh/g, 'x')
        .replace(/ch/g, 'x')
        .replace(/nf/g, 'mf')
        .replace(/ps/g, 's');
};

/**
 * Convierte palabras numéricas en español a dígitos.
 * Útil para transcripciones de voz donde "cien" → "100", etc.
 * @param {string} str
 * @returns {string}
 */
export const numberWordsToDigits = (str) => {
    if (!str) return '';
    const map = {
        'cero': '0', 'un': '1', 'uno': '1', 'una': '1',
        'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
        'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
        'diez': '10', 'once': '11', 'doce': '12', 'trece': '13',
        'catorce': '14', 'quince': '15', 'veinte': '20', 'treinta': '30',
        'cuarenta': '40', 'cincuenta': '50', 'sesenta': '60',
        'setenta': '70', 'ochenta': '80', 'noventa': '90',
        'cien': '100', 'ciento': '100', 'doscientos': '200', 'doscientas': '200',
        'trescientos': '300', 'trescientas': '300', 'quinientos': '500',
        'quinientas': '500', 'mil': '1000',
    };
    return str.replace(/\b(\w+)\b/g, (w) => map[w.toLowerCase()] ?? w);
};
