-- Sprint 62 Phase 1: Workflow Templates
-- Allows users to create, share, and run reusable multi-step agent workflow templates.

CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'data_pipeline', 'content_generation', 'monitoring', 'integration', 'custom')),
  steps JSONB NOT NULL DEFAULT '[]',
  variables JSONB DEFAULT '[]',
  is_public BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_template_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  variable_values JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_step INTEGER DEFAULT 0,
  results JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wf_templates_user ON workflow_templates(user_id, updated_at DESC);
CREATE INDEX idx_wf_templates_category ON workflow_templates(category);
CREATE INDEX idx_wf_templates_public ON workflow_templates(is_public) WHERE is_public = true;
CREATE INDEX idx_wf_runs_template ON workflow_template_runs(template_id, created_at DESC);
CREATE INDEX idx_wf_runs_user ON workflow_template_runs(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
