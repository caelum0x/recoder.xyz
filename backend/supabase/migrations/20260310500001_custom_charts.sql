-- Custom Dashboard Charts
-- Allows users to create personalized chart widgets for their dashboard

CREATE TABLE IF NOT EXISTS custom_dashboard_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  chart_type TEXT NOT NULL CHECK (chart_type IN ('line', 'bar', 'area', 'pie', 'number')),
  data_source TEXT NOT NULL CHECK (data_source IN ('agent_runs', 'costs', 'tokens', 'errors', 'api_usage', 'thread_count')),
  agent_id TEXT,
  time_range TEXT DEFAULT '30d' CHECK (time_range IN ('7d', '14d', '30d', '90d')),
  display_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_custom_charts_user ON custom_dashboard_charts(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
