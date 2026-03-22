CREATE TABLE IF NOT EXISTS agent_memory_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, profile_name)
);

CREATE TABLE IF NOT EXISTS memory_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES agent_memory_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  slot_key TEXT NOT NULL,
  slot_value TEXT NOT NULL,
  value_type TEXT DEFAULT 'text' CHECK (value_type IN ('text', 'number', 'json', 'list')),
  description TEXT,
  is_persistent BOOLEAN DEFAULT true,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  access_count INTEGER DEFAULT 0,
  UNIQUE (profile_id, slot_key)
);

CREATE TABLE IF NOT EXISTS memory_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES memory_slots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  access_type TEXT DEFAULT 'read' CHECK (access_type IN ('read', 'write', 'delete')),
  old_value TEXT,
  new_value TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memory_profiles_agent ON agent_memory_profiles(agent_id);
CREATE INDEX idx_memory_profiles_user ON agent_memory_profiles(user_id);
CREATE INDEX idx_memory_slots_profile ON memory_slots(profile_id, slot_key);
CREATE INDEX idx_memory_access_log_slot ON memory_access_log(slot_id, accessed_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
