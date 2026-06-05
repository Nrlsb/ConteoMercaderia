-- Migration to add fecha_confirmada field to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS fecha_confirmada BOOLEAN DEFAULT FALSE;
