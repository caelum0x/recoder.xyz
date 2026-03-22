CREATE TABLE IF NOT EXISTS thread_export_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  format TEXT DEFAULT 'markdown' CHECK (format IN ('markdown', 'html', 'json', 'csv', 'txt')),
  include_metadata BOOLEAN DEFAULT true,
  include_tool_calls BOOLEAN DEFAULT false,
  include_timestamps BOOLEAN DEFAULT true,
  header_template TEXT,
  footer_template TEXT,
  custom_css TEXT,
  is_default BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, template_name)
);

CREATE TABLE IF NOT EXISTS thread_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  template_id UUID REFERENCES thread_export_templates(id) ON DELETE SET NULL,
  format TEXT NOT NULL,
  export_size_bytes INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  exported_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_export_templates_user ON thread_export_templates(user_id, created_at DESC);
CREATE INDEX idx_thread_exports_user ON thread_exports(user_id, exported_at DESC);
CREATE INDEX idx_thread_exports_thread ON thread_exports(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
