-- governance_0001.sql
-- Phase 3 (Governance & Security) — the moat's durable state.
--
-- Four tables owned by domains/governance, all app-layer tenant-scoped
-- (WHERE owner_user_id = :user_id / actor-scoped) — NO Supabase RLS:
--   governance_audit        append-only SHA-256 Merkle chain (tamper-evident)
--   governance_approvals     control-plane approval records (needs_approval gate)
--   governance_work_locks    path/work locks (conflict prevention before writes)
--   governance_secrets       envelope-encrypted secret store (ciphertext only)
--
-- Runs after 0000_extensions_and_ledger.sql (pgcrypto -> gen_random_uuid). The
-- persistence migration runner sorts *.sql lexically, so `governance_*` applies
-- after every `NNNN_*` core migration. Every statement is idempotent.
--
-- APPEND-ONLY ENFORCEMENT (see reuse note): the shared migration runner
-- (domains/persistence/migrations/migration-runner.ts::splitStatements) splits a
-- file on EVERY top-level `;` and is NOT dollar-quote aware, so a plpgsql trigger
-- FUNCTION body (which needs internal `;`) cannot be created by it. We therefore
-- enforce append-only with RULES (`DO INSTEAD NOTHING`) — single statements, no
-- function body — which structurally prevent UPDATE/DELETE from mutating the
-- chain. Tamper attempts that bypass rules (superuser TRUNCATE/COPY) are still
-- caught at read time by AuditChainService.verifyAudit() re-walking prev/entry
-- hashes. A RAISING BEFORE-trigger is the doc's ideal; it requires a one-line
-- dollar-quote-aware upgrade to the (out-of-scope) persistence splitter.

-- ---------------------------------------------------------------------------
-- governance_audit: append-only SHA-256 Merkle chain (tamper-evident)
-- entry_hash = SHA-256(prev_hash || '|' || canonical(payload_fields)); the first
-- row chains from the fixed GENESIS tip (64 zero hex chars).
-- ---------------------------------------------------------------------------
create table if not exists governance_audit (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity,
  prev_hash    text not null,
  entry_hash   text not null unique,
  actor_id     text not null,
  action       text not null,
  resource     text not null,
  effect       text not null check (effect in ('allow','deny','needs_approval')),
  risk_tier    text not null check (risk_tier in ('low','medium','high','critical')),
  degraded     boolean not null default false,
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_governance_audit_actor
  on governance_audit (actor_id, created_at desc);

create unique index if not exists idx_governance_audit_seq
  on governance_audit (seq);

-- Append-only: block in-place mutation of the sealed chain.
create or replace rule governance_audit_no_update as on update to governance_audit do instead nothing;
create or replace rule governance_audit_no_delete as on delete to governance_audit do instead nothing;

-- ---------------------------------------------------------------------------
-- governance_approvals: control-plane approval records (agent-os Approval shape)
-- ---------------------------------------------------------------------------
create table if not exists governance_approvals (
  id            uuid primary key default gen_random_uuid(),
  task_id       text,
  run_id        text,
  action        text not null,
  risk_tier     text not null check (risk_tier in ('low','medium','high','critical')),
  status        text not null default 'pending'
                check (status in ('pending','approved','denied','expired')),
  requested_by  text not null,
  decided_by    text,
  reason        text,
  expires_at    timestamptz,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_governance_approvals_task
  on governance_approvals (task_id, status);

create index if not exists idx_governance_approvals_requester
  on governance_approvals (requested_by, created_at desc);

-- ---------------------------------------------------------------------------
-- governance_work_locks: path/work locks (conflict prevention before writes)
-- ---------------------------------------------------------------------------
create table if not exists governance_work_locks (
  id               uuid primary key default gen_random_uuid(),
  resource_path    text not null,
  holder_agent_id  text not null,
  task_id          text,
  mode             text not null default 'exclusive' check (mode in ('exclusive','shared')),
  acquired_at      timestamptz not null default now(),
  expires_at       timestamptz not null,
  released_at      timestamptz
);

-- One active exclusive lock per path (partial unique index over live rows).
create unique index if not exists idx_governance_worklock_active
  on governance_work_locks (resource_path)
  where released_at is null and mode = 'exclusive';

create index if not exists idx_governance_worklock_holder
  on governance_work_locks (holder_agent_id, acquired_at desc);

-- ---------------------------------------------------------------------------
-- governance_secrets: envelope-encrypted secret store (ciphertext only)
-- Never stores plaintext; app-layer scoped by owner_user_id.
-- ---------------------------------------------------------------------------
create table if not exists governance_secrets (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null,
  owner_user_id  text not null,
  ciphertext     bytea not null,
  nonce          bytea not null,
  key_version    int not null default 1,
  rotated_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (owner_user_id, ref)
);

create index if not exists idx_governance_secrets_owner
  on governance_secrets (owner_user_id, ref);
