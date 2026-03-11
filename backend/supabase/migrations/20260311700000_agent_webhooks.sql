CREATE TABLE IF NOT EXISTS agent_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 5000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES agent_webhooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  response_status INTEGER,
  response_body TEXT,
  attempt INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhooks_user ON agent_webhooks(user_id);
CREATE INDEX idx_webhooks_agent ON agent_webhooks(agent_id);
CREATE INDEX idx_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX idx_deliveries_user ON webhook_deliveries(user_id, created_at DESC);
CREATE INDEX idx_deliveries_status ON webhook_deliveries(status) WHERE status IN ('pending', 'retrying');

-- Access control enforced at application layer (WHERE user_id = :user_id)
