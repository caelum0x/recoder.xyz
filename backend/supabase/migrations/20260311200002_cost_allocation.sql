CREATE TABLE IF NOT EXISTS cost_allocation_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  budget NUMERIC(10,2),
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS run_cost_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  agent_id TEXT,
  project_id UUID REFERENCES cost_allocation_projects(id) ON DELETE SET NULL,
  cost NUMERIC(10,6) NOT NULL DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  model TEXT,
  allocated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (run_id)
);

CREATE INDEX idx_cost_projects_user ON cost_allocation_projects(user_id);
CREATE INDEX idx_cost_allocations_user ON run_cost_allocations(user_id, allocated_at DESC);
CREATE INDEX idx_cost_allocations_project ON run_cost_allocations(project_id, allocated_at DESC);
CREATE INDEX idx_cost_allocations_agent ON run_cost_allocations(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
