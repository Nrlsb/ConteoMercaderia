
const commonUMs = ['UN', 'CX', 'MT', 'KG', 'LT', 'PACK', 'ROL', 'UNID', 'MT2', 'L', 'PINS', 'MTL', 'BOLS', 'PAR', 'POTE', 'CJ', 'BAL', 'M2', 'KGS', 'LTS', 'UNI'];
const umPattern = `(?:${commonUMs.join('|')})`;

// Regex Estricto (Greedy + Mandatory UM)
const regexA_Strict = new RegExp(`^\\s*(\\d{4,})\\s+(?:/\\s*/)?\\s*(.+)\\s{2,}(\\d+(?:,\\d{1,3})?)\\s+(${umPattern})`, 'i');

// Regex Fallback (Non-greedy + Optional UM)
const regexA = new RegExp(`^\\s*(\\d{4,})\\s+(?:/\\s*/)?\\s*(.+?)\\s{2,}(\\d+(?:,\\d{1,3})?)\\s*(${umPattern})?`, 'i');

const lines = [
    "010503 // DILUYENTE AGUARRAS PARA ESMALTE X 0,900 (PET)  6,00 UN 0,00",
    "010702 // THINNER STANDARD X 0,900 (PET)  4,00 UN 0,00",
    "004642 // SELLADOR POLIURETANO NODULO NODUPOL 46 GRIS X 0,300  5,00 UN 0,00",
    "1234 // PRODUCT WITHOUT UM  10,00 100.00"
];

console.log("Testing FINAL Logic (Priority Strict -> Fallback):");
lines.forEach(line => {
    let match = line.match(regexA_Strict);
    let type = "STRICT (Correct!)";
    
    if (!match) {
        match = line.match(regexA);
        type = "FALLBACK";
    }

    if (match) {
        console.log(`Line: ${line}`);
        console.log(`  Match Type: ${type}`);
        console.log(`  Code: ${match[1]}, Qty: ${match[3]}, UM: ${match[4] || 'NONE'}`);
    } else {
        console.log(`Line: ${line} - NO MATCH`);
    }
});
