CREATE TABLE IF NOT EXISTS thread_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index, emoji)
);

CREATE INDEX idx_reactions_thread ON thread_message_reactions(thread_id, message_index);
CREATE INDEX idx_reactions_user ON thread_message_reactions(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
