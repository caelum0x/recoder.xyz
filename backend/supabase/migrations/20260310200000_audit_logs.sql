-- Sprint 43 Phase 1: Comprehensive Audit Logging
-- Stores audit trail of user actions across the platform

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('agent', 'thread', 'workflow', 'pipeline', 'team', 'secret', 'webhook', 'knowledge_entry', 'api_key', 'settings', 'billing')),
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_ts ON audit_logs(created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
