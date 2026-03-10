-- Sprint 41 Phase 5: Thread Pinning
-- Allows users to pin threads to the top of their sidebar

CREATE TABLE IF NOT EXISTS user_pinned_threads (
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  pinned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);

ALTER TABLE user_pinned_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own pins"
  ON user_pinned_threads FOR ALL
  USING (user_id = auth.uid());
