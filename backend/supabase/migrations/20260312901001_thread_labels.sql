-- Drop old schema (replaced by thread_label_definitions)
DROP TABLE IF EXISTS thread_label_assignments CASCADE;
DROP TABLE IF EXISTS thread_labels CASCADE;

CREATE TABLE IF NOT EXISTS thread_label_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label_name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT,
  icon TEXT DEFAULT 'tag',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, label_name)
);

CREATE TABLE IF NOT EXISTS thread_label_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  label_id UUID NOT NULL REFERENCES thread_label_definitions(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, label_id)
);

CREATE INDEX idx_label_defs_user ON thread_label_definitions(user_id);
CREATE INDEX idx_label_assignments_thread ON thread_label_assignments(thread_id);
CREATE INDEX idx_label_assignments_label ON thread_label_assignments(label_id);
CREATE INDEX idx_label_assignments_user ON thread_label_assignments(user_id, assigned_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
