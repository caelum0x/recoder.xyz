CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT false,
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_layout_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES dashboard_layouts(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL CHECK (widget_type IN ('agent_status', 'recent_threads', 'activity_feed', 'health_status', 'quick_actions', 'favorites', 'stats_card', 'chart', 'checklist', 'bookmarks')),
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1,
  height INTEGER DEFAULT 1,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_layouts_user ON dashboard_layouts(user_id);
CREATE INDEX idx_layouts_active ON dashboard_layouts(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_layout_widgets ON dashboard_layout_widgets(layout_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
