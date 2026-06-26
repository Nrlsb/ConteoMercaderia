-- Crear tabla de corridas de snapshots de stock
CREATE TABLE IF NOT EXISTS stock_snapshots_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_type VARCHAR(50) NOT NULL, -- '19:00' | '05:30' | 'manual'
    snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL,
    total_items INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de detalles de los snapshots de stock
CREATE TABLE IF NOT EXISTS stock_snapshots_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES stock_snapshots_runs(id) ON DELETE CASCADE,
    product_code VARCHAR(100) NOT NULL,
    product_description TEXT,
    quantity NUMERIC DEFAULT 0,
    local VARCHAR(50) NOT NULL,
    filial VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_stock_snapshots_items_run_id ON stock_snapshots_items(run_id);
CREATE INDEX IF NOT EXISTS idx_stock_snapshots_items_product_code ON stock_snapshots_items(product_code);

-- Crear tabla de comparaciones de stock (con el consolidado de diferencias)
CREATE TABLE IF NOT EXISTS stock_comparisons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_start_id UUID REFERENCES stock_snapshots_runs(id) ON DELETE CASCADE,
    run_end_id UUID REFERENCES stock_snapshots_runs(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    period_type VARCHAR(50) NOT NULL, -- 'nocturno' | 'diurno' | 'manual'
    differences JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de [{code, description, qty_start, qty_end, diff}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
