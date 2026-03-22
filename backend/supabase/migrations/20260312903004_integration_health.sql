CREATE TABLE IF NOT EXISTS integration_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint_name TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  integration_type TEXT DEFAULT 'webhook' CHECK (integration_type IN ('webhook', 'api', 'oauth', 'database', 'stream')),
  check_interval_minutes INTEGER DEFAULT 60,
  timeout_seconds INTEGER DEFAULT 10,
  expected_status_code INTEGER DEFAULT 200,
  auth_header TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, endpoint_name)
);

CREATE TABLE IF NOT EXISTS integration_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES integration_endpoints(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'down', 'timeout')),
  response_time_ms INTEGER,
  status_code INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_uptime (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint_id UUID NOT NULL REFERENCES integration_endpoints(id) ON DELETE CASCADE,
  uptime_pct NUMERIC(5,2) DEFAULT 100,
  total_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  avg_response_ms INTEGER DEFAULT 0,
  last_status TEXT DEFAULT 'healthy',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, endpoint_id)
);

CREATE INDEX idx_integration_endpoints_user ON integration_endpoints(user_id);
CREATE INDEX idx_integration_health_endpoint ON integration_health_checks(endpoint_id, checked_at DESC);
CREATE INDEX idx_integration_uptime_user ON integration_uptime(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
