-- Migration: Add excel_order column to products table
-- Run this in the Supabase SQL editor

ALTER TABLE products ADD COLUMN IF NOT EXISTS excel_order INTEGER;

-- Create index for fast ordering
CREATE INDEX IF NOT EXISTS idx_products_excel_order ON products (excel_order);
