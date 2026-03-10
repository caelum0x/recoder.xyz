CREATE TABLE IF NOT EXISTS dashboard_widget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  widget_type TEXT NOT NULL CHECK (widget_type IN ('stats_card', 'chart', 'recent_threads', 'active_runs', 'agent_health', 'cost_summary', 'quick_actions', 'bookmarks', 'calendar', 'notes')),
  title TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1,
  height INTEGER DEFAULT 1,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_widget_configs_user ON dashboard_widget_configs(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
