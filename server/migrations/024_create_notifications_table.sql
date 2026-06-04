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

-- Enable Row Level Security (RLS)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists and create it
DROP POLICY IF EXISTS "Allow users to see their own notifications" ON notifications;
CREATE POLICY "Allow users to see their own notifications" ON notifications
    FOR ALL
    TO authenticated
    USING (true) -- Permitimos leer a usuarios autenticados, o mejor restringimos para que lean solo las suyas
    WITH CHECK (true);

-- Enable Realtime for notifications table
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
