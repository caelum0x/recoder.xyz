-- Sprint 57, Phase 4: Agent Deployment Slots
-- Supports multi-slot deployments (production, staging, canary, rollback) with traffic splitting.

CREATE TABLE IF NOT EXISTS agent_deployment_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  slot_name TEXT NOT NULL CHECK (slot_name IN ('production', 'staging', 'canary', 'rollback')),
  config_snapshot JSONB NOT NULL DEFAULT '{}',
  traffic_percent INTEGER DEFAULT 0 CHECK (traffic_percent BETWEEN 0 AND 100),
  is_active BOOLEAN DEFAULT false,
  deployed_at TIMESTAMPTZ DEFAULT now(),
  deployed_by TEXT,
  UNIQUE (agent_id, slot_name)
);

CREATE TABLE IF NOT EXISTS deployment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  slot_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('deploy', 'promote', 'rollback', 'deactivate')),
  from_config JSONB,
  to_config JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deployment_slots_agent ON agent_deployment_slots(agent_id);
CREATE INDEX idx_deployment_slots_user ON agent_deployment_slots(user_id);
CREATE INDEX idx_deployment_history_agent ON deployment_history(agent_id, created_at DESC);
CREATE INDEX idx_deployment_history_user ON deployment_history(user_id, created_at DESC);
-- Access control enforced at application layer (WHERE user_id = :user_id)
