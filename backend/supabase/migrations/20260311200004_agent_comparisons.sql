CREATE TABLE IF NOT EXISTS agent_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT,
  agent_ids TEXT[] NOT NULL,
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_comparison_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES agent_comparisons(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(12,4),
  period TEXT DEFAULT '30d',
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comparisons_user ON agent_comparisons(user_id, created_at DESC);
CREATE INDEX idx_comparison_snapshots_comparison ON agent_comparison_snapshots(comparison_id);
CREATE INDEX idx_comparison_snapshots_agent ON agent_comparison_snapshots(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
