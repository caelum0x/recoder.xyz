-- Sprint 41 Phase 1: Saved Prompts Library
CREATE TABLE IF NOT EXISTS saved_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_saved_prompts_user ON saved_prompts(user_id);
CREATE INDEX idx_saved_prompts_user_pinned ON saved_prompts(user_id, is_pinned);

ALTER TABLE saved_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own prompts"
  ON saved_prompts FOR ALL
  USING (user_id = auth.uid());
