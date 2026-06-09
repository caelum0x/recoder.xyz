-- Recoder Agent OS canonical state.
-- This schema keeps Recoder-owned state separate from runtime/connector state.

create extension if not exists vector;

create table if not exists agent_profiles (
  agent_id text primary key,
  display_name text not null,
  vendor_surface text not null,
  connector_id text not null,
  runtime_kind text not null,
  memory_scope text not null,
  permissions jsonb not null default '{}'::jsonb,
  approval_policy jsonb not null default '{}'::jsonb,
  cwd_policy jsonb not null default '{}'::jsonb,
  health jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_sessions (
  session_id text primary key,
  agent_id text not null references agent_profiles(agent_id) on delete cascade,
  workspace_id text not null,
  status text not null,
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists agent_runtime_connections (
  connection_id text primary key,
  agent_id text not null references agent_profiles(agent_id) on delete cascade,
  runtime_kind text not null,
  connector_id text not null,
  status text not null,
  endpoint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_capabilities (
  capability_id text primary key,
  agent_id text not null references agent_profiles(agent_id) on delete cascade,
  kind text not null,
  label text not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists spaces (
  space_id text primary key,
  display_name text not null,
  owner_id text not null,
  policy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists space_members (
  space_id text not null references spaces(space_id) on delete cascade,
  user_id text not null,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists space_repositories (
  repo_id text primary key,
  space_id text not null references spaces(space_id) on delete cascade,
  provider text not null,
  owner text not null,
  name text not null,
  default_branch text,
  url text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists space_policies (
  policy_id text primary key,
  space_id text not null references spaces(space_id) on delete cascade,
  name text not null,
  policy jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  task_id text primary key,
  space_id text not null references spaces(space_id) on delete cascade,
  title text not null,
  intent text not null,
  goal text not null,
  spec jsonb not null,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists task_runs (
  run_id text primary key,
  task_id text not null references tasks(task_id) on delete cascade,
  space_id text not null references spaces(space_id) on delete cascade,
  state text not null,
  assignee_agent_id text references agent_profiles(agent_id),
  instruction_bundle_id text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists task_run_steps (
  step_id text primary key,
  run_id text not null references task_runs(run_id) on delete cascade,
  kind text not null,
  status text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists task_assignments (
  assignment_id text primary key,
  task_id text not null references tasks(task_id) on delete cascade,
  agent_id text not null references agent_profiles(agent_id) on delete cascade,
  status text not null,
  assigned_at timestamptz not null default now(),
  claimed_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists instruction_bundles (
  bundle_id text primary key,
  task_id text not null references tasks(task_id) on delete cascade,
  agent_id text not null,
  runtime text not null,
  shared_goal text not null,
  rendered_prompt text not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists instruction_sources (
  source_id text primary key,
  bundle_id text not null references instruction_bundles(bundle_id) on delete cascade,
  path text not null,
  kind text not null,
  sha256 text not null
);

create table if not exists instruction_source_hashes (
  hash_id text primary key,
  source_id text not null references instruction_sources(source_id) on delete cascade,
  algorithm text not null default 'sha256',
  hash text not null,
  content_length integer,
  created_at timestamptz not null default now()
);

create table if not exists work_locks (
  lock_id text primary key,
  space_id text not null references spaces(space_id) on delete cascade,
  repo text,
  path_glob text not null,
  owner_agent_id text not null,
  task_id text not null references tasks(task_id) on delete cascade,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists approval_requests (
  approval_id text primary key,
  task_id text not null references tasks(task_id) on delete cascade,
  run_id text references task_runs(run_id) on delete set null,
  status text not null,
  reason text not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  required_at text not null,
  target jsonb not null default '{}'::jsonb,
  decided_by text,
  decided_at timestamptz,
  decision_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists approval_decisions (
  decision_id text primary key,
  approval_id text not null references approval_requests(approval_id) on delete cascade,
  decision text not null,
  decided_by text not null,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists artifacts (
  artifact_id text primary key,
  task_id text not null references tasks(task_id) on delete cascade,
  run_id text references task_runs(run_id) on delete set null,
  kind text not null,
  mime_type text not null,
  path text,
  content_hash text,
  public boolean not null default false,
  created_by text not null,
  provenance jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists artifact_parts (
  part_id text primary key,
  artifact_id text not null references artifacts(artifact_id) on delete cascade,
  kind text not null,
  mime_type text not null,
  uri text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists artifact_links (
  link_id text primary key,
  artifact_id text not null references artifacts(artifact_id) on delete cascade,
  rel text not null,
  href text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists runtime_evidence (
  evidence_id text primary key,
  task_id text not null references tasks(task_id) on delete cascade,
  run_id text references task_runs(run_id) on delete set null,
  kind text not null,
  status text not null,
  title text not null,
  summary text,
  source jsonb not null default '{}'::jsonb,
  artifact_ids text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create table if not exists memory_items (
  memory_id text primary key,
  scope text not null,
  title text not null,
  body text not null,
  status text not null,
  evidence jsonb not null,
  accepted_by text not null,
  expires_at timestamptz,
  supersedes_memory_id text,
  created_at timestamptz not null default now()
);

create table if not exists memory_candidates (
  candidate_id text primary key,
  scope text not null,
  title text not null,
  body text not null,
  status text not null,
  evidence jsonb not null,
  proposed_by text not null,
  proposed_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_reason text,
  expires_at timestamptz
);

create table if not exists memory_reviews (
  review_id text primary key,
  candidate_id text not null references memory_candidates(candidate_id) on delete cascade,
  decision text not null,
  reviewed_by text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists memory_embeddings (
  embedding_id text primary key,
  memory_id text not null references memory_items(memory_id) on delete cascade,
  scope text not null,
  embedding vector(1536),
  model text,
  created_at timestamptz not null default now()
);

create table if not exists events (
  event_id text primary key,
  type text not null,
  space_id text references spaces(space_id) on delete set null,
  task_id text,
  run_id text,
  agent_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists event_outbox (
  outbox_id text primary key,
  event_id text not null,
  event jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  delivery_id text primary key,
  outbox_id text references event_outbox(outbox_id) on delete set null,
  target_url text not null,
  status text not null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mcp_servers (
  server_id text primary key,
  kind text not null,
  display_name text not null,
  transport text not null,
  endpoint text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists mcp_tools (
  tool_id text primary key,
  server_id text not null references mcp_servers(server_id) on delete cascade,
  tool_name text not null,
  description text,
  input_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists mcp_sessions (
  session_id text primary key,
  server_id text not null references mcp_servers(server_id) on delete cascade,
  actor_agent_id text,
  status text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists mcp_tool_calls (
  call_id text primary key,
  server_id text not null references mcp_servers(server_id) on delete cascade,
  tool_name text not null,
  actor_agent_id text,
  task_id text,
  args jsonb not null default '{}'::jsonb,
  decision jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists runtime_credentials (
  credential_id text primary key,
  connector_id text not null,
  runtime_kind text not null,
  secret_ref text not null,
  scope text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table if not exists connector_installations (
  installation_id text primary key,
  connector_id text not null,
  space_id text references spaces(space_id) on delete cascade,
  status text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  audit_id text primary key,
  actor_id text,
  actor_kind text not null,
  action text not null,
  target_kind text not null,
  target_id text,
  decision jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_sessions_agent_status_seen_idx on agent_sessions(agent_id, status, last_seen_at);
create index if not exists tasks_space_status_created_idx on tasks(space_id, status, created_at);
create index if not exists task_runs_task_status_started_idx on task_runs(task_id, state, started_at);
create index if not exists work_locks_space_repo_path_expires_idx on work_locks(space_id, repo, path_glob, expires_at);
create index if not exists runtime_evidence_task_kind_observed_idx on runtime_evidence(task_id, kind, observed_at);
create index if not exists runtime_evidence_run_observed_idx on runtime_evidence(run_id, observed_at);
create index if not exists events_space_type_created_idx on events(space_id, type, created_at);
create index if not exists events_task_type_created_idx on events(task_id, type, created_at);
create index if not exists event_outbox_status_created_idx on event_outbox(status, created_at);
create index if not exists memory_embeddings_vector_idx on memory_embeddings using ivfflat (embedding vector_cosine_ops);
