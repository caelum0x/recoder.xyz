-- 0006_legacy_users_link.sql
-- Unify the physically-separate Better Auth `user` (web) and legacy CLI `users`
-- (plural) identities WITHOUT merging the tables (AGENTS.md critical rule). A
-- link row maps a legacy users.id to a canonical user.id; IdentityRepository
-- .resolveIdentity follows it to return one Identity regardless of entry table.
--
-- Backfill is performed at RUNTIME by IdentityRepository (the user/users tables
-- live in the separate auth database, so a cross-database SQL backfill is not
-- possible here). This migration only creates the link table; it NEVER drops or
-- alters the legacy `users` table.

create table if not exists identity.user_cli_link (
  auth_user_id    text        not null,
  legacy_users_id text        not null,
  linked_at       timestamptz not null default now(),
  primary key (auth_user_id, legacy_users_id)
);

create index if not exists idx_cli_link_legacy on identity.user_cli_link (legacy_users_id);
