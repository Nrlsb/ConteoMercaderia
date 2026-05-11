-- Migration: Add parent_count_id to general_counts and atomic increment function
ALTER TABLE general_counts ADD COLUMN IF NOT EXISTS parent_count_id uuid REFERENCES general_counts(id);

-- Atomic increment function for inventory scans
CREATE OR REPLACE FUNCTION increment_inventory_scan(
    p_order_number text,
    p_user_id uuid,
    p_code text,
    p_delta integer
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
