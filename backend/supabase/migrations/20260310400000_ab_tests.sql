-- Sprint 45: Agent A/B Testing Framework
-- Tables: agent_ab_tests, ab_test_trials

CREATE TABLE IF NOT EXISTS agent_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  agent_a_id TEXT NOT NULL,
  agent_b_id TEXT NOT NULL,
  metric TEXT DEFAULT 'success_rate' CHECK (metric IN ('success_rate', 'latency', 'cost', 'user_rating')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'cancelled')),
  total_trials INTEGER DEFAULT 20,
  completed_trials INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ab_test_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES agent_ab_tests(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  input_message TEXT,
  success BOOLEAN,
  latency_ms INTEGER,
  cost NUMERIC(10,6),
  tokens_used INTEGER,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ab_tests_user ON agent_ab_tests(user_id);
CREATE INDEX idx_ab_trials_test ON ab_test_trials(test_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
