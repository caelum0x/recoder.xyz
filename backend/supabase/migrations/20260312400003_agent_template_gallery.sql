-- Sprint 65 Phase 4: Agent Template Gallery
-- Tables for agent templates and usage tracking

CREATE TABLE IF NOT EXISTS agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  template_name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'coding', 'writing', 'analysis', 'customer_support', 'data', 'automation', 'creative')),
  agent_config JSONB NOT NULL DEFAULT '{}',
  icon TEXT DEFAULT 'bot',
  is_official BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  preview_images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_agent_id TEXT,
  used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_templates_category ON agent_templates(category);
CREATE INDEX idx_templates_official ON agent_templates(is_official) WHERE is_official = true;
CREATE INDEX idx_templates_public ON agent_templates(is_public) WHERE is_public = true;
CREATE INDEX idx_templates_tags ON agent_templates USING GIN (tags);
CREATE INDEX idx_templates_popular ON agent_templates(use_count DESC);
CREATE INDEX idx_template_usage_template ON template_usage_log(template_id);
CREATE INDEX idx_template_usage_user ON template_usage_log(user_id, used_at DESC);
