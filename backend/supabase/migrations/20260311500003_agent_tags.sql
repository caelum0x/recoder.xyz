CREATE TABLE IF NOT EXISTS agent_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS agent_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tag_id UUID NOT NULL REFERENCES agent_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, tag_id)
);

CREATE INDEX idx_agent_tags_user ON agent_tags(user_id);
CREATE INDEX idx_tag_assignments_agent ON agent_tag_assignments(agent_id);
CREATE INDEX idx_tag_assignments_tag ON agent_tag_assignments(tag_id);
CREATE INDEX idx_tag_assignments_user ON agent_tag_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
