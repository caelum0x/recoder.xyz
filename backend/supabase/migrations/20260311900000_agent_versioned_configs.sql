CREATE TABLE IF NOT EXISTS agent_config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  label TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  change_summary TEXT,
  is_active BOOLEAN DEFAULT false,
  created_by TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, version_number)
);

CREATE TABLE IF NOT EXISTS config_diff_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_a_id UUID NOT NULL REFERENCES agent_config_snapshots(id) ON DELETE CASCADE,
  snapshot_b_id UUID NOT NULL REFERENCES agent_config_snapshots(id) ON DELETE CASCADE,
  diff JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (snapshot_a_id, snapshot_b_id)
);

CREATE INDEX idx_config_snapshots_agent ON agent_config_snapshots(agent_id, version_number DESC);
CREATE INDEX idx_config_snapshots_user ON agent_config_snapshots(user_id, created_at DESC);
CREATE INDEX idx_config_snapshots_active ON agent_config_snapshots(agent_id, is_active) WHERE is_active = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
