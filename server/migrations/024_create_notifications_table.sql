-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    read BOOLEAN DEFAULT FALSE,
    pedido_id UUID REFERENCES seguimiento_pedidos(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 3. Crear política para que usuarios anon (frontend) y authenticated (backend) puedan operar
DROP POLICY IF EXISTS "Allow users to see their own notifications" ON notifications;
CREATE POLICY "Allow users to see their own notifications" ON notifications
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Habilitar Realtime para esta tabla
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- Intenta añadir la tabla a la publicación de realtime si existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
