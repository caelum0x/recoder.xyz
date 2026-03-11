CREATE TABLE IF NOT EXISTS user_keyboard_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  key_combo TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, action)
);

CREATE INDEX idx_shortcuts_user ON user_keyboard_shortcuts(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
