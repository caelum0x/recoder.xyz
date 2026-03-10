-- Sprint 50 Phase 3: API Rate Limit Tracking
-- Logs every API request for per-key rate limit monitoring and violation tracking.
-- Access control enforced at application layer (WHERE user_id = :user_id)

CREATE TABLE IF NOT EXISTS api_rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  was_rate_limited BOOLEAN DEFAULT false,
  request_timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rate_limit_user ON api_rate_limit_log(user_id, request_timestamp DESC);
CREATE INDEX idx_rate_limit_key ON api_rate_limit_log(key_id, request_timestamp DESC);
CREATE INDEX idx_rate_limit_limited ON api_rate_limit_log(was_rate_limited) WHERE was_rate_limited = true;
