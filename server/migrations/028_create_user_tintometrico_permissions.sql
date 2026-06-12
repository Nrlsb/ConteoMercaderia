CREATE TABLE IF NOT EXISTS user_tintometrico_permissions (
    username VARCHAR(255) PRIMARY KEY,
    enabled BOOLEAN DEFAULT TRUE,
    allow_alba BOOLEAN DEFAULT TRUE,
    allow_plavicon BOOLEAN DEFAULT TRUE,
    allow_tersuave BOOLEAN DEFAULT TRUE,
    allow_formula BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insertar configuración global por defecto
INSERT INTO user_tintometrico_permissions (username, enabled, allow_alba, allow_plavicon, allow_tersuave, allow_formula)
VALUES ('GLOBAL_SETTINGS', TRUE, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (username) DO NOTHING;
