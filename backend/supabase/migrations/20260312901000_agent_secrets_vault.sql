CREATE TABLE IF NOT EXISTS agent_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  secret_name TEXT NOT NULL,
  secret_value TEXT NOT NULL,
  description TEXT,
  secret_type TEXT DEFAULT 'api_key' CHECK (secret_type IN ('api_key', 'token', 'password', 'certificate', 'other')),
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, secret_name)
);

CREATE TABLE IF NOT EXISTS secret_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID NOT NULL REFERENCES agent_secrets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  accessed_at TIMESTAMPTZ DEFAULT now(),
  access_reason TEXT,
  ip_address TEXT
);

CREATE INDEX idx_agent_secrets_user ON agent_secrets(user_id, created_at DESC);
CREATE INDEX idx_agent_secrets_agent ON agent_secrets(agent_id);
CREATE INDEX idx_secret_access_log_secret ON secret_access_log(secret_id, accessed_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
