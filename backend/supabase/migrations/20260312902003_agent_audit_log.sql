CREATE TABLE IF NOT EXISTS agent_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  action TEXT NOT NULL,
  actor TEXT DEFAULT 'user',
  old_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  retention_days INTEGER DEFAULT 90,
  export_before_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_audit_events_user ON agent_audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_events_agent ON agent_audit_events(agent_id, created_at DESC);
CREATE INDEX idx_audit_events_type ON agent_audit_events(event_type, created_at DESC);
CREATE INDEX idx_audit_events_resource ON agent_audit_events(resource_type, resource_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
