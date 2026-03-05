-- =============================================
-- MIGRACIÓN: Agregar sucursal_id a la tabla receipts
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Agregar columna sucursal_id a receipts (como en egresos)
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES sucursales(id);

-- Agregar columna sucursal_id a receipt_items si no existe (para consistencia futura)
-- No es estrictamente necesaria ahora, pero mantiene paridad con egreso_items.
