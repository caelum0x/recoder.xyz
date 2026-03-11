CREATE TABLE IF NOT EXISTS incident_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  incident_id TEXT,
  title TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'published', 'archived')),
  summary TEXT,
  timeline JSONB DEFAULT '[]',
  root_cause TEXT,
  impact TEXT,
  action_items JSONB DEFAULT '[]',
  lessons_learned TEXT[] DEFAULT '{}',
  affected_agents TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_postmortems_user ON incident_postmortems(user_id, created_at DESC);
CREATE INDEX idx_postmortems_status ON incident_postmortems(status);
CREATE INDEX idx_postmortems_severity ON incident_postmortems(severity);

-- Access control enforced at application layer (WHERE user_id = :user_id)
