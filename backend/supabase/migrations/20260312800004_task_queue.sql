CREATE TABLE IF NOT EXISTS queued_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  task_type TEXT NOT NULL,
  task_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'retrying')),
  max_retries INTEGER DEFAULT 3,
  retry_count INTEGER DEFAULT 0,
  retry_delay_seconds INTEGER DEFAULT 60,
  result JSONB DEFAULT '{}',
  error_message TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_queue_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  pending_count INTEGER DEFAULT 0,
  running_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  avg_wait_seconds NUMERIC(10,2) DEFAULT 0,
  avg_run_seconds NUMERIC(10,2) DEFAULT 0
);

CREATE INDEX idx_queued_tasks_user ON queued_tasks(user_id, created_at DESC);
CREATE INDEX idx_queued_tasks_status ON queued_tasks(status, scheduled_at ASC);
CREATE INDEX idx_queued_tasks_agent ON queued_tasks(agent_id, created_at DESC);
CREATE INDEX idx_task_queue_stats_user ON task_queue_stats(user_id, snapshot_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
