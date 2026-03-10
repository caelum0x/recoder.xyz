-- Run monitor snapshots for real-time agent run monitoring
-- Access control enforced at application layer (WHERE user_id = :user_id)

CREATE TABLE IF NOT EXISTS run_monitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  step_count INTEGER DEFAULT 0,
  current_tool TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_so_far NUMERIC(10,6) DEFAULT 0,
  elapsed_ms INTEGER DEFAULT 0,
  error TEXT,
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_run_monitor_user ON run_monitor_snapshots(user_id, captured_at DESC);
CREATE INDEX idx_run_monitor_run ON run_monitor_snapshots(run_id, captured_at DESC);
CREATE INDEX idx_run_monitor_agent ON run_monitor_snapshots(agent_id);
