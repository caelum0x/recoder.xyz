CREATE TABLE IF NOT EXISTS thread_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  checkpoint_name TEXT,
  message_index INTEGER NOT NULL,
  messages_snapshot JSONB NOT NULL DEFAULT '[]',
  agent_config_snapshot JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS thread_replays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_thread_id TEXT NOT NULL,
  checkpoint_id UUID REFERENCES thread_checkpoints(id) ON DELETE SET NULL,
  replay_thread_id TEXT,
  agent_id TEXT,
  agent_config_override JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  comparison_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_thread_checkpoints_thread ON thread_checkpoints(thread_id, created_at DESC);
CREATE INDEX idx_thread_checkpoints_user ON thread_checkpoints(user_id, created_at DESC);
CREATE INDEX idx_thread_replays_source ON thread_replays(source_thread_id);
CREATE INDEX idx_thread_replays_user ON thread_replays(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
