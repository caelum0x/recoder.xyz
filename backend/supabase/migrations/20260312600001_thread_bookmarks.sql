CREATE TABLE IF NOT EXISTS thread_message_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  bookmark_label TEXT,
  bookmark_note TEXT,
  bookmark_color TEXT DEFAULT '#f59e0b',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index)
);

CREATE TABLE IF NOT EXISTS bookmark_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  collection_name TEXT NOT NULL,
  description TEXT,
  bookmark_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON thread_message_bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_thread ON thread_message_bookmarks(thread_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_collections_user ON bookmark_collections(user_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
