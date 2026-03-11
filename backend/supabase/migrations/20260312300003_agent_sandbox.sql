-- Migration: agent sandbox sessions and test cases
-- Sprint 64, Phase 4: Agent Playground Sandbox

CREATE TABLE IF NOT EXISTS agent_sandbox_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    agent_id TEXT NOT NULL,
    sandbox_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sandbox_test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    input_message TEXT NOT NULL,
    expected_behavior TEXT,
    last_result JSONB,
    pass_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_user_agent ON agent_sandbox_sessions (user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_status ON agent_sandbox_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_expires ON agent_sandbox_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sandbox_test_cases_user_agent ON sandbox_test_cases (user_id, agent_id);
