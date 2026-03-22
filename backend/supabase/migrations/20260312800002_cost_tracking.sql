CREATE TABLE IF NOT EXISTS cost_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  thread_id TEXT,
  model_name TEXT NOT NULL,
  provider TEXT DEFAULT 'anthropic',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  operation_type TEXT DEFAULT 'inference' CHECK (operation_type IN ('inference', 'embedding', 'fine_tuning', 'other')),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  budget_name TEXT NOT NULL,
  agent_id TEXT,
  period TEXT DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly')),
  budget_usd NUMERIC(10,2) NOT NULL,
  alert_threshold_pct INTEGER DEFAULT 80,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, budget_name)
);

CREATE INDEX idx_cost_records_user ON cost_records(user_id, recorded_at DESC);
CREATE INDEX idx_cost_records_agent ON cost_records(agent_id, recorded_at DESC);
CREATE INDEX idx_cost_records_model ON cost_records(model_name, recorded_at DESC);
CREATE INDEX idx_cost_budgets_user ON cost_budgets(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
