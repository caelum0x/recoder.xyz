CREATE TABLE IF NOT EXISTS skill_tree_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  skill_description TEXT,
  skill_category TEXT DEFAULT 'general',
  parent_skill_id UUID REFERENCES skill_tree_nodes(id) ON DELETE SET NULL,
  level_required INTEGER DEFAULT 1,
  xp_cost INTEGER DEFAULT 100,
  icon TEXT DEFAULT 'star',
  is_unlocked BOOLEAN DEFAULT false,
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, skill_name)
);

CREATE TABLE IF NOT EXISTS skill_xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  xp_amount INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_skill_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  total_xp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  skills_unlocked INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_skill_nodes_agent ON skill_tree_nodes(agent_id);
CREATE INDEX idx_skill_nodes_user ON skill_tree_nodes(user_id, agent_id);
CREATE INDEX idx_skill_xp_agent ON skill_xp_events(agent_id, created_at DESC);
CREATE INDEX idx_skill_progress_user ON agent_skill_progress(user_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
