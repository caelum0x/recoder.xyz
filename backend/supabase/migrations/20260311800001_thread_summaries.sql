-- Sprint 59 Phase 2: Thread Summaries
-- Stores auto/manual/periodic summaries for conversation threads.

CREATE TABLE IF NOT EXISTS thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_points TEXT[] DEFAULT '{}',
  action_items TEXT[] DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  summary_type TEXT DEFAULT 'auto' CHECK (summary_type IN ('auto', 'manual', 'periodic')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, summary_type)
);

CREATE INDEX IF NOT EXISTS idx_summaries_user ON thread_summaries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_summaries_thread ON thread_summaries(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
