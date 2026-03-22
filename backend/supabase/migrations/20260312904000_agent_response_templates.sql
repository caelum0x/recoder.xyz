CREATE TABLE IF NOT EXISTS response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  template_body TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  output_format TEXT DEFAULT 'text' CHECK (output_format IN ('text', 'markdown', 'json', 'html', 'structured')),
  agent_ids TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, template_name)
);

CREATE TABLE IF NOT EXISTS template_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES response_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT,
  thread_id TEXT,
  rendered_output TEXT NOT NULL,
  variables_used JSONB DEFAULT '{}',
  rendered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_response_templates_user ON response_templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_templates_category ON response_templates(category);
CREATE INDEX IF NOT EXISTS idx_template_renders_template ON template_renders(template_id, rendered_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
