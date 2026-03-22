CREATE TABLE IF NOT EXISTS agent_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  persona_name TEXT NOT NULL,
  description TEXT,
  tone TEXT DEFAULT 'professional' CHECK (tone IN ('professional', 'casual', 'friendly', 'formal', 'technical', 'creative')),
  personality_traits TEXT[] DEFAULT '{}',
  communication_style TEXT,
  language_preferences JSONB DEFAULT '{}',
  custom_instructions TEXT,
  avatar_emoji TEXT DEFAULT '🤖',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, persona_name)
);

CREATE TABLE IF NOT EXISTS agent_persona_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  persona_id UUID NOT NULL REFERENCES agent_personas(id) ON DELETE CASCADE,
  override_instructions TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_agent_personas_user ON agent_personas(user_id, created_at DESC);
CREATE INDEX idx_persona_assignments_agent ON agent_persona_assignments(agent_id);
CREATE INDEX idx_persona_assignments_user ON agent_persona_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
