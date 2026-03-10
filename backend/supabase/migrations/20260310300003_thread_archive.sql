-- Thread archive status table for bulk thread operations
CREATE TABLE IF NOT EXISTS thread_archive_status (
  thread_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_archive_user ON thread_archive_status(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
