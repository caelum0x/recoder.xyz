CREATE TABLE IF NOT EXISTS agent_cost_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  threshold_amount NUMERIC(10,4) NOT NULL,
  threshold_period TEXT DEFAULT 'daily' CHECK (threshold_period IN ('hourly', 'daily', 'weekly', 'monthly')),
  alert_type TEXT DEFAULT 'warning' CHECK (alert_type IN ('info', 'warning', 'critical')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, threshold_period)
);

CREATE TABLE IF NOT EXISTS agent_cost_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES agent_cost_alert_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT,
  triggered_amount NUMERIC(10,4) NOT NULL,
  threshold_amount NUMERIC(10,4) NOT NULL,
  status TEXT DEFAULT 'triggered' CHECK (status IN ('triggered', 'acknowledged', 'resolved')),
  triggered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cost_rules_user ON agent_cost_alert_rules(user_id);
CREATE INDEX idx_cost_rules_agent ON agent_cost_alert_rules(agent_id);
CREATE INDEX idx_cost_history_user ON agent_cost_alert_history(user_id, triggered_at DESC);
CREATE INDEX idx_cost_history_rule ON agent_cost_alert_history(rule_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
