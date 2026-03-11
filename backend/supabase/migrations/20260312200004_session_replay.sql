CREATE TABLE IF NOT EXISTS session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  run_id TEXT,
  events JSONB NOT NULL DEFAULT '[]',
  event_count INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'recording' CHECK (status IN ('recording', 'completed', 'archived')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS session_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES session_recordings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_recordings_user ON session_recordings(user_id, started_at DESC);
CREATE INDEX idx_recordings_thread ON session_recordings(thread_id);
CREATE INDEX idx_recordings_agent ON session_recordings(agent_id);
CREATE INDEX idx_bookmarks_recording ON session_bookmarks(recording_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
