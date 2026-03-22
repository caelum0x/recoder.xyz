CREATE TABLE IF NOT EXISTS quota_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rule_name TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('api_calls', 'tokens', 'cost_usd', 'storage_mb', 'agents_count', 'threads_count')),
  agent_id TEXT,
  threshold_value NUMERIC(12,4) NOT NULL,
  threshold_type TEXT DEFAULT 'absolute' CHECK (threshold_type IN ('absolute', 'percentage')),
  comparison TEXT DEFAULT 'gte' CHECK (comparison IN ('gte', 'lte', 'gt', 'lt')),
  alert_channel TEXT DEFAULT 'in_app' CHECK (alert_channel IN ('in_app', 'email', 'webhook')),
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, rule_name)
);

CREATE TABLE IF NOT EXISTS quota_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES quota_alert_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  metric_value NUMERIC(12,4) NOT NULL,
  threshold_value NUMERIC(12,4) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  triggered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quota_rules_user ON quota_alert_rules(user_id);
CREATE INDEX idx_quota_events_rule ON quota_alert_events(rule_id, triggered_at DESC);
CREATE INDEX idx_quota_events_user ON quota_alert_events(user_id, triggered_at DESC);
CREATE INDEX idx_quota_events_unread ON quota_alert_events(user_id, is_read) WHERE is_read = false;

-- Access control enforced at application layer (WHERE user_id = :user_id)
