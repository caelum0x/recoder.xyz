CREATE TABLE IF NOT EXISTS benchmark_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  suite_name TEXT NOT NULL,
  description TEXT,
  test_cases JSONB NOT NULL DEFAULT '[]',
  scoring_method TEXT DEFAULT 'average' CHECK (scoring_method IN ('average', 'weighted', 'min', 'max')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, suite_name)
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  overall_score NUMERIC(5,2),
  test_results JSONB DEFAULT '[]',
  total_tests INTEGER DEFAULT 0,
  passed_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_benchmark_suites_user ON benchmark_suites(user_id, created_at DESC);
CREATE INDEX idx_benchmark_runs_suite ON benchmark_runs(suite_id, started_at DESC);
CREATE INDEX idx_benchmark_runs_agent ON benchmark_runs(agent_id, started_at DESC);
CREATE INDEX idx_benchmark_runs_user ON benchmark_runs(user_id, started_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
