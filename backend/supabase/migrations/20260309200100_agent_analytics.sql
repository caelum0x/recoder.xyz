-- Per-agent analytics daily aggregation table
CREATE TABLE IF NOT EXISTS agent_analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    date DATE NOT NULL,
    total_runs INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    timeout_count INTEGER DEFAULT 0,
    total_tokens_in BIGINT DEFAULT 0,
    total_tokens_out BIGINT DEFAULT 0,
    total_cost NUMERIC(10,4) DEFAULT 0,
    avg_response_ms INTEGER DEFAULT 0,
    avg_turns NUMERIC(5,2) DEFAULT 0,
    model_breakdown JSONB DEFAULT '{}',
    tool_breakdown JSONB DEFAULT '{}',
    UNIQUE(agent_id, date)
);

CREATE INDEX idx_analytics_agent_date ON agent_analytics_daily(agent_id, date DESC);
CREATE INDEX idx_analytics_account ON agent_analytics_daily(account_id);
