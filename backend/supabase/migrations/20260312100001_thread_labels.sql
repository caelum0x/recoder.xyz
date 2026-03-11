-- Sprint 62 Phase 2: Thread Labels & Organization
-- Hierarchical labels for organizing threads with parent-child nesting and color coding.

CREATE TABLE IF NOT EXISTS thread_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  parent_id UUID REFERENCES thread_labels(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS thread_label_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,
  label_id UUID NOT NULL REFERENCES thread_labels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, label_id)
);

CREATE INDEX idx_thread_labels_user ON thread_labels(user_id, sort_order);
CREATE INDEX idx_thread_labels_parent ON thread_labels(parent_id);
CREATE INDEX idx_label_assignments_thread ON thread_label_assignments(thread_id);
CREATE INDEX idx_label_assignments_label ON thread_label_assignments(label_id);
CREATE INDEX idx_label_assignments_user ON thread_label_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
