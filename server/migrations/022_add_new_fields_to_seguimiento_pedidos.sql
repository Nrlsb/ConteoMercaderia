-- Migration to add new fields to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS codigo_producto_proveed TEXT,
ADD COLUMN IF NOT EXISTS contacto_mercurio_fecha TEXT,
ADD COLUMN IF NOT EXISTS contacto_proveedor_fecha TEXT,
ADD COLUMN IF NOT EXISTS cant_recepcion_parcial NUMERIC;
