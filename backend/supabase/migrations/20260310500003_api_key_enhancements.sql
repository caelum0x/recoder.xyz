-- API Key Permissions: enhanced per-key permission management
-- Sprint 46, Phase 5: Enhanced Developer API Key Management

CREATE TABLE IF NOT EXISTS api_key_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  allowed_endpoints TEXT[] DEFAULT '{}',
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_day INTEGER DEFAULT 10000,
  ip_whitelist TEXT[] DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (key_id)
);

CREATE INDEX idx_api_key_perms_key ON api_key_permissions(key_id);
CREATE INDEX idx_api_key_perms_user ON api_key_permissions(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
