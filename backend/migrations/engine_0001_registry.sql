-- engine_0001_registry.sql
-- Phase 6 (Engines Integration) — the small OPERATIONAL registry the engines
-- domain owns: the declared-engine catalog, a bounded health-snapshot audit
-- trail, and a governed-restart audit log. This is NOT control-plane state
-- (task/run/approval/memory stay agent-os-owned); it is the truthful record of
-- which multi-language engine (napi / daemon / sidecar / cli) is bound, at what
-- path, and last known up/down/degraded — the backing for `/api/agent-os/engines`
-- and the degrade-safe health seam.
--
-- Access is app-layer scoped through the persistence `QueryExecutor` with `:param`
-- SQL (see engine-health.repository.ts) — NO Supabase RLS. The migration runner
-- sorts *.sql lexically, so `engine_*` applies after every `NNNN_*` core migration
-- (it needs the core extensions from 0000 but references no other domain table).
-- Every statement is idempotent.

-- Declared engines + their transport + last-known binding (the seam catalog).
create table if not exists engine_registry (
  engine_id     text primary key,                    -- 'openfang','tensorzero','governance','colbert',...
  transport     text not null check (transport in ('napi','daemon','sidecar','cli')),
  binding_path  text,                                -- resolved .node / binary / venv / CLI path (nullable)
  version       text,                                -- probed version string when available
  last_status   text not null default 'down' check (last_status in ('up','down','degraded')),
  last_reason   text,                                -- truthful reason when down/degraded
  updated_at    timestamptz not null default now()
);

-- Health snapshots (bounded audit trail; prune by retention job).
create table if not exists engine_health_log (
  id            bigserial primary key,
  engine_id     text not null references engine_registry(engine_id) on delete cascade,
  status        text not null check (status in ('up','down','degraded')),
  reason        text,
  probe_ms      integer,                             -- probe latency
  observed_at   timestamptz not null default now()
);
create index if not exists idx_engine_health_log_engine_time
  on engine_health_log (engine_id, observed_at desc);

-- Restart audit (a restart is a governed write; record who/why/outcome).
create table if not exists engine_restart_log (
  id            bigserial primary key,
  engine_id     text not null references engine_registry(engine_id) on delete cascade,
  requested_by  text not null,                       -- user_id / agent id from Session
  reason        text,
  outcome       text not null check (outcome in ('restarted','skipped','failed')),
  audit_ref     text,                                -- governance audit chain ref (Merkle)
  created_at    timestamptz not null default now()
);
create index if not exists idx_engine_restart_log_engine_time
  on engine_restart_log (engine_id, created_at desc);
