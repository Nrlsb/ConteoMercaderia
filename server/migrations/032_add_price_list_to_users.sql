-- Migration: Add price_list to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS price_list VARCHAR(10) DEFAULT '001';

-- Comment on column
COMMENT ON COLUMN public.users.price_list IS 'Tipo de lista de precios a utilizar (001 o 500)';
