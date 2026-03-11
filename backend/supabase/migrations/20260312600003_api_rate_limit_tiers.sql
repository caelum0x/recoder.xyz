CREATE TABLE IF NOT EXISTS rate_limit_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tier_name TEXT NOT NULL,
  requests_per_minute INTEGER DEFAULT 60,
  requests_per_hour INTEGER DEFAULT 1000,
  requests_per_day INTEGER DEFAULT 10000,
  burst_allowance INTEGER DEFAULT 10,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, tier_name)
);

CREATE TABLE IF NOT EXISTS agent_rate_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  tier_id UUID NOT NULL REFERENCES rate_limit_tiers(id) ON DELETE CASCADE,
  override_rpm INTEGER,
  override_rph INTEGER,
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS rate_limit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  tier_id UUID REFERENCES rate_limit_tiers(id),
  requests_in_window INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  window_type TEXT DEFAULT 'minute' CHECK (window_type IN ('minute', 'hour', 'day')),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tier_user ON rate_limit_tiers(user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_agent ON agent_rate_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_assignment_user ON agent_rate_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_usage_user ON rate_limit_usage(user_id, window_start DESC);
-- Access control enforced at application layer (WHERE user_id = :user_id)
