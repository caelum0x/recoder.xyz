-- Sprint 42 Phase 2: API Key Usage Analytics
-- Tracks per-request usage and daily aggregated stats for API keys

CREATE TABLE IF NOT EXISTS api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_api_usage_key ON api_key_usage(key_id);
CREATE INDEX idx_api_usage_user_ts ON api_key_usage(user_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS api_key_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  request_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  UNIQUE (key_id, date)
);

CREATE INDEX idx_api_daily_key ON api_key_daily_stats(key_id);

ALTER TABLE api_key_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage" ON api_key_usage FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can view own stats" ON api_key_daily_stats FOR SELECT USING (user_id = auth.uid());
