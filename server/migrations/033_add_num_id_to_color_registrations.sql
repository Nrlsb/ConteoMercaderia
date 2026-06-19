-- Migración 033: Agregar columna autoincremental num_id a color_registrations
ALTER TABLE color_registrations ADD COLUMN IF NOT EXISTS num_id SERIAL;
