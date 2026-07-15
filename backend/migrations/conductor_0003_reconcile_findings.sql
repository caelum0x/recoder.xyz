-- conductor_0003_reconcile_findings.sql
-- Phase 5b (Conductor & Terminal) — truthful orphan/reconcile audit trail.
--
-- The restart-survivable reconciler queries the live substrate (tmux sessions +
-- worktrees on disk) at boot and joins against the persisted workspace rows. Each
-- observation is recorded here for operator/policy resolution — the reconciler
-- NEVER auto-kills live work; it FLAGS it (`kind` = orphan_session /
-- orphan_worktree / dangling_record / crashed / live) and leaves resolution to a
-- human or policy. `resolved` is flipped when the finding is acted on.
--
-- App-layer scoped (findings are inspected by operators/policy, joined to the
-- workspace for tenant context) — NO Supabase RLS. Idempotent; runs after
-- conductor_0001_workspaces.sql (lexical sort). `workspace_id` is intentionally
-- NOT a FK: a dangling_record / orphan finding may reference an id that no longer
-- has a workspace row.

create table if not exists conductor_reconcile_findings (
  finding_id text primary key,
  workspace_id text,
  kind text not null,          -- live | orphan_session | orphan_worktree | dangling_record | crashed
  session_name text,
  worktree_path text,
  detail jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  resolved boolean not null default false
);

create index if not exists conductor_reconcile_findings_ws_idx on conductor_reconcile_findings (workspace_id);
create index if not exists conductor_reconcile_findings_kind_idx on conductor_reconcile_findings (kind);
