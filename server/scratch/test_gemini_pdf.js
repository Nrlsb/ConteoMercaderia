const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function analyzePdf(fileName) {
    console.log(`\n=== Analyzing File with Gemini: ${fileName} ===`);
    const pdfPath = path.join(__dirname, '..', fileName);
    const dataBuffer = fs.readFileSync(pdfPath);

    const pdfParts = [
        {
            inlineData: {
                data: dataBuffer.toString("base64"),
                mimeType: "application/pdf"
            },
        },
    ];

    const prompt = `
        Analiza este PDF de un remito.
        Extrae la tabla de productos.
        Si el remito NO tiene códigos de producto, extrae solo la cantidad y la descripción.
        Devuelve un array JSON de objetos con: "code" (pon "N/A" si no hay), "quantity" (número), "description" (string).
        Solo devuelve el JSON.
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    try {
        const result = await model.generateContent([prompt, ...pdfParts]);
        const response = await result.response;
        console.log('Gemini Response:');
        console.log(response.text());
    } catch (error) {
        console.error('Error calling Gemini:', error);
    }
}

analyzePdf('260427084316.pdf');
