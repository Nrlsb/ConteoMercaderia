-- Migration: Add soft delete support for conteos
-- Target tables: remitos, pre_remitos, general_counts, receipts

ALTER TABLE remitos ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
ALTER TABLE pre_remitos ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
ALTER TABLE general_counts ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- Optional: Add indices for better performance when filtering by null
CREATE INDEX IF NOT EXISTS idx_remitos_deleted_at ON remitos (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pre_remitos_deleted_at ON pre_remitos (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_general_counts_deleted_at ON general_counts (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_deleted_at ON receipts (deleted_at) WHERE deleted_at IS NULL;
