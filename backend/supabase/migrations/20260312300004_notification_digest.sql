-- Notification Digest: config and generated digest records
-- Sprint 64 Phase 5

CREATE TABLE IF NOT EXISTS notification_digest_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'off' CHECK (frequency IN ('off', 'hourly', 'daily', 'weekly')),
  include_types TEXT[] DEFAULT ARRAY['run_completed', 'run_failed', 'agent_error', 'quota_warning', 'system'],
  delivery_hour INTEGER DEFAULT 9 CHECK (delivery_hour >= 0 AND delivery_hour <= 23),
  delivery_day INTEGER DEFAULT 1 CHECK (delivery_day >= 0 AND delivery_day <= 6),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS notification_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  digest_type TEXT NOT NULL CHECK (digest_type IN ('hourly', 'daily', 'weekly')),
  notification_count INTEGER NOT NULL DEFAULT 0,
  content JSONB NOT NULL DEFAULT '{}',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_digest_config_user ON notification_digest_config(user_id);
CREATE INDEX idx_digests_user ON notification_digests(user_id, created_at DESC);
CREATE INDEX idx_digests_period ON notification_digests(user_id, period_start, period_end);
-- Access control enforced at application layer (WHERE user_id = :user_id)
