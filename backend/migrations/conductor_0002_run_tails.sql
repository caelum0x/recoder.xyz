-- conductor_0002_run_tails.sql
-- Phase 5b (Conductor & Terminal) — persisted tail cursor.
--
-- One row per workspace tail. The run-tailer records where it last read in the
-- agent's terminal output so a tail RESUMES after a backend restart without
-- re-emitting already-seen output (idempotent per workspace). `finished` +
-- `exit_code` capture the truthful terminal state — an unknown exit code stays
-- NULL and is NEVER fabricated as 0 (run-loop no-fabricated-exit invariant).
--
-- App-layer scoped through the parent workspace (join to conductor_workspaces for
-- the space/owner check) — NO Supabase RLS. Idempotent; runs after
-- conductor_0001_workspaces.sql (lexical sort), which it FKs.

create table if not exists conductor_run_tails (
  workspace_id text primary key references conductor_workspaces(workspace_id),
  run_id text not null,
  last_offset integer not null default 0,
  last_capture_hash text,
  exit_code integer,
  finished boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists conductor_run_tails_run_idx on conductor_run_tails (run_id);
