-- Migration to add notif_confirmacion_enviada field to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS notif_confirmacion_enviada BOOLEAN DEFAULT FALSE;
