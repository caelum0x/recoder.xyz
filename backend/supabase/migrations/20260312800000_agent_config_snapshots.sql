CREATE TABLE IF NOT EXISTS agent_config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  snapshot_name TEXT NOT NULL,
  description TEXT,
  config_data JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT false,
  restored_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snapshot_restore_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES agent_config_snapshots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  restored_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_config_snapshots_agent ON agent_config_snapshots(agent_id, created_at DESC);
CREATE INDEX idx_config_snapshots_user ON agent_config_snapshots(user_id, created_at DESC);
CREATE INDEX idx_config_snapshots_pinned ON agent_config_snapshots(user_id, is_pinned);
CREATE INDEX idx_snapshot_restore_log_snapshot ON snapshot_restore_log(snapshot_id, restored_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
