-- Trigger Templates: pre-built and custom trigger templates
-- Access control enforced at application layer (WHERE user_id = :user_id)

CREATE TABLE IF NOT EXISTS trigger_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('monitoring', 'reporting', 'data_sync', 'maintenance', 'alerts', 'custom')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('schedule', 'event', 'condition')),
  config_template JSONB NOT NULL,
  icon TEXT DEFAULT 'zap',
  is_builtin BOOLEAN DEFAULT true,
  user_id UUID,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trigger_templates_category ON trigger_templates(category);
CREATE INDEX idx_trigger_templates_user ON trigger_templates(user_id);
