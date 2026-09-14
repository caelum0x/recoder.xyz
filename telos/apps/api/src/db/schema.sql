create table if not exists projects (
  id uuid primary key,
  name text not null,
  repo text,
  created_at timestamptz default now()
);
create table if not exists agent_events (
  id uuid primary key,
  project_id uuid,
  tool text not null,
  payload jsonb,
  created_at timestamptz default now()
);
create table if not exists approvals (
  id uuid primary key,
  project_id uuid,
  env text not null,
  approved_by text,
  created_at timestamptz default now()
);
