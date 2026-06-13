CREATE TABLE IF NOT EXISTS agent_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, key)
);

CREATE INDEX idx_agent_secrets_agent ON agent_secrets(agent_id);
ALTER TABLE agent_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own secrets" ON agent_secrets FOR ALL USING (user_id = auth.uid());
