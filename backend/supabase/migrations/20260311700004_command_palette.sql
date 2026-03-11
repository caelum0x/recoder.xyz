CREATE TABLE IF NOT EXISTS command_palette_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  command TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('navigation', 'action', 'agent', 'thread', 'search', 'setting')),
  metadata JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_palette_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  command TEXT NOT NULL,
  command_type TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, command)
);

CREATE INDEX idx_command_history_user ON command_palette_history(user_id, executed_at DESC);
CREATE INDEX idx_command_pins_user ON command_palette_pins(user_id, sort_order);

-- Access control enforced at application layer (WHERE user_id = :user_id)
