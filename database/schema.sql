-- Recoder.xyz Unified Database Schema
-- Production-ready PostgreSQL schema for all Recoder products

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table - Central user management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    password_hash TEXT, -- For email/password auth
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- User authentication providers (OAuth, etc.)
CREATE TABLE user_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'github', 'google', 'discord', etc.
    provider_id VARCHAR(255) NOT NULL, -- Provider's user ID
    provider_username VARCHAR(255),
    provider_email VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider, provider_id)
);

-- Subscription plans
CREATE TYPE plan_type AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
CREATE TYPE plan_status AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PAUSED');

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type plan_type NOT NULL DEFAULT 'FREE',
    status plan_status NOT NULL DEFAULT 'ACTIVE',
    starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb, -- Payment info, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Plan limits and features
CREATE TABLE plan_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_type plan_type NOT NULL,
    product VARCHAR(50) NOT NULL, -- 'cli', 'web', 'chat', 'extension', 'router'
    feature VARCHAR(100) NOT NULL, -- 'requests_per_month', 'projects', 'storage_mb'
    limit_value BIGINT NOT NULL, -- -1 for unlimited
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plan_type, product, feature)
);

-- User sessions for cross-domain auth
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    product VARCHAR(50) NOT NULL, -- Which Recoder product
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage tracking across all products
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product VARCHAR(50) NOT NULL, -- 'cli', 'web', 'chat', 'extension', 'router'
    action VARCHAR(100) NOT NULL, -- 'code_generation', 'chat_message', 'project_create'
    resource_type VARCHAR(50), -- 'api_call', 'storage', 'computation'
    resource_count INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX (user_id, product, created_at),
    INDEX (created_at) -- For cleanup
);

-- API keys storage (encrypted)
CREATE TABLE user_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'anthropic', 'openai', 'groq', etc.
    encrypted_key TEXT NOT NULL, -- Encrypted with app secret
    key_name VARCHAR(100), -- User-friendly name
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, provider)
);

-- Projects (for web platform and CLI)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_type VARCHAR(50) NOT NULL, -- 'web', 'mobile', 'api', 'blockchain'
    template_id UUID, -- Reference to template if used
    settings JSONB DEFAULT '{}'::jsonb,
    file_count INTEGER DEFAULT 0,
    storage_used_mb INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX (user_id, created_at)
);

-- Project files (for web platform)
CREATE TABLE project_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path VARCHAR(1000) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- 'javascript', 'typescript', 'python', etc.
    content TEXT,
    size_bytes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, file_path)
);

-- Chat conversations
CREATE TABLE chat_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    model_provider VARCHAR(50) NOT NULL, -- 'anthropic', 'openai', etc.
    model_name VARCHAR(100) NOT NULL,
    system_prompt TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX (user_id, created_at)
);

-- Chat messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Attachments, reasoning, etc.
    token_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX (conversation_id, created_at)
);

-- Templates for code generation
CREATE TABLE code_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- 'web', 'mobile', 'api', 'blockchain'
    template_type VARCHAR(50) NOT NULL, -- 'react', 'nextjs', 'nodejs', 'solana'
    files JSONB NOT NULL, -- Template file structure and content
    variables JSONB DEFAULT '[]'::jsonb, -- Template variables
    tags TEXT[] DEFAULT '{}',
    is_public BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX (category, template_type),
    INDEX (is_public, usage_count)
);

-- System configuration
CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default plan limits
INSERT INTO plan_limits (plan_type, product, feature, limit_value) VALUES
-- FREE plan limits
('FREE', 'cli', 'requests_per_month', 50),
('FREE', 'cli', 'storage_mb', 100),
('FREE', 'web', 'projects_max', 3),
('FREE', 'web', 'storage_mb', 100),
('FREE', 'chat', 'messages_per_day', 100),
('FREE', 'chat', 'conversations_max', 10),
('FREE', 'extension', 'suggestions_per_day', 200),
('FREE', 'router', 'requests_per_month', 50),

-- PRO plan limits
('PRO', 'cli', 'requests_per_month', 1000),
('PRO', 'cli', 'storage_mb', 1024),
('PRO', 'web', 'projects_max', 20),
('PRO', 'web', 'storage_mb', 1024),
('PRO', 'chat', 'messages_per_day', 1000),
('PRO', 'chat', 'conversations_max', 100),
('PRO', 'extension', 'suggestions_per_day', 2000),
('PRO', 'router', 'requests_per_month', 1000),

-- ENTERPRISE plan limits (unlimited = -1)
('ENTERPRISE', 'cli', 'requests_per_month', -1),
('ENTERPRISE', 'cli', 'storage_mb', 10240),
('ENTERPRISE', 'web', 'projects_max', -1),
('ENTERPRISE', 'web', 'storage_mb', 10240),
('ENTERPRISE', 'chat', 'messages_per_day', -1),
('ENTERPRISE', 'chat', 'conversations_max', -1),
('ENTERPRISE', 'extension', 'suggestions_per_day', -1),
('ENTERPRISE', 'router', 'requests_per_month', -1);

-- Insert system configuration
INSERT INTO system_config (key, value, description) VALUES
('maintenance_mode', 'false', 'Enable/disable maintenance mode'),
('max_file_size_mb', '10', 'Maximum file upload size in MB'),
('supported_models', '["claude-3-sonnet", "gpt-4", "groq-llama", "gemini-pro"]', 'List of supported AI models'),
('rate_limits', '{"free": 60, "pro": 300, "enterprise": 1000}', 'Rate limits per minute by plan'),
('features_enabled', '{"chat": true, "web": true, "cli": true, "extension": true}', 'Feature toggles');

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_sessions_token ON user_sessions(token);
CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_usage_logs_user_product ON usage_logs(user_id, product);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_chat_conversations_user_id ON chat_conversations(user_id);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON chat_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (users can only access their own data)
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Users can view own subscriptions" ON subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can view own usage logs" ON usage_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own projects" ON projects FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage own project files" ON project_files FOR ALL USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own conversations" ON chat_conversations FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage own messages" ON chat_messages FOR ALL USING (conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = auth.uid()));

-- Utility functions for common operations
CREATE OR REPLACE FUNCTION get_user_plan(user_uuid UUID)
RETURNS plan_type AS $$
DECLARE
    user_plan plan_type;
BEGIN
    SELECT s.plan_type INTO user_plan
    FROM subscriptions s
    WHERE s.user_id = user_uuid 
    AND s.status = 'ACTIVE'
    AND (s.ends_at IS NULL OR s.ends_at > NOW())
    ORDER BY s.created_at DESC
    LIMIT 1;
    
    RETURN COALESCE(user_plan, 'FREE'::plan_type);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_limit(user_uuid UUID, product_name VARCHAR, feature_name VARCHAR)
RETURNS BIGINT AS $$
DECLARE
    user_plan plan_type;
    limit_val BIGINT;
BEGIN
    user_plan := get_user_plan(user_uuid);
    
    SELECT pl.limit_value INTO limit_val
    FROM plan_limits pl
    WHERE pl.plan_type = user_plan
    AND pl.product = product_name
    AND pl.feature = feature_name;
    
    RETURN COALESCE(limit_val, 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_usage(user_uuid UUID, product_name VARCHAR, timeframe INTERVAL DEFAULT '1 month')
RETURNS BIGINT AS $$
DECLARE
    usage_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO usage_count
    FROM usage_logs ul
    WHERE ul.user_id = user_uuid
    AND ul.product = product_name
    AND ul.created_at > NOW() - timeframe;
    
    RETURN COALESCE(usage_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE users IS 'Central user management across all Recoder products';
COMMENT ON TABLE subscriptions IS 'User subscription plans and billing status';
COMMENT ON TABLE plan_limits IS 'Feature limits and quotas for each plan type';
COMMENT ON TABLE usage_logs IS 'Track usage across all products for billing and analytics';
COMMENT ON TABLE projects IS 'User projects from web platform and CLI';
COMMENT ON TABLE chat_conversations IS 'Chat conversations from Recoder Chat';
COMMENT ON FUNCTION get_user_plan(UUID) IS 'Get current active plan for a user';
COMMENT ON FUNCTION get_user_limit(UUID, VARCHAR, VARCHAR) IS 'Get feature limit for user based on their plan';
COMMENT ON FUNCTION get_user_usage(UUID, VARCHAR, INTERVAL) IS 'Get usage count for user in specified timeframe';