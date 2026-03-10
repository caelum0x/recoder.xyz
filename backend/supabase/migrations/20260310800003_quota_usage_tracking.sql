-- Sprint 49, Phase 4: Usage Quotas Dashboard
-- Tracks daily aggregated usage per user/agent for quota dashboards and forecasting.

CREATE TABLE IF NOT EXISTS quota_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  run_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  UNIQUE (user_id, agent_id, date)
);

CREATE INDEX idx_quota_usage_user ON quota_usage_daily(user_id, date DESC);
CREATE INDEX idx_quota_usage_agent ON quota_usage_daily(agent_id, date DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
