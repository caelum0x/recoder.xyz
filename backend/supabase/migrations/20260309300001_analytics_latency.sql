-- Add latency tracking columns to existing analytics
ALTER TABLE agent_analytics_daily ADD COLUMN IF NOT EXISTS response_latency_p95_ms INTEGER DEFAULT 0;
ALTER TABLE agent_analytics_daily ADD COLUMN IF NOT EXISTS time_to_first_token_avg_ms INTEGER DEFAULT 0;
ALTER TABLE agent_analytics_daily ADD COLUMN IF NOT EXISTS error_codes JSONB DEFAULT '{}';
ALTER TABLE agent_analytics_daily ADD COLUMN IF NOT EXISTS model_latency_breakdown JSONB DEFAULT '{}';
