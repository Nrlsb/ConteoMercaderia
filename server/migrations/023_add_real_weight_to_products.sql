-- Migration: Add real_weight column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS real_weight TEXT;

-- Create index for faster lookup/filtering on real_weight if needed
CREATE INDEX IF NOT EXISTS idx_products_real_weight ON products(real_weight);
