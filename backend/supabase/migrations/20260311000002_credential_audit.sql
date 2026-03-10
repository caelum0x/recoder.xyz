-- Sprint 51 Phase 3: Credential Vault Audit Log
-- Tracks all access to credential vault for security auditing

CREATE TABLE IF NOT EXISTS credential_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_key TEXT NOT NULL,
  agent_id TEXT,
  access_type TEXT NOT NULL CHECK (access_type IN ('read', 'create', 'update', 'delete', 'use_in_run')),
  ip_address TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cred_audit_user ON credential_access_log(user_id, created_at DESC);
CREATE INDEX idx_cred_audit_key ON credential_access_log(credential_key);
CREATE INDEX idx_cred_audit_agent ON credential_access_log(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
