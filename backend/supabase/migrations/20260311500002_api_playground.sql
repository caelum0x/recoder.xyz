CREATE TABLE IF NOT EXISTS api_playground_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  headers JSONB DEFAULT '{}',
  body JSONB,
  response_status INTEGER,
  response_body JSONB,
  response_time_ms INTEGER,
  is_saved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_playground_history_user ON api_playground_history(user_id, created_at DESC);
CREATE INDEX idx_playground_saved ON api_playground_history(user_id, is_saved) WHERE is_saved = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
