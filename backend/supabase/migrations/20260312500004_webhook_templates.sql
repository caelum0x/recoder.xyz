CREATE TABLE IF NOT EXISTS webhook_payload_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  payload_template JSONB NOT NULL DEFAULT '{}',
  headers_template JSONB DEFAULT '{}',
  variable_definitions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_template_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES webhook_payload_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rendered_payload JSONB NOT NULL,
  variables_used JSONB DEFAULT '{}',
  rendered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wh_templates_user ON webhook_payload_templates(user_id, created_at DESC);
CREATE INDEX idx_wh_templates_event ON webhook_payload_templates(trigger_event);
CREATE INDEX idx_wh_renders_template ON webhook_template_renders(template_id, rendered_at DESC);
-- Access control enforced at application layer (WHERE user_id = :user_id)
