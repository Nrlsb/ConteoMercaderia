-- Migration: Add product_codes column to general_counts table
-- This column stores the list of product codes from an XML file upload,
-- allowing the branch count list to show only the products in that XML
-- instead of all products in the database.
--
-- Run this in your Supabase SQL Editor.

ALTER TABLE general_counts
ADD COLUMN IF NOT EXISTS product_codes TEXT[] DEFAULT NULL;

-- Optional: Create an index to speed up filtering by product_codes
-- (only needed if you have thousands of counts with many product codes)
-- CREATE INDEX IF NOT EXISTS idx_general_counts_product_codes ON general_counts USING GIN (product_codes);
