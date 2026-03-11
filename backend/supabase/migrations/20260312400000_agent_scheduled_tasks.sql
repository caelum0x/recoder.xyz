CREATE TABLE IF NOT EXISTS agent_scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  task_name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  input_payload JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 300,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_task_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES agent_scheduled_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timed_out', 'skipped')),
  output JSONB DEFAULT '{}',
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_scheduled_tasks_user ON agent_scheduled_tasks(user_id, created_at DESC);
CREATE INDEX idx_scheduled_tasks_agent ON agent_scheduled_tasks(agent_id);
CREATE INDEX idx_scheduled_tasks_next ON agent_scheduled_tasks(next_run_at) WHERE is_active = true;
CREATE INDEX idx_task_runs_task ON scheduled_task_runs(task_id, started_at DESC);
CREATE INDEX idx_task_runs_user ON scheduled_task_runs(user_id, started_at DESC);
-- Access control enforced at application layer (WHERE user_id = :user_id)
