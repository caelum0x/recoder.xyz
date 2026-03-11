CREATE TABLE IF NOT EXISTS change_impact_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('config_update', 'tool_change', 'prompt_change', 'model_change', 'workflow_change', 'dependency_change')),
  change_description TEXT NOT NULL,
  proposed_changes JSONB DEFAULT '{}',
  impact_assessment JSONB DEFAULT '{}',
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  affected_items JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_impact_user ON change_impact_analyses(user_id, created_at DESC);
CREATE INDEX idx_impact_agent ON change_impact_analyses(agent_id);
CREATE INDEX idx_impact_status ON change_impact_analyses(status);
-- Access control enforced at application layer (WHERE user_id = :user_id)
