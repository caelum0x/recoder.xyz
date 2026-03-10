CREATE TABLE IF NOT EXISTS message_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  message_preview TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index)
);

CREATE INDEX idx_bookmarks_user ON message_bookmarks(user_id);
CREATE INDEX idx_bookmarks_thread ON message_bookmarks(user_id, thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
