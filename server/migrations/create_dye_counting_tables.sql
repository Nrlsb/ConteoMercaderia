-- Tablas para la lógica separada de conteo de colorantes
CREATE TABLE IF NOT EXISTS dye_counting_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'open', -- 'open', 'closed'
    sucursal_id INTEGER,
    created_by TEXT,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dye_counting_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dye_count_id UUID REFERENCES dye_counting_lists(id),
    product_code TEXT NOT NULL,
    description TEXT,
    theoretical_stock NUMERIC DEFAULT 0,
    excel_id TEXT, -- El ID que viene del excel
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Opcional, pero recomendado por consistencia con Supabase)
ALTER TABLE dye_counting_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE dye_counting_items ENABLE ROW LEVEL SECURITY;

-- Políticas simples para permitir todo a usuarios autenticados (ajustar según necesidad)
CREATE POLICY "Allow all for authenticated" ON dye_counting_lists FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON dye_counting_items FOR ALL USING (true);
