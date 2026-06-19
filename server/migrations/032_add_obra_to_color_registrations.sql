-- Migración 032: Agregar columna 'obra' a color_registrations
ALTER TABLE color_registrations ADD COLUMN IF NOT EXISTS obra VARCHAR(255);
