-- 0003_identity_keys.sql
-- The identity domain's own schema partition + the DB-backed platform API key
-- store. Replaces the legacy in-memory `validatePlatformApiKey`: `sk_` keys are
-- persisted HASHED at rest (sha256(pepper || raw_key)) with an indexed lookup
-- prefix; the raw key is returned once at mint and never stored. Access is
-- app-layer scoped (WHERE user_id = :user_id); no RLS.
--
-- Better Auth's user/session/account/verification tables live in the SEPARATE
-- auth database (@recoder/auth Prisma layer) and are NOT redefined here; these
-- tables live in the main control-plane database reached via the persistence
-- QueryExecutor. user_id/org_id are stored as plain TEXT (no cross-database FK).

create schema if not exists identity;

create table if not exists identity.platform_api_key (
  id           text        primary key,
  user_id      text        not null,
  org_id       text,
  name         text        not null,
  key_prefix   text        not null,
  key_hash     text        not null,
  scopes       jsonb       not null default '[]'::jsonb,
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_pak_prefix on identity.platform_api_key (key_prefix);

create index if not exists idx_pak_user on identity.platform_api_key (user_id);
