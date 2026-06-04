-- Migration: Add capacity column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS capacity TEXT;

-- Create an index for fast lookups on capacity if needed
CREATE INDEX IF NOT EXISTS idx_products_capacity ON products(capacity);
