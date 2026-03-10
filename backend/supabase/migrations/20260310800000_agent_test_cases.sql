-- Sprint 49 Phase 1: Agent Testing Suite
-- Tables for test cases, test runs, and test results

CREATE TABLE IF NOT EXISTS agent_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input_message TEXT NOT NULL,
  expected_behavior TEXT,
  expected_contains TEXT[] DEFAULT '{}',
  expected_not_contains TEXT[] DEFAULT '{}',
  max_latency_ms INTEGER,
  max_cost NUMERIC(10,6),
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  suite_name TEXT DEFAULT 'default',
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total_cases INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID NOT NULL REFERENCES agent_test_runs(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES agent_test_cases(id) ON DELETE CASCADE,
  passed BOOLEAN,
  actual_output TEXT,
  latency_ms INTEGER,
  cost NUMERIC(10,6),
  tokens_used INTEGER,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_test_cases_agent ON agent_test_cases(agent_id);
CREATE INDEX idx_test_cases_user ON agent_test_cases(user_id);
CREATE INDEX idx_test_runs_agent ON agent_test_runs(agent_id, started_at DESC);
CREATE INDEX idx_test_runs_user ON agent_test_runs(user_id);
CREATE INDEX idx_test_results_run ON agent_test_results(test_run_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
