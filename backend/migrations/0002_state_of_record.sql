-- 0002_state_of_record.sql
-- The versioned, event-sourced state-of-record base tables. Every meaningful
-- state change is appended to core.state_events (append-only, monotonic seq);
-- core.state_snapshots holds the materialised aggregate at a given version so
-- time-travel and audit provenance are truthful reads, never reconstructions.
--
-- Domains store their canonical rows in their own tables; this pair is the
-- shared substrate for versioned reads + the audit/time-travel projection.

create table if not exists core.state_events (
  seq          bigserial   primary key,
  aggregate    text        not null,          -- 'task' | 'run' | 'approval' | ...
  aggregate_id text        not null,
  event_type   text        not null,
  actor_id     text,
  payload      jsonb       not null,
  recorded_at  timestamptz not null default now()
);

create index if not exists state_events_agg_idx
  on core.state_events (aggregate, aggregate_id, seq);

create index if not exists state_events_recorded_idx
  on core.state_events (recorded_at);

create table if not exists core.state_snapshots (
  aggregate    text        not null,
  aggregate_id text        not null,
  version      bigint      not null,
  payload      jsonb       not null,
  user_id      text        not null,          -- app-layer tenancy scope
  created_at   timestamptz not null default now(),
  primary key (aggregate, aggregate_id, version)
);

create index if not exists state_snapshots_user_idx
  on core.state_snapshots (aggregate, user_id);
