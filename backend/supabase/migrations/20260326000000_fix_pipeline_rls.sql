-- Fix tables with RLS policies that use auth.uid() which doesn't work
-- in self-hosted PostgreSQL. Access control is enforced at the application
-- layer (WHERE user_id::text = :user_id in all queries).

-- 1. agent_pipelines — causes 404 on GET /v1/pipelines/{id}
DROP POLICY IF EXISTS "Users can manage own pipelines" ON agent_pipelines;
ALTER TABLE agent_pipelines DISABLE ROW LEVEL SECURITY;

-- 2. pipeline_runs — child table of agent_pipelines
DROP POLICY IF EXISTS "Users can view own runs" ON pipeline_runs;
ALTER TABLE pipeline_runs DISABLE ROW LEVEL SECURITY;

-- 3. resources — causes 500 on GET /v1/project/{id}/sandbox/status
--    Policies reference auth.uid() via basejump.account_user join
DROP POLICY IF EXISTS "Account members can view resources for their accounts" ON resources;
DROP POLICY IF EXISTS "Account members can insert resources for their accounts" ON resources;
DROP POLICY IF EXISTS "Account members can update resources for their accounts" ON resources;
DROP POLICY IF EXISTS "Account members can delete resources for their accounts" ON resources;
ALTER TABLE resources DISABLE ROW LEVEL SECURITY;
