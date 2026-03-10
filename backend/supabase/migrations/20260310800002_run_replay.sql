-- Sprint 49, Phase 3: Run Replay System
-- Stores step-by-step replay snapshots of agent runs for debugging and playback.

CREATE TABLE IF NOT EXISTS run_replay_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('user_input', 'llm_call', 'tool_call', 'tool_result', 'assistant_output', 'error')),
  content JSONB NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT now(),
  UNIQUE (run_id, step_index)
);

CREATE INDEX idx_replay_run ON run_replay_snapshots(run_id, step_index);
CREATE INDEX idx_replay_user ON run_replay_snapshots(user_id);
CREATE INDEX idx_replay_agent ON run_replay_snapshots(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
