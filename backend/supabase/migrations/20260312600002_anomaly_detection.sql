CREATE TABLE IF NOT EXISTS anomaly_detection_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_type TEXT NOT NULL,
  agent_id TEXT,
  detection_method TEXT DEFAULT 'zscore' CHECK (detection_method IN ('zscore', 'iqr', 'threshold', 'percentage_change')),
  sensitivity NUMERIC(3,2) DEFAULT 2.0,
  window_hours INTEGER DEFAULT 24,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, metric_type, agent_id)
);

CREATE TABLE IF NOT EXISTS detected_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  config_id UUID REFERENCES anomaly_detection_configs(id) ON DELETE SET NULL,
  agent_id TEXT,
  metric_type TEXT NOT NULL,
  observed_value NUMERIC(12,4) NOT NULL,
  expected_value NUMERIC(12,4),
  deviation_score NUMERIC(8,4),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
  description TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_configs_user ON anomaly_detection_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_user ON detected_anomalies(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON detected_anomalies(status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_agent ON detected_anomalies(agent_id, detected_at DESC);
-- Access control enforced at application layer (WHERE user_id = :user_id)
