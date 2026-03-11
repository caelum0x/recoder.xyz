CREATE TABLE IF NOT EXISTS shared_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'system', 'coding', 'writing', 'analysis', 'creative', 'custom')),
  tags TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_public BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shared_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES shared_prompts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  change_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (prompt_id, version)
);

CREATE INDEX idx_shared_prompts_user ON shared_prompts(user_id, updated_at DESC);
CREATE INDEX idx_shared_prompts_category ON shared_prompts(category);
CREATE INDEX idx_shared_prompts_tags ON shared_prompts USING GIN (tags);
CREATE INDEX idx_shared_prompts_public ON shared_prompts(is_public) WHERE is_public = true;
CREATE INDEX idx_prompt_versions_prompt ON shared_prompt_versions(prompt_id, version DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
