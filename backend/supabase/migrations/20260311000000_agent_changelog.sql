-- Sprint 51 Phase 1: Agent Changelog
-- Tracks all configuration changes made to agents over time.

CREATE TABLE IF NOT EXISTS agent_changelog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN (
        'instructions_updated',
        'tools_added',
        'tools_removed',
        'tools_configured',
        'model_changed',
        'name_changed',
        'knowledge_added',
        'knowledge_removed',
        'trigger_added',
        'trigger_removed',
        'integration_added',
        'integration_removed',
        'settings_changed'
    )),
    description TEXT,
    old_value JSONB,
    new_value JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_agent_changelog_agent_id ON agent_changelog (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_changelog_agent_created ON agent_changelog (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_changelog_change_type ON agent_changelog (agent_id, change_type);
CREATE INDEX IF NOT EXISTS idx_agent_changelog_user ON agent_changelog (user_id);
