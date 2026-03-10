-- Sprint 50 Phase 5: Incident Tracker
-- Tracks agent incidents (failed runs, errors, anomalies) with status workflow

CREATE TABLE IF NOT EXISTS agent_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  root_cause TEXT,
  resolution TEXT,
  auto_created BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_incidents_user ON agent_incidents(user_id, created_at DESC);
CREATE INDEX idx_incidents_agent ON agent_incidents(agent_id, created_at DESC);
CREATE INDEX idx_incidents_status ON agent_incidents(status) WHERE status != 'resolved';

-- Access control enforced at application layer (WHERE user_id = :user_id)
