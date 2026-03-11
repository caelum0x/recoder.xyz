-- Sprint 66 Phase 2: Thread Pinning with Collections

CREATE TABLE IF NOT EXISTS pinned_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  pin_label TEXT,
  pin_note TEXT,
  pin_color TEXT DEFAULT '#6366f1',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS thread_pin_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  collection_name TEXT NOT NULL,
  description TEXT,
  thread_ids TEXT[] DEFAULT '{}',
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pinned_threads_user ON pinned_threads(user_id, display_order);
CREATE INDEX IF NOT EXISTS idx_pin_collections_user ON thread_pin_collections(user_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
