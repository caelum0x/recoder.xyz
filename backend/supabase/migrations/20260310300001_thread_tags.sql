-- Sprint 44 Phase 2: Thread Tags & Organization

CREATE TABLE IF NOT EXISTS thread_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS thread_tag_assignments (
  thread_id TEXT NOT NULL,
  tag_id UUID NOT NULL REFERENCES thread_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (thread_id, tag_id)
);

CREATE INDEX idx_thread_tags_user ON thread_tags(user_id);
CREATE INDEX idx_tag_assignments_thread ON thread_tag_assignments(thread_id);
CREATE INDEX idx_tag_assignments_tag ON thread_tag_assignments(tag_id);
CREATE INDEX idx_tag_assignments_user ON thread_tag_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
