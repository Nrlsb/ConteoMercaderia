-- Migration to add remaining pending quantity field to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS contacto_proveedor_cant_pendiente NUMERIC;
