-- Sprint 41 Phase 2: Thread Templates
CREATE TABLE IF NOT EXISTS thread_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  agent_id TEXT,
  initial_messages JSONB DEFAULT '[]',
  category TEXT DEFAULT 'general',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_templates_user ON thread_templates(user_id);
ALTER TABLE thread_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own templates"
  ON thread_templates FOR ALL
  USING (user_id = auth.uid());
