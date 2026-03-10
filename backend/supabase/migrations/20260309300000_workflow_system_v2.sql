-- 20260309300000_workflow_system_v2.sql
-- Workflow system v2 — restored and refined

-- Enums (safe creation with exception handling)
DO $$ BEGIN
  CREATE TYPE workflow_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wf_execution_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wf_node_type AS ENUM ('agent', 'tool', 'condition', 'loop', 'parallel', 'delay', 'approval', 'input', 'output');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status workflow_status DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  definition JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, agent_id)
);

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_type wf_node_type NOT NULL,
  label VARCHAR(255) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  condition JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status wf_execution_status DEFAULT 'pending',
  trigger_type VARCHAR(50),
  trigger_data JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds FLOAT,
  total_cost DECIMAL(10,4) DEFAULT 0.0,
  total_tokens INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_node_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  status wf_execution_status DEFAULT 'pending',
  input_data JSONB,
  output_data JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  cost DECIMAL(10,4) DEFAULT 0.0,
  tokens_used INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  definition JSONB NOT NULL,
  node_types TEXT[] DEFAULT '{}',
  is_featured BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  context JSONB NOT NULL DEFAULT '{}',
  ttl_seconds INTEGER DEFAULT 86400,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  responder_id UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflows_agent ON workflows(agent_id);
CREATE INDEX IF NOT EXISTS idx_workflows_account ON workflows(account_id);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow ON workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edges_workflow ON workflow_edges(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_exec ON workflow_node_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_approval_gates_status ON approval_gates(status) WHERE status = 'pending';

-- Updated at trigger (reuse existing function if available)
DO $$ BEGIN
  CREATE OR REPLACE TRIGGER set_workflows_updated_at
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN undefined_function THEN
  -- If update_updated_at_column doesn't exist, create it
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $t$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $t$ LANGUAGE plpgsql;

  CREATE TRIGGER set_workflows_updated_at
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END $$;

-- RLS
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_node_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_gates ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to owning account
CREATE POLICY workflows_all ON workflows FOR ALL
  USING (account_id = auth.uid())
  WITH CHECK (account_id = auth.uid());

CREATE POLICY wf_nodes_all ON workflow_nodes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_nodes.workflow_id AND w.account_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_nodes.workflow_id AND w.account_id = auth.uid()
  ));

CREATE POLICY wf_edges_all ON workflow_edges FOR ALL
  USING (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_edges.workflow_id AND w.account_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_edges.workflow_id AND w.account_id = auth.uid()
  ));

CREATE POLICY wf_exec_all ON workflow_executions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_executions.workflow_id AND w.account_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_executions.workflow_id AND w.account_id = auth.uid()
  ));

CREATE POLICY wf_node_exec_all ON workflow_node_executions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM workflow_executions we
      JOIN workflows w ON w.id = we.workflow_id
    WHERE we.id = workflow_node_executions.execution_id AND w.account_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workflow_executions we
      JOIN workflows w ON w.id = we.workflow_id
    WHERE we.id = workflow_node_executions.execution_id AND w.account_id = auth.uid()
  ));

-- Templates are read-only for all authenticated users
CREATE POLICY wf_templates_select ON workflow_templates FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY approval_gates_all ON approval_gates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM workflow_executions we
      JOIN workflows w ON w.id = we.workflow_id
    WHERE we.id = approval_gates.execution_id AND w.account_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workflow_executions we
      JOIN workflows w ON w.id = we.workflow_id
    WHERE we.id = approval_gates.execution_id AND w.account_id = auth.uid()
  ));
