-- Sprint 65 Phase 5: Activity Feed
-- Tables for activity feed events and user preferences

CREATE TABLE IF NOT EXISTS activity_feed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('agent_created', 'agent_updated', 'agent_deleted', 'thread_started', 'thread_completed', 'deployment_created', 'webhook_triggered', 'error_detected', 'benchmark_run', 'template_used', 'config_changed', 'scheduled_task_run', 'annotation_added')),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_feed_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  muted_event_types TEXT[] DEFAULT '{}',
  show_read BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_activity_user ON activity_feed_events(user_id, created_at DESC);
CREATE INDEX idx_activity_type ON activity_feed_events(event_type, created_at DESC);
CREATE INDEX idx_activity_resource ON activity_feed_events(resource_type, resource_id);
CREATE INDEX idx_activity_unread ON activity_feed_events(user_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_activity_prefs_user ON activity_feed_preferences(user_id);
