-- Sprint 48 Phase 2: Response Rating System
-- Allows users to rate individual assistant responses with stars, feedback, and tags.

CREATE TABLE IF NOT EXISTS response_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    agent_id UUID,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, thread_id, message_id)
);

CREATE INDEX idx_response_ratings_user ON response_ratings(user_id);
CREATE INDEX idx_response_ratings_thread ON response_ratings(thread_id);
CREATE INDEX idx_response_ratings_agent ON response_ratings(agent_id);
CREATE INDEX idx_response_ratings_rating ON response_ratings(rating);
CREATE INDEX idx_response_ratings_created ON response_ratings(created_at DESC);
