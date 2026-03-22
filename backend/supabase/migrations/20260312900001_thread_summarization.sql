CREATE TABLE IF NOT EXISTS thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  key_points TEXT[] DEFAULT '{}',
  action_items TEXT[] DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  tokens_summarized INTEGER DEFAULT 0,
  summary_type TEXT DEFAULT 'auto' CHECK (summary_type IN ('auto', 'manual', 'checkpoint')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, summary_type)
);

CREATE TABLE IF NOT EXISTS summarization_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  auto_summarize_threshold INTEGER DEFAULT 50,
  include_key_points BOOLEAN DEFAULT true,
  include_action_items BOOLEAN DEFAULT true,
  summary_length TEXT DEFAULT 'medium' CHECK (summary_length IN ('brief', 'medium', 'detailed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_thread_summaries_thread ON thread_summaries(thread_id);
CREATE INDEX idx_thread_summaries_user ON thread_summaries(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
