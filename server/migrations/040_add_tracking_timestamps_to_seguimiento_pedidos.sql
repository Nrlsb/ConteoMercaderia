-- Migration to add individual tracking event timestamps to tracking orders (seguimiento_pedidos)
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS fecha_abonado TEXT,
ADD COLUMN IF NOT EXISTS fecha_coordinacion TEXT,
ADD COLUMN IF NOT EXISTS fecha_coordinacion_pendiente TEXT,
ADD COLUMN IF NOT EXISTS fecha_confirmacion_deposito TEXT,
ADD COLUMN IF NOT EXISTS fecha_pendiente_confirmacion_deposito TEXT,
ADD COLUMN IF NOT EXISTS fecha_ingreso_deposito TEXT;

-- Initialize existing rows
UPDATE seguimiento_pedidos
SET fecha_abonado = COALESCE(contacto_mercurio_fecha, CAST(created_at AS TEXT))
WHERE abonado = TRUE AND fecha_abonado IS NULL;

UPDATE seguimiento_pedidos
SET fecha_coordinacion = COALESCE(contacto_mercurio_fecha, CAST(created_at AS TEXT))
WHERE contacto_proveedor_fecha IS NOT NULL AND fecha_coordinacion IS NULL;

UPDATE seguimiento_pedidos
SET fecha_coordinacion_pendiente = COALESCE(contacto_mercurio_fecha, CAST(created_at AS TEXT))
WHERE contacto_proveedor_fecha_pendiente IS NOT NULL AND fecha_coordinacion_pendiente IS NULL;

UPDATE seguimiento_pedidos
SET fecha_confirmacion_deposito = COALESCE(contacto_mercurio_fecha, CAST(created_at AS TEXT))
WHERE fecha_confirmada = TRUE AND fecha_confirmacion_deposito IS NULL;

UPDATE seguimiento_pedidos
SET fecha_pendiente_confirmacion_deposito = COALESCE(contacto_mercurio_fecha, CAST(created_at AS TEXT))
WHERE fecha_pendiente_confirmada = TRUE AND fecha_pendiente_confirmacion_deposito IS NULL;

UPDATE seguimiento_pedidos
SET fecha_ingreso_deposito = COALESCE(fecha_confirmacion_destinatario, contacto_mercurio_fecha, CAST(created_at AS TEXT))
WHERE LOWER(estado) IN ('recepción parcial', 'recepción total', 'recibido') AND fecha_ingreso_deposito IS NULL;
