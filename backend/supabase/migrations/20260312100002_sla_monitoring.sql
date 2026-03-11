CREATE TABLE IF NOT EXISTS sla_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  agent_id TEXT,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('response_time', 'uptime', 'error_rate', 'throughput', 'resolution_time')),
  target_value NUMERIC(10,4) NOT NULL,
  target_unit TEXT DEFAULT 'ms' CHECK (target_unit IN ('ms', 'percent', 'count', 'seconds', 'minutes')),
  evaluation_window TEXT DEFAULT 'daily' CHECK (evaluation_window IN ('hourly', 'daily', 'weekly', 'monthly')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sla_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_id UUID NOT NULL REFERENCES sla_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  measured_value NUMERIC(10,4) NOT NULL,
  is_breach BOOLEAN DEFAULT false,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  measured_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sla_defs_user ON sla_definitions(user_id);
CREATE INDEX idx_sla_defs_agent ON sla_definitions(agent_id);
CREATE INDEX idx_sla_measurements_sla ON sla_measurements(sla_id, measured_at DESC);
CREATE INDEX idx_sla_measurements_breach ON sla_measurements(is_breach) WHERE is_breach = true;
-- Access control enforced at application layer (WHERE user_id = :user_id)
