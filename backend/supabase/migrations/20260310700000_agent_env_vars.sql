-- Sprint 48 Phase 1: Agent Environment Variables
-- Stores key-value environment variables per agent, separate from secrets.
-- Env vars are configuration values (non-sensitive) that can be viewed in plaintext.

CREATE TABLE IF NOT EXISTS agent_env_vars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    is_secret BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(agent_id, key)
);

CREATE INDEX idx_agent_env_vars_agent_id ON agent_env_vars(agent_id);
CREATE INDEX idx_agent_env_vars_user_id ON agent_env_vars(user_id);
CREATE INDEX idx_agent_env_vars_agent_user ON agent_env_vars(agent_id, user_id);
