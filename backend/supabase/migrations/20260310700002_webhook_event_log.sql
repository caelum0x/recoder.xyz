-- Sprint 48 Phase 3: Webhook Event Log
-- Tracks all webhook delivery events with full request/response details.
-- NO RLS — auth is enforced at the API layer via JWT.

CREATE TABLE IF NOT EXISTS webhook_event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
    request_payload JSONB,
    request_headers JSONB,
    response_status INTEGER,
    response_body TEXT,
    response_headers JSONB,
    duration_ms INTEGER,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    error_message TEXT,
    next_retry_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_webhook_id ON webhook_event_log(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_account_id ON webhook_event_log(account_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_status ON webhook_event_log(status);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_created_at ON webhook_event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_webhook_status ON webhook_event_log(webhook_id, status);
