-- Sprint 43 Phase 2: User Preferences Backend Sync
-- Stores per-user preferences with backend sync (localStorage as offline cache on frontend)

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY,
  theme TEXT DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  language TEXT DEFAULT 'en',
  font_size TEXT DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  compact_mode BOOLEAN DEFAULT false,
  reduced_animations BOOLEAN DEFAULT false,
  sidebar_collapsed BOOLEAN DEFAULT false,
  notification_email BOOLEAN DEFAULT true,
  notification_push BOOLEAN DEFAULT true,
  notification_in_app BOOLEAN DEFAULT true,
  notification_agent_completed BOOLEAN DEFAULT true,
  notification_agent_failed BOOLEAN DEFAULT true,
  notification_thread_message BOOLEAN DEFAULT true,
  notification_system_alert BOOLEAN DEFAULT true,
  dashboard_widget_order TEXT[] DEFAULT '{}',
  timezone TEXT DEFAULT 'UTC',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Access control enforced at application layer (WHERE user_id = :user_id)
