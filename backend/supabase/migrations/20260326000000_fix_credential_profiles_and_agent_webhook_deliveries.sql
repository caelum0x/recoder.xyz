-- Fix 1: Create user_mcp_credential_profiles table
-- (Original migration referenced auth.users FK and auth.uid() RLS which don't exist on self-hosted PG)
CREATE TABLE IF NOT EXISTS user_mcp_credential_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    mcp_qualified_name TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    encrypted_config TEXT NOT NULL,
    config_hash TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,

    UNIQUE(account_id, mcp_qualified_name, profile_name)
);

CREATE INDEX IF NOT EXISTS idx_credential_profiles_account_mcp
    ON user_mcp_credential_profiles(account_id, mcp_qualified_name);

CREATE INDEX IF NOT EXISTS idx_credential_profiles_account_active
    ON user_mcp_credential_profiles(account_id, is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_credential_profiles_default
    ON user_mcp_credential_profiles(account_id, mcp_qualified_name, is_default)
    WHERE is_default = true;

CREATE OR REPLACE FUNCTION ensure_single_default_profile()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE user_mcp_credential_profiles
        SET is_default = false, updated_at = NOW()
        WHERE account_id = NEW.account_id
          AND mcp_qualified_name = NEW.mcp_qualified_name
          AND profile_id != NEW.profile_id
          AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_single_default_profile ON user_mcp_credential_profiles;
CREATE TRIGGER trigger_ensure_single_default_profile
    BEFORE INSERT OR UPDATE ON user_mcp_credential_profiles
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_profile();

CREATE OR REPLACE FUNCTION update_credential_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_credential_profile_timestamp ON user_mcp_credential_profiles;
CREATE TRIGGER trigger_update_credential_profile_timestamp
    BEFORE UPDATE ON user_mcp_credential_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_credential_profile_timestamp();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'workflows' AND column_name = 'mcp_credential_mappings'
    ) THEN
        ALTER TABLE workflows ADD COLUMN mcp_credential_mappings JSONB DEFAULT '{}';
    END IF;
END $$;

-- Fix 2: Create agent_webhook_deliveries table
-- (Production had a different webhook_deliveries table for webhook_endpoints, not agent_webhooks)
CREATE TABLE IF NOT EXISTS agent_webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES agent_webhooks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    response_status INTEGER,
    response_body TEXT,
    attempt INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_deliveries_webhook ON agent_webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_deliveries_user ON agent_webhook_deliveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_deliveries_status ON agent_webhook_deliveries(status) WHERE status IN ('pending', 'retrying');

-- Access control enforced at application layer (WHERE user_id = :user_id)
