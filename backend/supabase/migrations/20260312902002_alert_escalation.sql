CREATE TABLE IF NOT EXISTS escalation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  policy_name TEXT NOT NULL,
  description TEXT,
  escalation_steps JSONB NOT NULL DEFAULT '[]',
  repeat_interval_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, policy_name)
);

CREATE TABLE IF NOT EXISTS escalation_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES escalation_policies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'escalated', 'resolved', 'closed')),
  source TEXT,
  details JSONB DEFAULT '{}',
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES escalation_incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_type TEXT DEFAULT 'notify' CHECK (action_type IN ('notify', 'acknowledge', 'escalate', 'resolve', 'comment')),
  step_index INTEGER DEFAULT 0,
  notes TEXT,
  performed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_escalation_policies_user ON escalation_policies(user_id);
CREATE INDEX idx_escalation_incidents_user ON escalation_incidents(user_id, created_at DESC);
CREATE INDEX idx_escalation_incidents_status ON escalation_incidents(status, created_at DESC);
CREATE INDEX idx_escalation_actions_incident ON escalation_actions(incident_id, performed_at ASC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
