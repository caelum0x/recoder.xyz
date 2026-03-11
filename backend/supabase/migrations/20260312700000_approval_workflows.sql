CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workflow_name TEXT NOT NULL,
  agent_id TEXT,
  trigger_conditions JSONB DEFAULT '{}',
  approvers TEXT[] DEFAULT '{}',
  approval_timeout_hours INTEGER DEFAULT 24,
  auto_reject_on_timeout BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES approval_workflows(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decision_note TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_workflows_user ON approval_workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_agent ON approval_workflows(agent_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_user ON approval_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_agent ON approval_requests(agent_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
