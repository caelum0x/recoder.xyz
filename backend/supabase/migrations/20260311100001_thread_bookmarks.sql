CREATE TABLE IF NOT EXISTS thread_bookmark_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'bookmark',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS thread_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  collection_id UUID REFERENCES thread_bookmark_collections(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE INDEX idx_bookmark_collections_user ON thread_bookmark_collections(user_id, sort_order);
CREATE INDEX idx_bookmarks_user ON thread_bookmarks(user_id, created_at DESC);
CREATE INDEX idx_bookmarks_collection ON thread_bookmarks(collection_id);
CREATE INDEX idx_bookmarks_thread ON thread_bookmarks(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
