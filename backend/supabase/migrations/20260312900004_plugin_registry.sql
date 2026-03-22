CREATE TABLE IF NOT EXISTS plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plugin_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  version TEXT DEFAULT '1.0.0',
  description TEXT,
  plugin_type TEXT DEFAULT 'tool' CHECK (plugin_type IN ('tool', 'prompt_modifier', 'output_formatter', 'data_source', 'integration')),
  config_schema JSONB DEFAULT '{}',
  implementation JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  install_count INTEGER DEFAULT 0,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, plugin_name)
);

CREATE TABLE IF NOT EXISTS agent_plugin_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  plugin_id UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  config_values JSONB DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  installed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, plugin_id)
);

CREATE TABLE IF NOT EXISTS plugin_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plugin_id, user_id)
);

CREATE INDEX idx_plugins_user ON plugins(user_id, created_at DESC);
CREATE INDEX idx_plugins_type ON plugins(plugin_type, is_active);
CREATE INDEX idx_plugins_public ON plugins(is_public, rating_avg DESC);
CREATE INDEX idx_plugin_installs_agent ON agent_plugin_installs(agent_id);
CREATE INDEX idx_plugin_installs_user ON agent_plugin_installs(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
