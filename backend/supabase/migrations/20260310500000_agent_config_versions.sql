-- Sprint 46: Agent Configuration Versioning (Snapshots)
-- Provides point-in-time config snapshots separate from the existing agent_versions system.
-- Access control enforced at application layer (no RLS policies).

BEGIN;

CREATE TABLE IF NOT EXISTS agent_config_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    agent_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    name TEXT,
    description TEXT,
    config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(agent_id, version_number)
);

-- Index for listing versions by agent, newest first
CREATE INDEX IF NOT EXISTS idx_agent_config_versions_agent_version
    ON agent_config_versions (agent_id, version_number DESC);

-- Index for filtering by user
CREATE INDEX IF NOT EXISTS idx_agent_config_versions_user_id
    ON agent_config_versions (user_id);

COMMIT;
