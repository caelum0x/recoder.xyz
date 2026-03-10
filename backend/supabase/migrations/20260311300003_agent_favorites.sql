CREATE TABLE IF NOT EXISTS agent_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  quick_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_agent_favorites_user ON agent_favorites(user_id, display_order);

-- Access control enforced at application layer (WHERE user_id = :user_id)
