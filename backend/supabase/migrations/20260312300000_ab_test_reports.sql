-- Sprint 64 Phase 1: A/B Test Reports
-- Stores structured A/B test reports with variant comparison data

CREATE TABLE IF NOT EXISTS ab_test_reports (
    test_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT NOT NULL,
    agent_id      TEXT NOT NULL,
    report_name   TEXT NOT NULL,
    variant_a     JSONB NOT NULL DEFAULT '{}',
    variant_b     JSONB NOT NULL DEFAULT '{}',
    metrics       JSONB NOT NULL DEFAULT '{}',
    winner        TEXT,  -- 'a', 'b', or NULL (undetermined)
    confidence_level DOUBLE PRECISION DEFAULT 0.0,
    sample_size_a INTEGER NOT NULL DEFAULT 0,
    sample_size_b INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_reports_user_id ON ab_test_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_reports_agent_id ON ab_test_reports (agent_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_reports_status ON ab_test_reports (status);
CREATE INDEX IF NOT EXISTS idx_ab_test_reports_created_at ON ab_test_reports (created_at DESC);
