-- inference_0001_gateway.sql
-- Phase 6 (INFERENCE domain — the BYOK LLM gateway) — the durable state the
-- inference domain owns behind the TensorZero delivery ladder (napi embedded
-- gateway -> loopback HTTP -> engines router):
--
--   provider_keys    — per-user BYOK provider key METADATA (never the ciphertext
--                      here; the encrypted blob lives in the governance vault /
--                      key-cache). This table records which provider a user has a
--                      key for + its key_version so rotation + delivery routing
--                      are auditable.
--   model_catalog    — the routable model registry (id, provider, context window,
--                      per-MTok pricing, streaming support) that backs config
--                      generation, cost accounting, and `GET /inference/models`.
--   delivery_outcome — a bounded audit trail of every routed completion: which
--                      tier served it, streamed or not, latency, truthful status.
--   usage_ledger     — the token + cost ledger every routed call appends (input/
--                      output tokens + computed micro-USD), the accounting source
--                      the billing/metering domain reads.
--
-- Access is app-layer scoped through the persistence QueryExecutor with `:param`
-- SQL (see the inference repositories) — NO Supabase RLS. The migration runner
-- sorts *.sql lexically, so `inference_*` applies after every `NNNN_*` core
-- migration (it needs the 0000 extensions but references no other domain table).
-- Every statement is idempotent.

-- Per-user BYOK provider key metadata (ciphertext is NOT stored here).
create table if not exists inference_provider_keys (
  user_id      text not null,
  provider     text not null,                       -- 'openai','anthropic','google',...
  key_version  integer not null default 1,          -- bumped on rotate
  vault_ref    text,                                -- opaque ref into the vault/secret store (never the key)
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  rotated_at   timestamptz,
  primary key (user_id, provider)
);
create index if not exists idx_inference_provider_keys_user
  on inference_provider_keys (user_id);

-- The routable model registry (config generation + cost + discovery).
create table if not exists inference_model_catalog (
  model_id             text primary key,            -- Recoder id, e.g. 'openai/gpt-4o-mini'
  provider             text not null,               -- 'openai','anthropic',...
  display_name         text not null,
  context_window       integer not null default 0,  -- 0 = unknown
  -- Pricing in micro-USD per 1M tokens (integer, currency-safe; 0 = unpriced).
  input_micro_usd_per_mtok  bigint not null default 0,
  output_micro_usd_per_mtok bigint not null default 0,
  supports_streaming   boolean not null default true,
  enabled              boolean not null default true,
  updated_at           timestamptz not null default now()
);
create index if not exists idx_inference_model_catalog_provider
  on inference_model_catalog (provider);

-- Bounded delivery audit trail (which tier served each routed completion).
create table if not exists inference_delivery_outcome (
  id           bigserial primary key,
  user_id      text,                                -- nullable (anonymous/system)
  model        text not null,
  tier         text not null check (tier in ('napi','loopback','router','none')),
  routed       boolean not null,
  streamed     boolean not null default false,
  token_granular boolean not null default false,    -- true = real per-token SSE
  latency_ms   integer,
  status       text not null check (status in ('ok','degraded','failed')),
  reason       text,                                -- truthful reason when not ok
  created_at   timestamptz not null default now()
);
create index if not exists idx_inference_delivery_outcome_user_time
  on inference_delivery_outcome (user_id, created_at desc);
create index if not exists idx_inference_delivery_outcome_model_time
  on inference_delivery_outcome (model, created_at desc);

-- The token + cost ledger (accounting source of record for billing/metering).
create table if not exists inference_usage_ledger (
  id            bigserial primary key,
  user_id       text,                               -- nullable (anonymous/system)
  model         text not null,
  provider      text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens  integer not null default 0,
  cost_micro_usd bigint not null default 0,         -- computed from model_catalog pricing
  tier          text not null check (tier in ('napi','loopback','router','none')),
  inference_id  text,                               -- gateway observability linkage
  created_at    timestamptz not null default now()
);
create index if not exists idx_inference_usage_ledger_user_time
  on inference_usage_ledger (user_id, created_at desc);
create index if not exists idx_inference_usage_ledger_model_time
  on inference_usage_ledger (model, created_at desc);
