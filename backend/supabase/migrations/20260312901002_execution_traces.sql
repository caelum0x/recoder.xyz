CREATE TABLE IF NOT EXISTS execution_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  trace_name TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total_steps INTEGER DEFAULT 0,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trace_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL REFERENCES execution_traces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  step_index INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT DEFAULT 'action' CHECK (step_type IN ('action', 'decision', 'tool_call', 'llm_call', 'data_fetch', 'output')),
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_exec_traces_user ON execution_traces(user_id, started_at DESC);
CREATE INDEX idx_exec_traces_agent ON execution_traces(agent_id, started_at DESC);
CREATE INDEX idx_trace_steps_trace ON trace_steps(trace_id, step_index ASC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
