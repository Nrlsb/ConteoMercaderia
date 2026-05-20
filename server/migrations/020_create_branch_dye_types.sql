-- Create branch_dye_types table
CREATE TABLE IF NOT EXISTS branch_dye_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_name VARCHAR(255) UNIQUE NOT NULL,
    dye_type VARCHAR(50) NOT NULL CHECK (dye_type IN ('Automotor', 'Hogar y Obra')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on branch_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_branch_dye_types_branch_name ON branch_dye_types(branch_name);

-- Enable RLS
ALTER TABLE branch_dye_types ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read
CREATE POLICY "Anyone can read branch_dye_types"
    ON branch_dye_types
    FOR SELECT
    USING (true);

-- Policy: Only admins can update/insert/delete
CREATE POLICY "Only admins can manage branch_dye_types"
    ON branch_dye_types
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'superadmin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'superadmin'));
