CREATE TABLE IF NOT EXISTS thread_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_thread_id TEXT NOT NULL,
  branch_thread_id TEXT NOT NULL,
  branch_point_index INTEGER NOT NULL,
  branch_name TEXT,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'merged', 'archived', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_branches_source ON thread_branches(source_thread_id);
CREATE INDEX idx_branches_branch ON thread_branches(branch_thread_id);
CREATE INDEX idx_branches_user ON thread_branches(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
