-- Migration: Add cost_price column and ensure brand_code to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_code TEXT;

-- Add comment to cost_price column
COMMENT ON COLUMN products.cost_price IS 'Precio de costo del producto importado de Protheus';
