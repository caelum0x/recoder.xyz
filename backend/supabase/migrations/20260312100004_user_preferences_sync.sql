CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL DEFAULT '{}',
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'appearance', 'editor', 'notifications', 'shortcuts', 'layout', 'privacy')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, preference_key)
);
CREATE TABLE IF NOT EXISTS preference_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  sync_type TEXT DEFAULT 'push' CHECK (sync_type IN ('push', 'pull', 'conflict_resolved')),
  preferences_synced INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_preferences_user ON user_preferences(user_id, category);
CREATE INDEX idx_preferences_key ON user_preferences(preference_key);
CREATE INDEX idx_sync_log_user ON preference_sync_log(user_id, synced_at DESC);
-- Access control enforced at application layer (WHERE user_id = :user_id)
