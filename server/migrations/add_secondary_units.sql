-- Migration: Add secondary unit fields to products table
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='primary_unit') THEN
    ALTER TABLE products ADD COLUMN primary_unit text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='secondary_unit') THEN
    ALTER TABLE products ADD COLUMN secondary_unit text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='conversion_factor') THEN
    ALTER TABLE products ADD COLUMN conversion_factor numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='conversion_type') THEN
    ALTER TABLE products ADD COLUMN conversion_type text;
  END IF;
END $$;
