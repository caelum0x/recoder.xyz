CREATE TABLE IF NOT EXISTS thread_search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  content_preview TEXT,
  message_count INTEGER DEFAULT 0,
  has_tool_calls BOOLEAN DEFAULT false,
  has_errors BOOLEAN DEFAULT false,
  last_message_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  indexed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  result_count INTEGER DEFAULT 0,
  searched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_search_user ON thread_search_index(user_id, last_message_at DESC);
CREATE INDEX idx_thread_search_agent ON thread_search_index(agent_id);
CREATE INDEX idx_thread_search_tags ON thread_search_index USING GIN (tags);
CREATE INDEX idx_search_history_user ON search_history(user_id, searched_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
