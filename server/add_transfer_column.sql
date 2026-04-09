-- Añadir columna para identificar remitos de transferencia
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS is_transferencia BOOLEAN DEFAULT false;
