-- Añadir columna para guardar productos no encontrados durante la importación de PDF
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS failed_items JSONB DEFAULT '[]'::jsonb;
