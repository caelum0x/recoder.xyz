CREATE TABLE IF NOT EXISTS run_retry_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  max_retries INTEGER DEFAULT 3,
  retry_delay_seconds INTEGER DEFAULT 30,
  backoff_multiplier NUMERIC(3,1) DEFAULT 2.0,
  retry_on_errors TEXT[] DEFAULT '{timeout,rate_limit,server_error}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS run_retry_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  original_run_id TEXT NOT NULL,
  retry_run_id TEXT,
  agent_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  error_type TEXT,
  error_message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'succeeded', 'failed', 'exhausted')),
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_retry_policies_user ON run_retry_policies(user_id);
CREATE INDEX idx_retry_policies_agent ON run_retry_policies(agent_id);
CREATE INDEX idx_retry_attempts_run ON run_retry_attempts(original_run_id);
CREATE INDEX idx_retry_attempts_user ON run_retry_attempts(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
