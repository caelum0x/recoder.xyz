-- conductor_0001_workspaces.sql
-- Phase 5b (Conductor & Terminal) — the state-of-record for parallel agent runs.
--
-- conductor_workspaces is the SOLE owner of the workspace record (BUILD-ORDER
-- conflict #4 resolution: agent-os drops its 0002-conductor-workspaces copy and
-- cedes this table to the conductor domain). One row per isolated workspace: a
-- git worktree + branch + persistent terminal session + assigned runtime. The
-- full domain object is stored in `metadata` under the canonical
-- `__recoderDomain` key; the typed columns exist for querying/joins only.
--
-- SURVIVABILITY INVARIANT: the record is persisted BEFORE the substrate launches,
-- so a backend restart can reconcile live sessions/worktrees against these rows
-- (see conductor_0003_reconcile_findings.sql). See the domain doc §4 and
-- docs/CONDUCTOR-ARCHITECTURE.md.
--
-- Access is app-layer tenant-scoped (WHERE space_id = :space_id / owner checks) —
-- NO Supabase RLS. The persistence migration runner sorts *.sql lexically, so
-- `conductor_*` applies after every `NNNN_*` core migration (it needs the core
-- extensions from 0000 but references no other domain table). Every statement is
-- idempotent.

create table if not exists conductor_workspaces (
  workspace_id text primary key,
  space_id text not null,
  project_id text not null,
  task_id text not null,
  run_id text,
  runtime_id text not null,
  substrate text not null,
  branch text not null,
  base_ref text not null,
  worktree_path text,
  session_name text,
  state text not null,
  created_by text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conductor_workspaces_space_idx on conductor_workspaces (space_id);
create index if not exists conductor_workspaces_project_idx on conductor_workspaces (project_id);
create index if not exists conductor_workspaces_state_idx on conductor_workspaces (state);
create index if not exists conductor_workspaces_task_idx on conductor_workspaces (task_id);
