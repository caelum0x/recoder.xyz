CREATE TABLE IF NOT EXISTS agent_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  benchmark_name TEXT NOT NULL,
  model TEXT,
  avg_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  avg_tokens_in INTEGER,
  avg_tokens_out INTEGER,
  avg_cost NUMERIC(10,6),
  success_rate NUMERIC(5,2),
  total_runs INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_benchmarks_agent ON agent_benchmarks(agent_id, created_at DESC);
CREATE INDEX idx_benchmarks_user ON agent_benchmarks(user_id);
CREATE INDEX idx_benchmarks_model ON agent_benchmarks(model);

-- Access control enforced at application layer (WHERE user_id = :user_id)
