-- Sprint 45: Notification Channels (Slack, Discord, Email)

CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('slack', 'discord', 'email')),
  name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  events TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notification_channels_user ON notification_channels(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
