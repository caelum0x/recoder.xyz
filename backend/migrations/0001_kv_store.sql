-- 0001_kv_store.sql
-- The DB-backed namespaced key/value store that REPLACES the deleted JSON
-- loadStore/saveStore + data/*.json files. Each row is one (namespace, key)
-- entry holding an arbitrary JSONB value, with optional TTL and an optimistic
-- version counter. Access is app-layer scoped; no RLS.

create table if not exists core.kv_store (
  namespace   text        not null,
  key         text        not null,
  value       jsonb       not null,
  expires_at  timestamptz,
  version     bigint      not null default 1,
  updated_at  timestamptz not null default now(),
  primary key (namespace, key)
);

-- Partial index to make TTL sweeps cheap without bloating the common path.
create index if not exists kv_store_expires_idx
  on core.kv_store (expires_at)
  where expires_at is not null;
