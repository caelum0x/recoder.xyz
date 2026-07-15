-- Recoder Agent OS — squads (Phase 5a NEW).
-- Leader-routing + autopilot cohorts ported from multica. A squad is a named
-- cohort of agents with exactly one leader; the squad service routes a task to
-- the leader (or a capability-matched member) and records routing activity.
--
-- Mirrored (identical) to backend/migrations/agentos_0003_squads.sql.

create table if not exists squads (
  squad_id text primary key,
  space_id text not null references spaces(space_id) on delete cascade,
  display_name text not null,
  leader_agent_id text references agent_profiles(agent_id) on delete set null,
  routing_strategy text not null default 'leader',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists squad_members (
  squad_id text not null references squads(squad_id) on delete cascade,
  agent_id text not null references agent_profiles(agent_id) on delete cascade,
  role text not null default 'member',
  weight integer not null default 1,
  added_at timestamptz not null default now(),
  primary key (squad_id, agent_id)
);

create table if not exists squad_activity (
  activity_id text primary key,
  squad_id text not null references squads(squad_id) on delete cascade,
  task_id text references tasks(task_id) on delete set null,
  run_id text references task_runs(run_id) on delete set null,
  routed_agent_id text references agent_profiles(agent_id) on delete set null,
  strategy text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists squads_space_status_idx on squads(space_id, status);
create index if not exists squad_members_agent_idx on squad_members(agent_id);
create index if not exists squad_activity_squad_created_idx on squad_activity(squad_id, created_at);
create index if not exists squad_activity_task_idx on squad_activity(task_id);
