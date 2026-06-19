-- Migration to add enhancements to Contacto Proveedor fields in seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS contacto_proveedor_fecha_original TEXT,
ADD COLUMN IF NOT EXISTS contacto_proveedor_observaciones TEXT,
ADD COLUMN IF NOT EXISTS contacto_proveedor_entrega TEXT;

-- Inicializar la fecha original con la fecha cargada actualmente si existe y no tiene una original establecida
UPDATE seguimiento_pedidos
SET contacto_proveedor_fecha_original = contacto_proveedor_fecha
WHERE contacto_proveedor_fecha IS NOT NULL AND contacto_proveedor_fecha_original IS NULL;
