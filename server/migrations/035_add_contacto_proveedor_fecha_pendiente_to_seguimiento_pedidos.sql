-- Migration to add contacto_proveedor_fecha_pendiente to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS contacto_proveedor_fecha_pendiente TEXT;
