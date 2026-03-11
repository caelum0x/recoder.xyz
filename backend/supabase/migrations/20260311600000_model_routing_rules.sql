CREATE TABLE IF NOT EXISTS model_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('message_length', 'keyword', 'time_of_day', 'cost_threshold', 'complexity', 'fallback')),
  condition_value JSONB NOT NULL DEFAULT '{}',
  target_model TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_routing_rules_agent ON model_routing_rules(agent_id, priority DESC);
CREATE INDEX idx_routing_rules_user ON model_routing_rules(user_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
