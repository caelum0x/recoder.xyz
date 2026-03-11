CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  content TEXT,
  pros TEXT[] DEFAULT '{}',
  cons TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);
CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  review_id UUID NOT NULL REFERENCES marketplace_reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, review_id)
);
CREATE INDEX idx_reviews_agent ON marketplace_reviews(agent_id, created_at DESC);
CREATE INDEX idx_reviews_user ON marketplace_reviews(user_id);
CREATE INDEX idx_reviews_rating ON marketplace_reviews(rating);
CREATE INDEX idx_helpful_votes_review ON review_helpful_votes(review_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
