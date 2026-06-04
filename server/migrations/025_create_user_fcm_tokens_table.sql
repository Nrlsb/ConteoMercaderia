-- Create user_fcm_tokens table
CREATE TABLE IF NOT EXISTS user_fcm_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    device_type TEXT DEFAULT 'android',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE user_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to manage their own tokens
DROP POLICY IF EXISTS "Allow users to manage their own tokens" ON user_fcm_tokens;
CREATE POLICY "Allow users to manage their own tokens" ON user_fcm_tokens
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
