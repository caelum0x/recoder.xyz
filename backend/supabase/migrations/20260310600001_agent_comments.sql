CREATE TABLE IF NOT EXISTS agent_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  parent_id UUID REFERENCES agent_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  section TEXT DEFAULT 'general' CHECK (section IN ('general', 'instructions', 'tools', 'knowledge', 'triggers', 'performance')),
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_comments_agent ON agent_comments(agent_id, created_at DESC);
CREATE INDEX idx_agent_comments_user ON agent_comments(user_id);
CREATE INDEX idx_agent_comments_parent ON agent_comments(parent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
