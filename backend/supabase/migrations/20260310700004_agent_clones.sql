-- Sprint 48 Phase 5: Agent Clone History
-- Tracks agent cloning operations for lineage and diff features

CREATE TABLE IF NOT EXISTS agent_clone_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_agent_id TEXT NOT NULL,
  cloned_agent_id TEXT NOT NULL,
  modifications JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clone_history_user ON agent_clone_history(user_id);
CREATE INDEX idx_clone_history_source ON agent_clone_history(source_agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
