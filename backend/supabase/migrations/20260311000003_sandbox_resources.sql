-- Sprint 51 Phase 4: Sandbox Resource Snapshots
-- Tracks resource utilization for sandbox environments

CREATE TABLE IF NOT EXISTS sandbox_resource_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sandbox_id TEXT NOT NULL,
  agent_id TEXT,
  cpu_percent NUMERIC(5,2),
  memory_mb INTEGER,
  disk_mb INTEGER,
  network_in_kb INTEGER,
  network_out_kb INTEGER,
  process_count INTEGER,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'idle', 'stopped', 'error')),
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sandbox_resources_user ON sandbox_resource_snapshots(user_id, captured_at DESC);
CREATE INDEX idx_sandbox_resources_sandbox ON sandbox_resource_snapshots(sandbox_id, captured_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
