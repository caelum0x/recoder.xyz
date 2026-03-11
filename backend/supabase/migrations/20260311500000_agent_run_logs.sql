CREATE TABLE IF NOT EXISTS agent_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  log_level TEXT DEFAULT 'info' CHECK (log_level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  step_index INTEGER,
  tool_name TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_run_logs_run ON agent_run_logs(run_id, created_at);
CREATE INDEX idx_run_logs_user ON agent_run_logs(user_id, created_at DESC);
CREATE INDEX idx_run_logs_agent ON agent_run_logs(agent_id, created_at DESC);
CREATE INDEX idx_run_logs_level ON agent_run_logs(log_level) WHERE log_level IN ('error', 'fatal');

-- Access control enforced at application layer (WHERE user_id = :user_id)
