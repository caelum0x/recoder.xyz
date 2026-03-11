CREATE TABLE IF NOT EXISTS deployment_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pipeline_name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  stages JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  auto_promote BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES deployment_pipelines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  current_stage_index INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
  stage_results JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pipeline_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES deployment_pipelines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  stage_index INTEGER NOT NULL,
  gate_type TEXT DEFAULT 'manual' CHECK (gate_type IN ('manual', 'auto', 'approval')),
  conditions JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'skipped')),
  evaluated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pipelines_user ON deployment_pipelines(user_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_agent ON deployment_pipelines(agent_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user ON pipeline_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_gates_pipeline ON pipeline_gates(pipeline_id, stage_index);
-- Access control enforced at application layer (WHERE user_id = :user_id)
