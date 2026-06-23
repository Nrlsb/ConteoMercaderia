-- Migration to add partial delivery enhancement fields to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS contacto_proveedor_cant_parcial NUMERIC,
ADD COLUMN IF NOT EXISTS fecha_pendiente_confirmada BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS entrega_resto_pendiente BOOLEAN DEFAULT FALSE;
