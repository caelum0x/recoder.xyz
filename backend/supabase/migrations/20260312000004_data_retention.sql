CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('threads', 'run_logs', 'audit_logs', 'exports', 'analytics', 'notifications', 'webhook_deliveries')),
  retention_days INTEGER NOT NULL DEFAULT 90,
  is_active BOOLEAN DEFAULT true,
  last_cleanup_at TIMESTAMPTZ,
  items_cleaned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, resource_type)
);

CREATE TABLE IF NOT EXISTS retention_cleanup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES data_retention_policies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  resource_type TEXT NOT NULL,
  items_deleted INTEGER DEFAULT 0,
  oldest_item_date TIMESTAMPTZ,
  cleanup_duration_ms INTEGER,
  cleaned_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_retention_policies_user ON data_retention_policies(user_id);
CREATE INDEX idx_retention_cleanup_policy ON retention_cleanup_log(policy_id, cleaned_at DESC);
CREATE INDEX idx_retention_cleanup_user ON retention_cleanup_log(user_id, cleaned_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
