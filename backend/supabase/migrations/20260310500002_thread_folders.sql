-- Thread Folders
-- Allows users to organize threads into named folders with optional nesting

CREATE TABLE IF NOT EXISTS thread_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  icon TEXT DEFAULT 'folder',
  parent_id UUID REFERENCES thread_folders(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name, parent_id)
);

CREATE TABLE IF NOT EXISTS thread_folder_assignments (
  thread_id TEXT NOT NULL,
  folder_id UUID NOT NULL REFERENCES thread_folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (thread_id, folder_id)
);

CREATE INDEX idx_thread_folders_user ON thread_folders(user_id);
CREATE INDEX idx_thread_folder_assigns_folder ON thread_folder_assignments(folder_id);
CREATE INDEX idx_thread_folder_assigns_user ON thread_folder_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
