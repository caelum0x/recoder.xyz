-- Sprint 65 Phase 3: Usage Forecasting
-- Tables for usage forecasts and snapshots

CREATE TABLE IF NOT EXISTS usage_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('tokens', 'api_calls', 'cost', 'storage', 'compute_minutes', 'thread_count')),
  forecast_period TEXT DEFAULT 'monthly' CHECK (forecast_period IN ('daily', 'weekly', 'monthly')),
  historical_data JSONB DEFAULT '[]',
  forecast_data JSONB DEFAULT '[]',
  trend TEXT DEFAULT 'stable' CHECK (trend IN ('increasing', 'decreasing', 'stable', 'volatile')),
  confidence_score NUMERIC(3,2) DEFAULT 0.0,
  alert_threshold NUMERIC(12,2),
  projected_value NUMERIC(12,2),
  generated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_type TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_forecasts_user ON usage_forecasts(user_id, metric_type);
CREATE INDEX idx_forecasts_period ON usage_forecasts(forecast_period, generated_at DESC);
CREATE INDEX idx_snapshots_user ON usage_snapshots(user_id, metric_type, recorded_at DESC);
CREATE INDEX idx_snapshots_period ON usage_snapshots(period_start, period_end);
