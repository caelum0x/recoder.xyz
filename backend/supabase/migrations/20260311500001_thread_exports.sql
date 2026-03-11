CREATE TABLE IF NOT EXISTS thread_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  export_format TEXT NOT NULL CHECK (export_format IN ('json', 'markdown', 'csv', 'pdf', 'html')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url TEXT,
  file_size_bytes INTEGER,
  options JSONB DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_thread_exports_user ON thread_exports(user_id, created_at DESC);
CREATE INDEX idx_thread_exports_thread ON thread_exports(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
