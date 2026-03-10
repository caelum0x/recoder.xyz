-- Agent marketplace tables
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid NOT NULL,
    publisher_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    short_description text NOT NULL DEFAULT '',
    category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'development', 'research', 'writing', 'data', 'support', 'automation', 'creative')),
    tags text[] DEFAULT '{}',
    icon_url text,
    is_public boolean NOT NULL DEFAULT false,
    install_count int NOT NULL DEFAULT 0,
    avg_rating numeric(3,2) DEFAULT 0,
    review_count int NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'under_review', 'rejected')),
    agent_config jsonb NOT NULL DEFAULT '{}',
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketplace_listings_publisher ON marketplace_listings (publisher_id);
CREATE INDEX idx_marketplace_listings_status ON marketplace_listings (status, published_at DESC);
CREATE INDEX idx_marketplace_listings_category ON marketplace_listings (category) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (listing_id, user_id)
);

CREATE INDEX idx_marketplace_reviews_listing ON marketplace_reviews (listing_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_installs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    installed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (listing_id, user_id)
);

ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_listings_read ON marketplace_listings FOR SELECT
    USING (status = 'published' OR publisher_id = auth.uid());
CREATE POLICY marketplace_listings_write ON marketplace_listings FOR ALL
    USING (publisher_id = auth.uid()) WITH CHECK (publisher_id = auth.uid());

ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_reviews_read ON marketplace_reviews FOR SELECT USING (true);
CREATE POLICY marketplace_reviews_write ON marketplace_reviews
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY marketplace_reviews_update ON marketplace_reviews
    FOR UPDATE USING (user_id = auth.uid());

ALTER TABLE marketplace_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_installs_policy ON marketplace_installs
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
