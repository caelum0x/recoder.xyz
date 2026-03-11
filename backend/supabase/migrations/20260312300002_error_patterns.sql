-- Migration: detected_error_patterns table
-- Sprint 64, Phase 3: Error Pattern Detection

CREATE TABLE IF NOT EXISTS detected_error_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    pattern_name TEXT NOT NULL,
    error_signature TEXT NOT NULL,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    affected_agents TEXT[] NOT NULL DEFAULT '{}',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved', 'muted')),
    resolution TEXT,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    sample_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_patterns_user_id ON detected_error_patterns (user_id);
CREATE INDEX IF NOT EXISTS idx_error_patterns_status ON detected_error_patterns (user_id, status);
CREATE INDEX IF NOT EXISTS idx_error_patterns_severity ON detected_error_patterns (user_id, severity);
CREATE INDEX IF NOT EXISTS idx_error_patterns_last_seen ON detected_error_patterns (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_patterns_signature ON detected_error_patterns (user_id, error_signature);
