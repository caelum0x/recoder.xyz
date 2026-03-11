CREATE TABLE IF NOT EXISTS multilang_prompt_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  prompt_name TEXT NOT NULL,
  base_language TEXT DEFAULT 'en',
  description TEXT,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, prompt_name)
);

CREATE TABLE IF NOT EXISTS multilang_prompt_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_set_id UUID NOT NULL REFERENCES multilang_prompt_sets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  language_code TEXT NOT NULL,
  content TEXT NOT NULL,
  is_machine_translated BOOLEAN DEFAULT false,
  quality_score NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (prompt_set_id, language_code)
);

CREATE INDEX idx_multilang_sets_user ON multilang_prompt_sets(user_id, created_at DESC);
CREATE INDEX idx_multilang_variants_set ON multilang_prompt_variants(prompt_set_id, language_code);
CREATE INDEX idx_multilang_variants_lang ON multilang_prompt_variants(language_code);
-- Access control enforced at application layer (WHERE user_id = :user_id)
