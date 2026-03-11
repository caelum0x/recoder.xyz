CREATE TABLE IF NOT EXISTS thread_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER,
  annotation_type TEXT DEFAULT 'note' CHECK (annotation_type IN ('note', 'highlight', 'question', 'action', 'bug', 'insight')),
  content TEXT NOT NULL,
  color TEXT DEFAULT '#fbbf24',
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_annotations_thread ON thread_annotations(thread_id, created_at);
CREATE INDEX idx_annotations_user ON thread_annotations(user_id, created_at DESC);
CREATE INDEX idx_annotations_type ON thread_annotations(annotation_type);
-- Access control enforced at application layer (WHERE user_id = :user_id)
