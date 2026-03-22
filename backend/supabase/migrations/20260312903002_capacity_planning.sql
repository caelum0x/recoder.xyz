CREATE TABLE IF NOT EXISTS capacity_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  current_value NUMERIC(12,4) NOT NULL,
  max_capacity NUMERIC(12,4),
  unit TEXT DEFAULT 'count',
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capacity_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_name TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  metric_projections JSONB DEFAULT '[]',
  growth_assumptions JSONB DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, plan_name)
);

CREATE TABLE IF NOT EXISTS capacity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  threshold_pct INTEGER DEFAULT 80,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, metric_name)
);

CREATE INDEX idx_capacity_metrics_user ON capacity_metrics(user_id, recorded_at DESC);
CREATE INDEX idx_capacity_metrics_name ON capacity_metrics(metric_name, recorded_at DESC);
CREATE INDEX idx_capacity_plans_user ON capacity_plans(user_id, created_at DESC);
CREATE INDEX idx_capacity_alerts_user ON capacity_alerts(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
