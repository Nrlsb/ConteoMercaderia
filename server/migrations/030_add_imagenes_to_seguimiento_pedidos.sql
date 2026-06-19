-- Migration to add imagenes column to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS imagenes JSONB DEFAULT '[]'::jsonb;
