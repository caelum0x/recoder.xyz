-- Agent Activity Feed
-- Tracks all significant actions on agents for audit/timeline purposes

CREATE TABLE IF NOT EXISTS agent_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('run_started', 'run_completed', 'run_failed', 'config_updated', 'tool_added', 'tool_removed', 'schedule_triggered', 'secret_updated', 'shared', 'cloned')),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_activity_agent ON agent_activity(agent_id, created_at DESC);
CREATE INDEX idx_agent_activity_user ON agent_activity(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
