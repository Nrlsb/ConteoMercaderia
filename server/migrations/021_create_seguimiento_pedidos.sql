-- Create seguimiento_pedidos table
CREATE TABLE IF NOT EXISTS seguimiento_pedidos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    fecha DATE DEFAULT CURRENT_DATE,
    quien_solicita TEXT,
    para_quien TEXT,
    nro_pedido_venta TEXT,
    proveedor_marca TEXT,
    nro_pedido TEXT,
    urgencia BOOLEAN DEFAULT FALSE,
    rotacion BOOLEAN DEFAULT FALSE,
    transp_mercurio BOOLEAN DEFAULT FALSE,
    otro_transporte BOOLEAN DEFAULT FALSE,
    codigo_mercurio TEXT,
    descripcion_capacidad TEXT,
    cant_pedido NUMERIC,
    prev_entrada TEXT,
    nro_pedido_compra TEXT,
    recepcion_parcial TEXT,
    contacto_mercurio TEXT,
    contacto_proveedor TEXT,
    estado TEXT DEFAULT 'Pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE seguimiento_pedidos ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists and create it
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON seguimiento_pedidos;
CREATE POLICY "Allow all operations for authenticated users" ON seguimiento_pedidos
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
