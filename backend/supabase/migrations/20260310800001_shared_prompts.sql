-- Sprint 49 Phase 2: Shared Prompt Library
-- Tables for shared prompt snippets and usage tracking

CREATE TABLE IF NOT EXISTS shared_prompt_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'system', 'tool', 'format', 'persona', 'safety', 'custom')),
  tags TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_snippet_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES shared_prompt_snippets(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shared_prompts_user ON shared_prompt_snippets(user_id);
CREATE INDEX idx_shared_prompts_category ON shared_prompt_snippets(category);
CREATE INDEX idx_shared_prompts_public ON shared_prompt_snippets(is_public) WHERE is_public = true;
CREATE INDEX idx_prompt_usage_snippet ON prompt_snippet_usage(snippet_id);
CREATE INDEX idx_prompt_usage_agent ON prompt_snippet_usage(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
