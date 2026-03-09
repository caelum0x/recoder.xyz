CREATE TABLE IF NOT EXISTS budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  threshold_amount DECIMAL(10,2) NOT NULL,
  alert_type VARCHAR(20) DEFAULT 'warning_80pct',
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_user ON budget_alerts(user_id);

ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_alerts_all ON budget_alerts FOR ALL USING (true);
