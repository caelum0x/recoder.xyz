CREATE TABLE IF NOT EXISTS agent_resource_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('runs_per_day', 'runs_per_hour', 'max_tokens', 'max_cost_daily', 'max_concurrent', 'max_duration_seconds')),
  quota_value NUMERIC(12,4) NOT NULL,
  current_usage NUMERIC(12,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_reset_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, resource_type)
);
CREATE TABLE IF NOT EXISTS quota_violation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_id UUID NOT NULL REFERENCES agent_resource_quotas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  attempted_value NUMERIC(12,4),
  quota_value NUMERIC(12,4),
  violated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_quotas_agent ON agent_resource_quotas(agent_id);
CREATE INDEX idx_quotas_user ON agent_resource_quotas(user_id);
CREATE INDEX idx_violations_user ON quota_violation_log(user_id, violated_at DESC);
CREATE INDEX idx_violations_agent ON quota_violation_log(agent_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
