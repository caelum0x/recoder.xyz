CREATE TABLE IF NOT EXISTS thread_auto_tag_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tag_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword', 'agent', 'tool_used', 'message_count', 'sentiment', 'regex')),
  rule_config JSONB NOT NULL DEFAULT '{}',
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  match_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS thread_auto_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  rule_id UUID REFERENCES thread_auto_tag_rules(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2) DEFAULT 1.0,
  applied_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, tag_name)
);
CREATE INDEX idx_auto_tag_rules_user ON thread_auto_tag_rules(user_id);
CREATE INDEX idx_auto_tags_thread ON thread_auto_tags(thread_id);
CREATE INDEX idx_auto_tags_user ON thread_auto_tags(user_id, applied_at DESC);
CREATE INDEX idx_auto_tags_tag ON thread_auto_tags(tag_name);
-- Access control enforced at application layer (WHERE user_id = :user_id)
