CREATE TABLE IF NOT EXISTS thread_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  comparison_name TEXT,
  thread_ids TEXT[] NOT NULL,
  comparison_config JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comparison_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES thread_comparisons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 10),
  criteria_scores JSONB DEFAULT '{}',
  strengths TEXT[] DEFAULT '{}',
  weaknesses TEXT[] DEFAULT '{}',
  preferred BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (comparison_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_comparisons_user ON thread_comparisons(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_comparison ON comparison_evaluations(comparison_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
