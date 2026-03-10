-- Sprint 44 Phase 1: Scheduled Agent Execution Engine

CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  input_message TEXT,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  max_runs INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES agent_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  output_summary TEXT
);

CREATE INDEX idx_schedules_user ON agent_schedules(user_id);
CREATE INDEX idx_schedules_agent ON agent_schedules(agent_id);
CREATE INDEX idx_schedules_next_run ON agent_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX idx_schedule_execs_schedule ON schedule_executions(schedule_id);
CREATE INDEX idx_schedule_execs_user ON schedule_executions(user_id, started_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
