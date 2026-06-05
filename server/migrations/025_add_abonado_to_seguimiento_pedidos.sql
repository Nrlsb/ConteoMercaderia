-- Migration to add abonado field to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos 
ADD COLUMN IF NOT EXISTS abonado BOOLEAN DEFAULT TRUE;
