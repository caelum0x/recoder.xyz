-- Sprint 42 Phase 1: Agent Execution Debug Logs
-- Stores structured debug/trace logs emitted during agent runs.

CREATE TABLE IF NOT EXISTS agent_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  level TEXT DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'tool_call', 'llm_request', 'llm_response', 'system', 'user_input')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_exec_logs_run ON agent_execution_logs(agent_run_id);
CREATE INDEX idx_exec_logs_agent ON agent_execution_logs(agent_id);
CREATE INDEX idx_exec_logs_user_ts ON agent_execution_logs(user_id, timestamp DESC);

ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own logs" ON agent_execution_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "System can insert logs" ON agent_execution_logs FOR INSERT WITH CHECK (true);
