-- Sprint 57, Phase 3: Usage Anomaly Detection
-- Tracks detected anomalies in agent usage patterns for proactive monitoring.

CREATE TABLE IF NOT EXISTS usage_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('cost_spike', 'run_surge', 'error_spike', 'latency_spike', 'token_surge', 'unusual_hours')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  agent_id TEXT,
  description TEXT NOT NULL,
  current_value NUMERIC(12,4),
  baseline_value NUMERIC(12,4),
  deviation_percent NUMERIC(8,2),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_anomalies_user ON usage_anomalies(user_id, detected_at DESC);
CREATE INDEX idx_anomalies_status ON usage_anomalies(status) WHERE status = 'open';
CREATE INDEX idx_anomalies_agent ON usage_anomalies(agent_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
