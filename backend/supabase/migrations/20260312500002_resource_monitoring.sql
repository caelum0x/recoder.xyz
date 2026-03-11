CREATE TABLE IF NOT EXISTS resource_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  cpu_percent NUMERIC(5,2) DEFAULT 0,
  memory_mb NUMERIC(10,2) DEFAULT 0,
  memory_percent NUMERIC(5,2) DEFAULT 0,
  disk_mb NUMERIC(10,2) DEFAULT 0,
  network_in_kb NUMERIC(12,2) DEFAULT 0,
  network_out_kb NUMERIC(12,2) DEFAULT 0,
  active_connections INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  metric TEXT NOT NULL CHECK (metric IN ('cpu_percent', 'memory_percent', 'disk_mb', 'active_connections')),
  threshold NUMERIC(10,2) NOT NULL,
  comparison TEXT DEFAULT 'gt' CHECK (comparison IN ('gt', 'lt', 'eq')),
  is_active BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 15,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_snapshots_user ON resource_snapshots(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_agent ON resource_snapshots(agent_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_alerts_user ON resource_alert_rules(user_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
