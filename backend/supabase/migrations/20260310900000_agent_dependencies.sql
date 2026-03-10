-- Sprint 50 Phase 1: Agent Dependency Graph
-- Tracks relationships between agents (calls, chains, shared KB/tools, clones)

CREATE TABLE IF NOT EXISTS agent_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_agent_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'calls' CHECK (dependency_type IN ('calls', 'chains_to', 'shares_kb', 'shares_tools', 'cloned_from')),
  description TEXT,
  is_auto_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source_agent_id, target_agent_id, dependency_type)
);

CREATE INDEX idx_agent_deps_source ON agent_dependencies(source_agent_id);
CREATE INDEX idx_agent_deps_target ON agent_dependencies(target_agent_id);
CREATE INDEX idx_agent_deps_user ON agent_dependencies(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
