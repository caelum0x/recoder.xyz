CREATE TABLE IF NOT EXISTS thread_pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  message_preview TEXT,
  pin_note TEXT,
  pin_color TEXT DEFAULT 'default',
  pinned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index)
);

CREATE INDEX idx_pinned_messages_user ON thread_pinned_messages(user_id);
CREATE INDEX idx_pinned_messages_thread ON thread_pinned_messages(thread_id, pinned_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
