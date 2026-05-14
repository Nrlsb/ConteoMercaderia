-- Añadir columna para clasificar el tipo de conteo/colorante
ALTER TABLE products ADD COLUMN IF NOT EXISTS counting_category TEXT;

-- (Opcional) Poblar inicialmente basado en las marcas actuales para no perder funcionalidad
UPDATE products 
SET counting_category = 'Hogar y Obra' 
WHERE brand IN ('SINTEPLAST SISTEMA', 'ALBA TINTING', 'TERSUAVE SISTEMA', 'PLAVICON SISTEMA', 'EXPERTO');

UPDATE products 
SET counting_category = 'Automotor' 
WHERE brand IN ('SINTEPLAST INDUSTRIA', 'TERSUAVE INDUSTRIA', 'NORTON');
