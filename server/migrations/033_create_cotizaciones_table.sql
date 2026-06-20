-- Migration: Create cotizaciones table
CREATE TABLE IF NOT EXISTS cotizaciones (
  id TEXT PRIMARY KEY, -- 'dolar_billete' o 'dolar_divisa'
  valor NUMERIC(12, 4) NOT NULL,
  origen TEXT DEFAULT 'Banco de la Nación Argentina',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Registros por defecto si no existen
INSERT INTO cotizaciones (id, valor, origen) VALUES
('dolar_billete', 1.0, 'Banco de la Nación Argentina'),
('dolar_divisa', 1.0, 'Banco de la Nación Argentina')
ON CONFLICT (id) DO NOTHING;
