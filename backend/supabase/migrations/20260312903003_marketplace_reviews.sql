CREATE TABLE IF NOT EXISTS marketplace_agent_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  listing_title TEXT NOT NULL,
  listing_description TEXT,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  price_type TEXT DEFAULT 'free' CHECK (price_type IN ('free', 'paid', 'freemium')),
  is_published BOOLEAN DEFAULT false,
  install_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_agent_listings(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT,
  is_verified_purchase BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (listing_id, reviewer_user_id)
);

CREATE INDEX idx_marketplace_listings_user ON marketplace_agent_listings(user_id);
CREATE INDEX idx_marketplace_listings_published ON marketplace_agent_listings(is_published, rating_avg DESC);
CREATE INDEX idx_marketplace_listings_category ON marketplace_agent_listings(category);
CREATE INDEX idx_marketplace_reviews_listing ON marketplace_reviews(listing_id, created_at DESC);
CREATE INDEX idx_marketplace_reviews_rating ON marketplace_reviews(listing_id, rating);

-- Access control enforced at application layer (WHERE user_id = :user_id)
