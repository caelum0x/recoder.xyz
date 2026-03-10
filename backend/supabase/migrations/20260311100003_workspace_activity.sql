CREATE TABLE IF NOT EXISTS workspace_activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id TEXT,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('agent_created', 'agent_updated', 'agent_deleted', 'thread_started', 'thread_completed', 'run_started', 'run_completed', 'run_failed', 'member_joined', 'member_left', 'config_changed', 'deploy_completed')),
  actor_name TEXT,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workspace_activity_user ON workspace_activity_feed(user_id, created_at DESC);
CREATE INDEX idx_workspace_activity_workspace ON workspace_activity_feed(workspace_id, created_at DESC);
CREATE INDEX idx_workspace_activity_type ON workspace_activity_feed(activity_type);

-- Access control enforced at application layer (WHERE user_id = :user_id)
