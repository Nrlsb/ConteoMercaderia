-- Migration: Add tes, lista001, lista500, moneda to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS tes TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lista001 NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lista500 NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS moneda TEXT;

-- Add comments to the columns
COMMENT ON COLUMN products.tes IS 'TES (Tipo de Entrada/Saída) del producto importado de Protheus';
COMMENT ON COLUMN products.lista001 IS 'Precio de lista 001 importado de Protheus (DA1)';
COMMENT ON COLUMN products.lista500 IS 'Precio de lista 500 importado de Protheus (DA1)';
COMMENT ON COLUMN products.moneda IS 'Moneda asociada a los precios (DA1)';
