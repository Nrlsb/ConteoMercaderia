-- Migration: Add is_history column to color_registrations table
ALTER TABLE color_registrations ADD COLUMN IF NOT EXISTS is_history BOOLEAN DEFAULT FALSE;
