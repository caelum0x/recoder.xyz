CREATE TABLE IF NOT EXISTS health_check_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  check_name TEXT NOT NULL,
  check_type TEXT DEFAULT 'ping' CHECK (check_type IN ('ping', 'api_call', 'response_quality', 'latency')),
  check_config JSONB DEFAULT '{}',
  interval_minutes INTEGER DEFAULT 60,
  timeout_seconds INTEGER DEFAULT 30,
  failure_threshold INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, check_name)
);

CREATE TABLE IF NOT EXISTS health_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES health_check_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'timeout')),
  response_time_ms INTEGER,
  error_message TEXT,
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_uptime_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  uptime_pct NUMERIC(5,2) DEFAULT 100,
  total_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  avg_response_ms INTEGER DEFAULT 0,
  last_status TEXT DEFAULT 'healthy',
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_health_configs_agent ON health_check_configs(agent_id);
CREATE INDEX idx_health_configs_user ON health_check_configs(user_id);
CREATE INDEX idx_health_results_config ON health_check_results(config_id, checked_at DESC);
CREATE INDEX idx_health_results_agent ON health_check_results(agent_id, checked_at DESC);
CREATE INDEX idx_uptime_user ON agent_uptime_summary(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
