CREATE TABLE IF NOT EXISTS agent_run_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT,
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input_message TEXT,
  config JSONB DEFAULT '{}',
  queued_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  position INTEGER
);

CREATE TABLE IF NOT EXISTS run_queue_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  max_concurrent_runs INTEGER DEFAULT 3,
  default_priority INTEGER DEFAULT 5,
  auto_retry_failed BOOLEAN DEFAULT false,
  max_retries INTEGER DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_run_queue_user ON agent_run_queue(user_id, queued_at DESC);
CREATE INDEX idx_run_queue_agent ON agent_run_queue(agent_id);
CREATE INDEX idx_run_queue_status ON agent_run_queue(status) WHERE status IN ('queued', 'running');
CREATE INDEX idx_run_queue_priority ON agent_run_queue(priority DESC, queued_at ASC) WHERE status = 'queued';

-- Access control enforced at application layer (WHERE user_id = :user_id)
