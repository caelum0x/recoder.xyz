CREATE TABLE IF NOT EXISTS agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  message_index INTEGER,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  feedback_type TEXT DEFAULT 'general' CHECK (feedback_type IN ('general', 'accuracy', 'speed', 'helpfulness', 'formatting', 'bug_report')),
  comment TEXT,
  tags TEXT[] DEFAULT '{}',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  category_name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  feedback_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, category_name)
);

CREATE INDEX idx_agent_feedback_agent ON agent_feedback(agent_id, created_at DESC);
CREATE INDEX idx_agent_feedback_user ON agent_feedback(user_id, created_at DESC);
CREATE INDEX idx_agent_feedback_rating ON agent_feedback(rating, created_at DESC);
CREATE INDEX idx_feedback_categories_user ON feedback_categories(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
