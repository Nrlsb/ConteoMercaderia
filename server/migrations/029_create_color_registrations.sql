-- Drop table if exists to allow clean recreate during development
DROP TABLE IF EXISTS color_registrations CASCADE;

-- Create color_registrations table
CREATE TABLE IF NOT EXISTS color_registrations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    color_type VARCHAR(50) NOT NULL CHECK (color_type IN ('tintometrico', 'manual')),
    color_name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    identification_id VARCHAR(512) NOT NULL,
    color_code VARCHAR(255),
    hex VARCHAR(50),
    observations TEXT,
    capacity_real NUMERIC,
    formula JSONB,
    base VARCHAR(50),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE color_registrations ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON color_registrations;
CREATE POLICY "Allow all operations for authenticated users" ON color_registrations
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
