CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('agent_summary', 'cost_breakdown', 'run_analytics', 'health_digest', 'usage_overview', 'custom')),
  agent_ids TEXT[] DEFAULT '{}',
  schedule_cron TEXT NOT NULL,
  schedule_description TEXT,
  output_format TEXT DEFAULT 'json' CHECK (output_format IN ('json', 'csv', 'markdown')),
  last_generated_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'partial')),
  data JSONB NOT NULL DEFAULT '{}',
  row_count INTEGER DEFAULT 0,
  generation_time_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scheduled_reports_user ON scheduled_reports(user_id);
CREATE INDEX idx_scheduled_reports_active ON scheduled_reports(is_active, next_run_at) WHERE is_active = true;
CREATE INDEX idx_report_history_report ON report_history(report_id, created_at DESC);
CREATE INDEX idx_report_history_user ON report_history(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
