CREATE TABLE IF NOT EXISTS ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  experiment_name TEXT NOT NULL,
  description TEXT,
  agent_id TEXT NOT NULL,
  variant_a_config JSONB NOT NULL DEFAULT '{}',
  variant_b_config JSONB NOT NULL DEFAULT '{}',
  traffic_split_pct INTEGER DEFAULT 50 CHECK (traffic_split_pct BETWEEN 0 AND 100),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  winner TEXT CHECK (winner IN ('a', 'b', 'tie')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, experiment_name)
);

CREATE TABLE IF NOT EXISTS ab_experiment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('a', 'b')),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(12,4) NOT NULL,
  sample_size INTEGER DEFAULT 1,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ab_experiments_user ON ab_experiments(user_id, created_at DESC);
CREATE INDEX idx_ab_experiments_agent ON ab_experiments(agent_id);
CREATE INDEX idx_ab_results_experiment ON ab_experiment_results(experiment_id, recorded_at DESC);
CREATE INDEX idx_ab_results_variant ON ab_experiment_results(experiment_id, variant);

-- Access control enforced at application layer (WHERE user_id = :user_id)
