CREATE TABLE IF NOT EXISTS agent_output_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output JSONB NOT NULL DEFAULT '{}',
  output_text TEXT,
  ttl_seconds INTEGER DEFAULT 3600,
  hit_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, cache_key)
);

CREATE TABLE IF NOT EXISTS cache_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  default_ttl_seconds INTEGER DEFAULT 3600,
  max_entries INTEGER DEFAULT 100,
  cache_similar_inputs BOOLEAN DEFAULT false,
  similarity_threshold NUMERIC(3,2) DEFAULT 0.9,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_output_cache_agent ON agent_output_cache(agent_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_output_cache_expires ON agent_output_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_output_cache_user ON agent_output_cache(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_policies_user ON cache_policies(user_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
