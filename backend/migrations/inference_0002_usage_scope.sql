-- inference_0002_usage_scope.sql
-- Workspace/task attribution for the token + cost ledger. A per-workspace cost
-- strip must never fake attribution, so every routed call now records WHICH
-- conductor workspace (from the workspace-scoped gateway edge's correlation id)
-- and WHICH task (from the caller's routing hint) it was billed against — both
-- nullable: an unattributed call stays honestly unattributed.
--
-- The migration runner sorts *.sql lexically, so this applies after
-- inference_0001_gateway.sql created the table. Every statement is idempotent.

alter table inference_usage_ledger
  add column if not exists workspace_id text;
alter table inference_usage_ledger
  add column if not exists task_id text;

-- Scoped strip reads filter by (user, workspace) newest-first.
create index if not exists idx_inference_usage_ledger_workspace_time
  on inference_usage_ledger (workspace_id, created_at desc)
  where workspace_id is not null;
