-- Migration to add columns for receiver confirmation in seguimiento_pedidos
ALTER TABLE seguimiento_pedidos
ADD COLUMN IF NOT EXISTS confirmado_destinatario BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fecha_confirmacion_destinatario TEXT,
ADD COLUMN IF NOT EXISTS cant_recibida_destinatario NUMERIC,
ADD COLUMN IF NOT EXISTS comentario_destinatario TEXT;
