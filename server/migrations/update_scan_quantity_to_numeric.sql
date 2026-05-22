-- Migration: Update inventory_scans quantity to numeric and update increment RPC function

-- 1. Alter the column type to numeric in inventory_scans
ALTER TABLE inventory_scans ALTER COLUMN quantity TYPE numeric;

-- 2. Redefine the increment function to accept numeric delta instead of integer
-- Primero eliminamos la función anterior con delta integer para evitar duplicados / sobrecarga ambigua en PostgREST
DROP FUNCTION IF EXISTS public.increment_inventory_scan(text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.increment_inventory_scan(p_order_number text, p_user_id uuid, p_code text, p_delta integer);

CREATE OR REPLACE FUNCTION increment_inventory_scan(
    p_order_number text,
    p_user_id uuid,
    p_code text,
    p_delta numeric
) RETURNS void AS $$
BEGIN
    INSERT INTO inventory_scans (order_number, user_id, code, quantity, timestamp)
    VALUES (p_order_number, p_user_id, p_code, p_delta, now())
    ON CONFLICT (order_number, user_id, code)
    DO UPDATE SET 
        quantity = inventory_scans.quantity + p_delta,
        timestamp = now();
END;
$$ LANGUAGE plpgsql;
