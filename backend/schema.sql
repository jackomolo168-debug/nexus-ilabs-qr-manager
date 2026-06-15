-- Run this file to create tables
psql -U postgres -d qr_management -f schema.sql

-- Or copy and paste in psql
\c qr_management;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QR Codes table
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    slug VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('url', 'text', 'contact', 'wifi', 'json')),
    content JSONB NOT NULL,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scans table
CREATE TABLE IF NOT EXISTS scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    referrer TEXT,
    geo_city VARCHAR(100),
    geo_country VARCHAR(100)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_qr_codes_slug ON qr_codes(slug);
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id ON qr_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_qr_code_id ON scans(qr_code_id);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans(scanned_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create admin user (password: Admin123)
INSERT INTO users (id, name, email, password_hash, role) 
VALUES (gen_random_uuid(), 'Admin User', 'admin@example.com', 
'$2b$10$E76G3x6E/62vJecBirefCu.U9lpBoL0YCtEEkgNZKjCrPUCLvduVO', 'admin')
ON CONFLICT (email) DO NOTHING;