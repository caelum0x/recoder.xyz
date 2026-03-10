CREATE TABLE IF NOT EXISTS user_integrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    provider text NOT NULL,
    status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error', 'expired')),
    connected_at timestamptz DEFAULT now(),
    last_sync_at timestamptz,
    error_message text,
    scopes text[] DEFAULT '{}',
    access_token_encrypted text,
    refresh_token_encrypted text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider)
);

CREATE INDEX idx_user_integrations_user ON user_integrations (user_id);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_integrations_policy ON user_integrations
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
