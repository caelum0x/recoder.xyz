CREATE TABLE IF NOT EXISTS bulk_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('agent_update', 'agent_delete', 'agent_export', 'thread_delete', 'thread_archive', 'thread_export', 'tag_assign', 'tag_remove')),
  target_ids TEXT[] NOT NULL DEFAULT '{}',
  target_count INTEGER DEFAULT 0,
  params JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
  processed_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bulk_ops_user ON bulk_operations(user_id, created_at DESC);
CREATE INDEX idx_bulk_ops_status ON bulk_operations(status) WHERE status IN ('pending', 'processing');

-- Access control enforced at application layer (WHERE user_id = :user_id)
