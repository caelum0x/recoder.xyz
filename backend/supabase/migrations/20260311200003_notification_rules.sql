CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('run_completed', 'run_failed', 'cost_exceeded', 'agent_error', 'health_degraded', 'quota_warning', 'thread_completed', 'schedule_missed')),
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  cooldown_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_rule_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  trigger_event TEXT NOT NULL,
  conditions_met JSONB DEFAULT '{}',
  actions_taken JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notification_rules_user ON notification_rules(user_id);
CREATE INDEX idx_notification_rules_event ON notification_rules(trigger_event);
CREATE INDEX idx_notification_rule_log_rule ON notification_rule_log(rule_id, created_at DESC);
CREATE INDEX idx_notification_rule_log_user ON notification_rule_log(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
