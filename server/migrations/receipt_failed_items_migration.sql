-- =============================================
-- MIGRACIÓN: Agregar failed_items a la tabla receipts
-- Ejecutar en Supabase SQL Editor
-- =============================================

ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS failed_items JSONB DEFAULT '[]'::jsonb;
