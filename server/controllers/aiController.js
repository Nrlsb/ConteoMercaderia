const { GoogleGenerativeAI } = require("@google/generative-ai");

console.log('[AI CONFIG] GEMINI_API_KEY is', process.env.GEMINI_API_KEY ? 'DEFINED' : 'MISSING');
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    console.log('[AI CONFIG] GEMINI_API_KEY prefix:', process.env.GEMINI_API_KEY.substring(0, 5) + '...');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

exports.parseRemito = async (req, res) => {
    const { text } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({ message: 'No se recibió texto para procesar' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'tu_clave_aqui') {
        return res.status(503).json({ message: 'AI Parsing not configured (Missing API Key)' });
    }

    try {
        console.log(`[AI PARSER] Recibido texto para procesar. Longitud: ${text.length}`);

        const prompt = `
            Eres un experto en extraer datos de documentos de logística (Remitos).
            Dado el siguiente texto extraído por un OCR de una imagen, identifica los productos, códigos y cantidades.
            
            REGLAS:
            1. Devuelve SOLO un array JSON de objetos.
            2. Cada objeto debe tener las llaves: "code" (string), "quantity" (number), "description" (string).
            3. Si una línea no parece un producto (encabezados, fechas, totales), ignórala.
            4. Si el código parece estar pegado a la cantidad o descripción, sepáralos.
            5. Los códigos suelen ser numéricos largos.
            6. Sé conservador: si no estás seguro de un campo, intenta deducirlo o ignora la línea.
            
            TEXTO OCR:
            ---
            ${text}
            ---
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const resultText = response.text();

        console.log(`[AI PARSER] Respuesta de Gemini recibida`);

        const jsonMatch = resultText.match(/\[[\s\S]*\]/);
        let parsedItems = [];
        if (jsonMatch) {
            try {
                parsedItems = JSON.parse(jsonMatch[0]);
            } catch (parseError) {
                console.error('[AI PARSER] Error al parsear JSON de Gemini:', parseError.message);
                return res.status(500).json({ message: 'La IA devolvió una respuesta con formato inválido.' });
            }
        }

        console.log(`[AI PARSER] Sincronización exitosa: ${parsedItems.length} items encontrados`);
        res.json(parsedItems);

    } catch (error) {
        console.error('CRITICAL ERROR in AI parsing:', error);
        res.status(500).json({
            message: 'Error procesando el texto con IA',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

exports.parseImage = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ninguna imagen' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'tu_clave_aqui') {
        return res.status(503).json({ message: 'AI Parsing not configured (Missing API Key)' });
    }

    const { receiptId, egresoId } = req.body;

    try {
        console.log(`[AI IMAGE PARSER] Procesando imagen. Tamaño: ${req.file.size} bytes`);

        // 1. Opcionalmente guardar en Supabase Storage si hay receiptId o egresoId
        let documentUrl = null;
        if (receiptId || egresoId) {
            const supabase = require('../services/supabaseClient');
            const fileExt = req.file.mimetype.split('/')[1];
            const entityId = receiptId || egresoId;
            const tableName = receiptId ? 'receipts' : 'egresos';
            const fileName = `${entityId}/${Date.now()}.${fileExt}`;
            const filePath = `scans/${fileName}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('receipt-documents')
                .upload(filePath, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: true
                });

            if (uploadError) {
                console.error('[STORAGE ERROR]', uploadError);
            } else {
                const { data: { publicUrl } } = supabase.storage
                    .from('receipt-documents')
                    .getPublicUrl(filePath);
                
                documentUrl = publicUrl;

                // Actualizar el registro con la URL del documento
                await supabase
                    .from(tableName)
                    .update({ document_url: documentUrl })
                    .eq('id', entityId);
                
                console.log(`[AI IMAGE PARSER] Imagen guardada en Storage (${tableName}): ${documentUrl}`);
            }
        }

        const imageParts = [
            {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: req.file.mimetype
                },
            },
        ];

        const prompt = `
            Eres un experto en extracción de datos de remitos de logística.
            Analiza la imagen adjunta y extrae todos los productos listados en la tabla del remito.
            
            REGLAS CRÍTICAS:
            1. Devuelve SOLO un array JSON válido de objetos.
            2. Cada objeto DEBE tener: "code" (string), "quantity" (number), "description" (string).
            3. El "code" es el código del producto (suele estar en la primera columna).
            4. La "quantity" es la cantidad pedida/enviada. Si ves decimales (ej: 42,00), conviértelos a número (42).
            5. La "description" es el nombre del producto.
            6. Ignora encabezados, totales, firmas o notas que no sean ítems de la tabla.
            7. Si hay marcas manuscritas (como tildes o números escritos a mano al lado de la cantidad), dales prioridad si indican una cantidad controlada, de lo contrario usa la impresa.
            8. Sé extremadamente preciso con los códigos numéricos.

            Formato esperado:
            [
              {"code": "123456", "quantity": 10, "description": "PRODUCTO EJEMPLO"},
              ...
            ]
        `;

        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        const resultText = response.text();

        console.log(`[AI IMAGE PARSER] Respuesta recibida de Gemini`);

        const jsonMatch = resultText.match(/\[[\s\S]*\]/);
        let parsedItems = [];
        if (jsonMatch) {
            try {
                parsedItems = JSON.parse(jsonMatch[0]);
            } catch (parseError) {
                console.error('[AI IMAGE PARSER] Error al parsear JSON de Gemini:', parseError.message);
                return res.status(500).json({ message: 'La IA devolvió una respuesta con formato inválido.' });
            }
        }

        console.log(`[AI IMAGE PARSER] Extracción exitosa: ${parsedItems.length} items encontrados`);
        res.json({ items: parsedItems, documentUrl });

    } catch (error) {
        console.error('CRITICAL ERROR in AI image parsing:', error);
        res.status(500).json({
            message: 'Error procesando la imagen con IA',
            details: error.message
        });
    }
};
