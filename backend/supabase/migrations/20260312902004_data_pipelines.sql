CREATE TABLE IF NOT EXISTS data_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pipeline_name TEXT NOT NULL,
  description TEXT,
  source_type TEXT DEFAULT 'api' CHECK (source_type IN ('api', 'database', 'file', 'webhook', 'stream')),
  destination_type TEXT DEFAULT 'database' CHECK (destination_type IN ('database', 'file', 'api', 'webhook')),
  transform_steps JSONB DEFAULT '[]',
  schedule_cron TEXT,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, pipeline_name)
);

CREATE TABLE IF NOT EXISTS pipeline_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES data_pipelines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  execution_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX idx_data_pipelines_user ON data_pipelines(user_id, created_at DESC);
CREATE INDEX idx_pipeline_executions_pipeline ON pipeline_executions(pipeline_id, started_at DESC);
CREATE INDEX idx_pipeline_executions_user ON pipeline_executions(user_id, started_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
