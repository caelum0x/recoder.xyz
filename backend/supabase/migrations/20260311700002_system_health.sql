-- Sprint 58 Phase 3: System Health Dashboard
-- Tracks system health checks and history for monitoring dashboard

CREATE TABLE IF NOT EXISTS system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_name TEXT NOT NULL,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')),
  response_time_ms INTEGER,
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_health_checks_user ON system_health_checks(user_id, service_name);
CREATE INDEX idx_health_history_user ON system_health_history(user_id, checked_at DESC);
CREATE INDEX idx_health_history_service ON system_health_history(service_name, checked_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
