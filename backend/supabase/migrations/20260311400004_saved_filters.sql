CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  view_type TEXT NOT NULL CHECK (view_type IN ('threads', 'agents', 'runs', 'incidents', 'activity', 'billing', 'bookmarks', 'queue')),
  filters JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_saved_filters_user ON saved_filters(user_id, view_type);

-- Access control enforced at application layer (WHERE user_id = :user_id)
