-- 0005_orgs_teams_rbac.sql
-- Organizations, teams, memberships, and per-membership permission overrides.
-- Roles are owner|admin|member|viewer (expanded to permissions by rbac.service).
-- Single-owner + slug uniqueness enforced at the org level; every membership is
-- unique per (org, user). All reads are app-layer org-scoped (WHERE org_id = ...).

create table if not exists identity.organization (
  id             text        primary key,
  slug           text        not null unique,
  name           text        not null,
  owner_user_id  text        not null,
  sso_connection jsonb,
  created_at     timestamptz not null default now()
);

create table if not exists identity.team (
  id         text        primary key,
  org_id     text        not null references identity.organization(id) on delete cascade,
  slug       text        not null,
  name       text        not null,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table if not exists identity.org_membership (
  id         text        primary key,
  org_id     text        not null references identity.organization(id) on delete cascade,
  user_id    text        not null,
  team_id    text        references identity.team(id) on delete set null,
  role       text        not null default 'member',
  status     text        not null default 'invited',
  invited_by text,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists idx_membership_user on identity.org_membership (user_id);

create table if not exists identity.org_permission_override (
  id            text primary key,
  membership_id text not null references identity.org_membership(id) on delete cascade,
  permission    text not null,
  effect        text not null default 'allow'
);

create index if not exists idx_override_membership on identity.org_permission_override (membership_id);
