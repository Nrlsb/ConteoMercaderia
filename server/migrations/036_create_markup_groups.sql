-- Migration: Create markup_groups table and add reference in sucursales
CREATE TABLE IF NOT EXISTS markup_groups (
    id TEXT PRIMARY KEY,
    value NUMERIC DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS markup_group_id TEXT REFERENCES markup_groups(id) ON DELETE SET NULL;
