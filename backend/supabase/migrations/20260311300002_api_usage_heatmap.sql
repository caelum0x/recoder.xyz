CREATE TABLE IF NOT EXISTS api_usage_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  hour_bucket TIMESTAMPTZ NOT NULL,
  endpoint_group TEXT NOT NULL,
  request_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  avg_latency_ms INTEGER DEFAULT 0,
  UNIQUE (user_id, hour_bucket, endpoint_group)
);

CREATE INDEX idx_api_usage_user ON api_usage_hourly(user_id, hour_bucket DESC);
CREATE INDEX idx_api_usage_endpoint ON api_usage_hourly(endpoint_group);

-- Access control enforced at application layer (WHERE user_id = :user_id)
