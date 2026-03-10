-- Sprint 48 Phase 4: Cost Threshold Alerts
-- Rules define when to fire alerts; history tracks triggered alerts.
-- NO RLS — auth is enforced at the API layer via JWT.

-- Cost alert rules: user-defined thresholds for spending alerts
CREATE TABLE IF NOT EXISTS cost_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    alert_type TEXT NOT NULL DEFAULT 'monthly_spend'
        CHECK (alert_type IN ('monthly_spend', 'daily_spend', 'per_agent', 'per_model')),
    threshold_amount NUMERIC(12, 4) NOT NULL CHECK (threshold_amount > 0),
    agent_id TEXT,           -- optional: restrict to a specific agent
    model_filter TEXT,       -- optional: restrict to a specific model
    notify_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],
    active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_alert_rules_account ON cost_alert_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_cost_alert_rules_active ON cost_alert_rules(account_id, active);

-- Cost alert history: log of when rules were triggered
CREATE TABLE IF NOT EXISTS cost_alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES cost_alert_rules(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    threshold_amount NUMERIC(12, 4) NOT NULL,
    actual_amount NUMERIC(12, 4) NOT NULL,
    percentage_of_threshold NUMERIC(8, 2) NOT NULL,
    agent_id TEXT,
    model_filter TEXT,
    message TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_alert_history_account ON cost_alert_history(account_id);
CREATE INDEX IF NOT EXISTS idx_cost_alert_history_rule ON cost_alert_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_cost_alert_history_created ON cost_alert_history(created_at DESC);
