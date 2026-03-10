-- Agent quota management table
CREATE TABLE IF NOT EXISTS agent_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  max_runs_per_day INTEGER,
  max_tokens_per_day INTEGER,
  max_cost_per_day NUMERIC(10,4),
  max_runs_per_month INTEGER,
  max_tokens_per_month INTEGER,
  max_cost_per_month NUMERIC(10,4),
  alert_threshold_pct INTEGER DEFAULT 80,
  is_enforced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_agent_quotas_user ON agent_quotas(user_id);
CREATE INDEX idx_agent_quotas_agent ON agent_quotas(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
