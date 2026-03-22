CREATE TABLE IF NOT EXISTS thread_analytics_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  total_messages INTEGER DEFAULT 0,
  user_messages INTEGER DEFAULT 0,
  agent_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  session_duration_ms INTEGER DEFAULT 0,
  user_satisfaction_score NUMERIC(3,2),
  completion_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS thread_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('message_sent', 'message_received', 'file_uploaded', 'tool_used', 'session_start', 'session_end', 'error', 'rating')),
  event_data JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_analytics_v2_user ON thread_analytics_v2(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_analytics_v2_agent ON thread_analytics_v2(agent_id);
CREATE INDEX IF NOT EXISTS idx_thread_events_thread ON thread_events(thread_id, occurred_at ASC);
CREATE INDEX IF NOT EXISTS idx_thread_events_user ON thread_events(user_id, occurred_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
