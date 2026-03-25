-- Migration: Fix text→uuid column mismatches
-- These text columns JOIN with core tables (agents, threads, agent_runs, messages, workspaces)
-- that use uuid type, causing "operator does not exist: uuid = text" errors.
-- All values verified to be valid UUID format before conversion.

BEGIN;

-- ============================================================
-- 1. messages table — JOINs with agents.agent_id (uuid) and agent_runs.id (uuid)
-- ============================================================
ALTER TABLE messages
    ALTER COLUMN agent_id TYPE uuid USING agent_id::uuid,
    ALTER COLUMN agent_run_id TYPE uuid USING agent_run_id::uuid,
    ALTER COLUMN agent_version_id TYPE uuid USING agent_version_id::uuid;

-- ============================================================
-- 2. agent_execution_logs — JOINs with agent_runs.id (uuid)
-- ============================================================
ALTER TABLE agent_execution_logs
    ALTER COLUMN agent_run_id TYPE uuid USING agent_run_id::uuid;

-- ============================================================
-- 3. agent_runs — agent_version_id JOINs with agent versions
-- ============================================================
ALTER TABLE agent_runs
    ALTER COLUMN agent_version_id TYPE uuid USING agent_version_id::uuid;

-- ============================================================
-- 4. agent_ab_tests — JOINs with agents.agent_id (uuid)
-- ============================================================
ALTER TABLE agent_ab_tests
    ALTER COLUMN agent_a_id TYPE uuid USING agent_a_id::uuid,
    ALTER COLUMN agent_b_id TYPE uuid USING agent_b_id::uuid;

-- ============================================================
-- 5. agent_clone_history — JOINs with agents.agent_id (uuid)
-- ============================================================
ALTER TABLE agent_clone_history
    ALTER COLUMN source_agent_id TYPE uuid USING source_agent_id::uuid,
    ALTER COLUMN target_agent_id TYPE uuid USING target_agent_id::uuid,
    ALTER COLUMN cloned_agent_id TYPE uuid USING cloned_agent_id::uuid;

-- ============================================================
-- 6. agent_dependencies — JOINs with agents.agent_id (uuid)
-- ============================================================
ALTER TABLE agent_dependencies
    ALTER COLUMN source_agent_id TYPE uuid USING source_agent_id::uuid,
    ALTER COLUMN target_agent_id TYPE uuid USING target_agent_id::uuid;

-- ============================================================
-- 7. collaboration_tasks — JOINs with agents.agent_id (uuid)
-- ============================================================
ALTER TABLE collaboration_tasks
    ALTER COLUMN assigned_agent_id TYPE uuid USING assigned_agent_id::uuid;

-- ============================================================
-- 8. credit_ledger — JOINs with threads.thread_id (uuid), messages (uuid)
-- ============================================================
ALTER TABLE credit_ledger
    ALTER COLUMN thread_id TYPE uuid USING thread_id::uuid,
    ALTER COLUMN message_id TYPE uuid USING message_id::uuid;

-- ============================================================
-- 9. response_ratings — JOINs with messages (uuid)
-- ============================================================
ALTER TABLE response_ratings
    ALTER COLUMN message_id TYPE uuid USING message_id::uuid;

-- ============================================================
-- 10. thread_branches — JOINs with threads.thread_id (uuid)
-- ============================================================
ALTER TABLE thread_branches
    ALTER COLUMN branch_thread_id TYPE uuid USING branch_thread_id::uuid,
    ALTER COLUMN source_thread_id TYPE uuid USING source_thread_id::uuid;

-- ============================================================
-- 11. thread_merges — JOINs with threads.thread_id (uuid)
-- ============================================================
ALTER TABLE thread_merges
    ALTER COLUMN source_thread_id TYPE uuid USING source_thread_id::uuid,
    ALTER COLUMN target_thread_id TYPE uuid USING target_thread_id::uuid;

-- ============================================================
-- 12. thread_replays — JOINs with threads.thread_id (uuid)
-- ============================================================
ALTER TABLE thread_replays
    ALTER COLUMN replay_thread_id TYPE uuid USING replay_thread_id::uuid,
    ALTER COLUMN source_thread_id TYPE uuid USING source_thread_id::uuid;

-- ============================================================
-- 13. run_retry_attempts — JOINs with agent_runs.id (uuid)
-- ============================================================
ALTER TABLE run_retry_attempts
    ALTER COLUMN original_run_id TYPE uuid USING original_run_id::uuid,
    ALTER COLUMN retry_run_id TYPE uuid USING retry_run_id::uuid;

-- ============================================================
-- 14. template_usage_log — JOINs with agents.agent_id (uuid)
-- ============================================================
ALTER TABLE template_usage_log
    ALTER COLUMN created_agent_id TYPE uuid USING created_agent_id::uuid;

-- ============================================================
-- 15. incident_postmortems — JOINs with incidents (uuid)
-- ============================================================
ALTER TABLE incident_postmortems
    ALTER COLUMN incident_id TYPE uuid USING incident_id::uuid;

-- ============================================================
-- 16. workspace_activity_feed — JOINs with workspaces.id (uuid)
-- ============================================================
ALTER TABLE workspace_activity_feed
    ALTER COLUMN workspace_id TYPE uuid USING workspace_id::uuid;

-- ============================================================
-- 17. user_favorites — item_id references agents/threads (uuid)
-- ============================================================
ALTER TABLE user_favorites
    ALTER COLUMN item_id TYPE uuid USING item_id::uuid;

-- ============================================================
-- 18. sandbox_resource_snapshots — sandbox_id references resources
-- ============================================================
ALTER TABLE sandbox_resource_snapshots
    ALTER COLUMN sandbox_id TYPE uuid USING sandbox_id::uuid;

COMMIT;
