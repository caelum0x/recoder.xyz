-- 0004_device_grants.sql
-- RFC-8628 CLI device authorization grants. The raw device_code is never stored
-- (only its sha256); the short user_code is unique so a browser approval binds
-- exactly one grant. status walks pending -> approved -> consumed (single-use)
-- or -> expired. Polling is interval-rate-limited via last_polled_at.

create table if not exists identity.device_grant (
  id                text        primary key,
  device_code_hash  text        not null,
  user_code         text        not null unique,
  user_id           text,
  status            text        not null default 'pending',
  scopes            jsonb       not null default '[]'::jsonb,
  client_id         text        not null,
  interval_seconds  integer     not null default 5,
  last_polled_at    timestamptz,
  approved_at       timestamptz,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_dg_devicehash on identity.device_grant (device_code_hash);

create index if not exists idx_dg_expires on identity.device_grant (expires_at);
