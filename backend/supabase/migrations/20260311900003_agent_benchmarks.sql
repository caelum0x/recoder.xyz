CREATE TABLE IF NOT EXISTS agent_benchmarks_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  benchmark_name TEXT NOT NULL,
  benchmark_type TEXT DEFAULT 'latency' CHECK (benchmark_type IN ('latency', 'throughput', 'accuracy', 'cost', 'custom')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES agent_benchmarks_v2(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  score NUMERIC(12,4) NOT NULL,
  metrics JSONB DEFAULT '{}',
  duration_ms INTEGER,
  status TEXT DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  run_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_benchmarks_v2_agent ON agent_benchmarks_v2(agent_id);
CREATE INDEX idx_benchmarks_v2_user ON agent_benchmarks_v2(user_id);
CREATE INDEX idx_benchmark_results_benchmark ON benchmark_results(benchmark_id, run_at DESC);
CREATE INDEX idx_benchmark_results_agent ON benchmark_results(agent_id, run_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
