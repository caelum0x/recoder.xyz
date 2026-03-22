-- Client error reporting table for self-hosted error monitoring
CREATE TABLE IF NOT EXISTS client_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app VARCHAR(64) NOT NULL,
    error_message TEXT NOT NULL,
    stack TEXT,
    url TEXT,
    user_agent TEXT,
    client_ip VARCHAR(45),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by app and time
CREATE INDEX IF NOT EXISTS idx_client_errors_app_created ON client_errors (app, created_at DESC);

-- Index for querying by time (dashboard)
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors (created_at DESC);

-- Auto-cleanup: delete errors older than 30 days (run via cron or app-level)
-- For now we rely on the API to enforce retention
