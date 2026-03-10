CREATE TABLE IF NOT EXISTS agent_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  bundle_name TEXT NOT NULL,
  bundle_version TEXT DEFAULT '1.0.0',
  bundle_type TEXT DEFAULT 'full' CHECK (bundle_type IN ('full', 'config_only', 'template')),
  config_data JSONB NOT NULL,
  included_sections TEXT[] DEFAULT '{instructions,tools,model,env_vars,triggers,kb_refs}',
  file_size_bytes INTEGER DEFAULT 0,
  checksum TEXT,
  is_public BOOLEAN DEFAULT false,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bundles_user ON agent_bundles(user_id, created_at DESC);
CREATE INDEX idx_bundles_agent ON agent_bundles(agent_id);
CREATE INDEX idx_bundles_public ON agent_bundles(is_public) WHERE is_public = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
