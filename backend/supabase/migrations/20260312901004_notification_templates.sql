CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'push', 'webhook')),
  subject_template TEXT,
  body_template TEXT NOT NULL,
  variable_schema JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, template_name)
);

CREATE TABLE IF NOT EXISTS notification_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  rendered_subject TEXT,
  rendered_body TEXT NOT NULL,
  variables_used JSONB DEFAULT '{}',
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notif_templates_user ON notification_templates(user_id, created_at DESC);
CREATE INDEX idx_notif_templates_event ON notification_templates(event_type, channel);
CREATE INDEX idx_notif_sends_user ON notification_sends(user_id, sent_at DESC);
CREATE INDEX idx_notif_sends_template ON notification_sends(template_id, sent_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
