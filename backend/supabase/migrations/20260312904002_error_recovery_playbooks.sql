CREATE TABLE IF NOT EXISTS recovery_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  playbook_name TEXT NOT NULL,
  description TEXT,
  error_pattern TEXT NOT NULL,
  error_type TEXT DEFAULT 'general' CHECK (error_type IN ('timeout', 'rate_limit', 'auth_failure', 'network', 'validation', 'general')),
  recovery_steps JSONB NOT NULL DEFAULT '[]',
  auto_execute BOOLEAN DEFAULT false,
  max_retries INTEGER DEFAULT 3,
  cooldown_seconds INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  trigger_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, playbook_name)
);

CREATE TABLE IF NOT EXISTS recovery_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES recovery_playbooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT,
  error_message TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  steps_completed INTEGER DEFAULT 0,
  execution_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_playbooks_user ON recovery_playbooks(user_id);
CREATE INDEX idx_playbooks_error_type ON recovery_playbooks(error_type, is_active);
CREATE INDEX idx_recovery_executions_playbook ON recovery_executions(playbook_id, started_at DESC);
CREATE INDEX idx_recovery_executions_agent ON recovery_executions(agent_id, started_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
