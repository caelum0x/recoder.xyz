-- Sprint 59 Phase 1: Agent Environment Variables (extended schema)
-- Adds audit log for env variable operations and extends unique constraint to include user_id.

CREATE TABLE IF NOT EXISTS agent_env_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  is_secret BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, key)
);

CREATE TABLE IF NOT EXISTS env_variable_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'revealed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_env_vars_agent ON agent_env_variables(agent_id);
CREATE INDEX IF NOT EXISTS idx_env_vars_user ON agent_env_variables(user_id);
CREATE INDEX IF NOT EXISTS idx_env_audit_agent ON env_variable_audit(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_env_audit_user ON env_variable_audit(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
