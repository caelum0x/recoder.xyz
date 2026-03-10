CREATE TABLE IF NOT EXISTS agent_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS agent_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES agent_roles(id) ON DELETE CASCADE,
  assigned_by UUID,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (agent_id, role_id)
);

CREATE TABLE IF NOT EXISTS agent_permission_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  permission_required TEXT,
  was_allowed BOOLEAN NOT NULL,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_roles_user ON agent_roles(user_id);
CREATE INDEX idx_role_assignments_agent ON agent_role_assignments(agent_id);
CREATE INDEX idx_role_assignments_user ON agent_role_assignments(user_id);
CREATE INDEX idx_permission_audit_agent ON agent_permission_audit(agent_id, created_at DESC);
CREATE INDEX idx_permission_audit_user ON agent_permission_audit(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
