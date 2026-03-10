CREATE TABLE IF NOT EXISTS thread_sentiment_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  message_index INTEGER NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('very_positive', 'positive', 'neutral', 'negative', 'very_negative')),
  confidence NUMERIC(3,2) DEFAULT 0.8,
  keywords TEXT[] DEFAULT '{}',
  scored_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, message_index)
);

CREATE INDEX idx_sentiment_thread ON thread_sentiment_scores(thread_id, message_index);
CREATE INDEX idx_sentiment_user ON thread_sentiment_scores(user_id);
CREATE INDEX idx_sentiment_agent ON thread_sentiment_scores(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
