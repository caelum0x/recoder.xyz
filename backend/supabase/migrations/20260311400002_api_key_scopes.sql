CREATE TABLE IF NOT EXISTS api_key_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('agents:read', 'agents:write', 'threads:read', 'threads:write', 'runs:execute', 'kb:read', 'kb:write', 'billing:read', 'admin:all', 'webhooks:manage', 'search:read')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (key_id, scope)
);

CREATE TABLE IF NOT EXISTS api_key_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key_id TEXT NOT NULL UNIQUE,
  allowed_ips TEXT[] DEFAULT '{}',
  allowed_agents TEXT[] DEFAULT '{}',
  rate_limit_override INTEGER,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_key_scopes_key ON api_key_scopes(key_id);
CREATE INDEX idx_key_scopes_user ON api_key_scopes(user_id);
CREATE INDEX idx_key_restrictions_key ON api_key_restrictions(key_id);
CREATE INDEX idx_key_restrictions_user ON api_key_restrictions(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
