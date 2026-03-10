CREATE TABLE IF NOT EXISTS agent_activity_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  run_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  total_cost NUMERIC(10,6) DEFAULT 0,
  UNIQUE (user_id, agent_id, date)
);

CREATE INDEX idx_agent_activity_user ON agent_activity_daily(user_id, date DESC);
CREATE INDEX idx_agent_activity_agent ON agent_activity_daily(agent_id, date DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
