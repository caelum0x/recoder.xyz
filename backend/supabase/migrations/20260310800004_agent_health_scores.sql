-- Sprint 49 Phase 5: Agent Health Scores
-- Composite health scoring for agents based on reliability, performance, cost efficiency, and satisfaction

CREATE TABLE IF NOT EXISTS agent_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  reliability_score INTEGER CHECK (reliability_score BETWEEN 0 AND 100),
  performance_score INTEGER CHECK (performance_score BETWEEN 0 AND 100),
  cost_efficiency_score INTEGER CHECK (cost_efficiency_score BETWEEN 0 AND 100),
  user_satisfaction_score INTEGER CHECK (user_satisfaction_score BETWEEN 0 AND 100),
  factors JSONB DEFAULT '{}',
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, calculated_at)
);

CREATE INDEX idx_health_scores_agent ON agent_health_scores(agent_id, calculated_at DESC);
CREATE INDEX idx_health_scores_user ON agent_health_scores(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
