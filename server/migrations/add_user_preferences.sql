-- Agrega columna preferences (JSONB) a la tabla users
-- Permite guardar preferencias por usuario (ej: altura_ref para Hogar y Obra)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'preferences'
  ) THEN
    ALTER TABLE users ADD COLUMN preferences jsonb DEFAULT '{}';
  END IF;
END $$;
