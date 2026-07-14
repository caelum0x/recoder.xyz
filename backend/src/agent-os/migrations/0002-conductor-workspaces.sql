-- Conductor workspaces — control-plane state of record for parallel agent runs.
-- One row per isolated workspace (git worktree + branch + terminal session +
-- assigned runtime). The full domain object is stored in `metadata` under the
-- canonical __recoderDomain key; the typed columns exist for querying/joins.
-- See docs/CONDUCTOR-ARCHITECTURE.md (survivability invariant).

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
