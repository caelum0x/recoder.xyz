-- Sprint 59 Phase 3: Rate Limit Dashboard Tracking
-- Tracks rate limit events and configurable limits per user/endpoint.
-- Access control enforced at application layer (WHERE user_id = :user_id)

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  limit_type TEXT NOT NULL CHECK (limit_type IN ('per_minute', 'per_hour', 'per_day', 'concurrent', 'burst')),
  current_count INTEGER DEFAULT 0,
  max_allowed INTEGER DEFAULT 0,
  was_blocked BOOLEAN DEFAULT false,
  occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint_pattern TEXT NOT NULL,
  limit_type TEXT NOT NULL,
  max_allowed INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, endpoint_pattern, limit_type)
);

CREATE INDEX idx_rate_events_user ON rate_limit_events(user_id, occurred_at DESC);
CREATE INDEX idx_rate_events_endpoint ON rate_limit_events(endpoint, occurred_at DESC);
CREATE INDEX idx_rate_events_blocked ON rate_limit_events(was_blocked) WHERE was_blocked = true;
CREATE INDEX idx_rate_configs_user ON rate_limit_configs(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
