-- Sprint 51 Phase 2: Thread Analytics
-- Pre-computed analytics for individual threads.

CREATE TABLE IF NOT EXISTS thread_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL UNIQUE,
    account_id TEXT NOT NULL,
    total_messages INTEGER NOT NULL DEFAULT 0,
    user_messages INTEGER NOT NULL DEFAULT 0,
    assistant_messages INTEGER NOT NULL DEFAULT 0,
    tool_messages INTEGER NOT NULL DEFAULT 0,
    total_tokens_in INTEGER NOT NULL DEFAULT 0,
    total_tokens_out INTEGER NOT NULL DEFAULT 0,
    total_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
    avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    tool_breakdown JSONB DEFAULT '{}',
    model_breakdown JSONB DEFAULT '{}',
    first_message_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    sentiment_score NUMERIC(4, 2),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_thread_analytics_account ON thread_analytics (account_id);
CREATE INDEX IF NOT EXISTS idx_thread_analytics_last_message ON thread_analytics (account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_analytics_total_messages ON thread_analytics (account_id, total_messages DESC);
CREATE INDEX IF NOT EXISTS idx_thread_analytics_total_cost ON thread_analytics (account_id, total_cost DESC);
