CREATE TABLE IF NOT EXISTS aggregated_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  log_level TEXT DEFAULT 'info' CHECK (log_level IN ('debug', 'info', 'warning', 'error', 'critical')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  trace_id TEXT,
  span_id TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS log_saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  filter_name TEXT NOT NULL,
  filter_config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_logs_user ON aggregated_logs(user_id, created_at DESC);
CREATE INDEX idx_logs_level ON aggregated_logs(log_level, created_at DESC);
CREATE INDEX idx_logs_agent ON aggregated_logs(agent_id, created_at DESC);
CREATE INDEX idx_logs_trace ON aggregated_logs(trace_id);
CREATE INDEX idx_logs_tags ON aggregated_logs USING GIN (tags);
CREATE INDEX idx_log_filters_user ON log_saved_filters(user_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
