-- Recoder Agent OS durable state-of-record (GAP Wave 4: Postgres state-of-record repository).
--
-- A LOSSLESS jsonb document store the `PostgresAgentOsRepository` binds to,
-- shaped 1:1 on the frozen `AgentOsRepositoryPort`:
--  - `agentos_records`   one row per aggregate record (spaces/agents/tasks/runs/
--                        approvals mirror/artifacts/evidence/links/memory/
--                        bundles/decisions/oss components/workspace mirror);
--                        `seq` preserves insertion order for list parity with
--                        the in-memory driver.
--  - `agentos_event_log` the append-only RunEvent log (immutable, seq-ordered).
--  - `agentos_outbox`    the CloudEvents outbox (at-least-once delivery spine).
--
-- The normalized agentos_0001 tables remain the reporting/projection target;
-- THIS store is the port-shaped state-of-record (exact document round-trip, no
-- lossy column mapping, no cross-aggregate FK landmines on partial hydration).
--
-- splitStatements-safe: plain DDL only, full-line comments only, no dollar-quoted
-- bodies, no semicolons inside statements.

create table if not exists agentos_records (
  aggregate text not null,
  record_id text not null,
  payload jsonb not null,
  seq bigserial not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (aggregate, record_id)
);

create index if not exists agentos_records_aggregate_seq_idx
  on agentos_records (aggregate, seq);

create table if not exists agentos_event_log (
  seq bigserial primary key,
  event_id text not null,
  payload jsonb not null,
  recorded_at timestamptz not null default now()
);

create index if not exists agentos_event_log_event_id_idx
  on agentos_event_log (event_id);

create table if not exists agentos_outbox (
  outbox_id text primary key,
  payload jsonb not null,
  seq bigserial not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agentos_outbox_seq_idx
  on agentos_outbox (seq);
