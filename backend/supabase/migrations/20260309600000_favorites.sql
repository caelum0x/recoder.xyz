-- Favorites / Bookmarks system
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('agent', 'thread', 'workflow', 'knowledge_entry')),
  item_id TEXT NOT NULL,
  item_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX idx_favorites_user ON user_favorites(user_id);
CREATE INDEX idx_favorites_user_type ON user_favorites(user_id, item_type);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own favorites"
  ON user_favorites FOR ALL
  USING (user_id = auth.uid());
