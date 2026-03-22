CREATE TABLE IF NOT EXISTS agent_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  comparison_name TEXT NOT NULL,
  agent_ids TEXT[] NOT NULL,
  comparison_metrics TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, comparison_name)
);

CREATE TABLE IF NOT EXISTS comparison_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES agent_comparisons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(12,4) NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_comparisons_user ON agent_comparisons(user_id, created_at DESC);
CREATE INDEX idx_comparison_snapshots_comparison ON comparison_metric_snapshots(comparison_id, agent_id);
CREATE INDEX idx_comparison_snapshots_agent ON comparison_metric_snapshots(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
