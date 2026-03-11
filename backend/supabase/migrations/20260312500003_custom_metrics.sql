CREATE TABLE IF NOT EXISTS custom_metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'count',
  aggregation TEXT DEFAULT 'sum' CHECK (aggregation IN ('sum', 'avg', 'min', 'max', 'count', 'last')),
  chart_type TEXT DEFAULT 'line' CHECK (chart_type IN ('line', 'bar', 'area', 'gauge', 'number')),
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, metric_name)
);

CREATE TABLE IF NOT EXISTS custom_metric_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID NOT NULL REFERENCES custom_metric_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  value NUMERIC(12,4) NOT NULL,
  dimensions JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metric_defs_user ON custom_metric_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_metric_values_metric ON custom_metric_values(metric_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_metric_values_user ON custom_metric_values(user_id, recorded_at DESC);
-- Access control enforced at application layer (WHERE user_id = :user_id)
