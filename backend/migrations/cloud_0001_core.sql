-- cloud_0001_core — Cloud/Sandboxes/Multi-tenancy state-of-record (Phase 10).
--
-- The off-box substrate provider's Postgres source of truth: tenants (tier +
-- isolation + region + quota), sandboxes (persisted BEFORE the provider launches
-- so a restart reconciles instead of leaking), preview deployments, and the
-- signed-preview-URL token ledger (revocation + audit).
--
-- Access is app-layer tenant-scoped (WHERE tenant_id = :tenantId) — NO Supabase
-- RLS. The persistence migration runner sorts *.sql lexically, so `cloud_*`
-- applies after every `NNNN_*` core migration (it needs the 0000 extensions but
-- references no other domain table). Every statement is idempotent.

-- Multi-tenant root: tier decides self-host-vs-cloud placement; quota jsonb holds
-- the per-tenant ceilings enforced BEFORE any provider call.
CREATE TABLE IF NOT EXISTS cloud_tenants (
  id              TEXT PRIMARY KEY,
  org_id          TEXT,                          -- null = personal tenant
  owner_user_id   TEXT NOT NULL,
  tier            TEXT NOT NULL DEFAULT 'self-host', -- self-host|cloud|teams
  isolation_level TEXT NOT NULL DEFAULT 'shared',    -- shared|dedicated|isolated
  region          TEXT NOT NULL DEFAULT 'us-east',
  quota           JSONB NOT NULL DEFAULT '{}'::jsonb, -- {maxSandboxes,maxConcurrent,maxPreview,cpuMillis,memMb}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_tenants_owner ON cloud_tenants(owner_user_id) WHERE org_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_tenants_org ON cloud_tenants(org_id) WHERE org_id IS NOT NULL;

-- Remote sandboxes: the row is written BEFORE the provider provisions (external_id
-- filled in on success) so a backend restart reconciles live sandboxes against it.
CREATE TABLE IF NOT EXISTS cloud_sandboxes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES cloud_tenants(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  run_id         TEXT,                            -- agent-os Run this backs (nullable)
  provider       TEXT NOT NULL,                   -- daytona|e2b|local
  external_id    TEXT,                            -- provider's id (null until provisioned)
  status         TEXT NOT NULL DEFAULT 'pending', -- pending|running|stopped|error|reaped
  region         TEXT NOT NULL,
  image          TEXT,
  resources      JSONB NOT NULL DEFAULT '{}'::jsonb, -- {cpuMillis,memMb}
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ,                     -- TTL; reaped when passed (null = no expiry)
  last_heartbeat TIMESTAMPTZ,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cloud_sandboxes_tenant_status ON cloud_sandboxes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cloud_sandboxes_expires ON cloud_sandboxes(expires_at) WHERE expires_at IS NOT NULL;

-- Preview deployments: a run artifact promoted to a preview target. health_status
-- is a REAL probe result, never inferred from a bare 200.
CREATE TABLE IF NOT EXISTS cloud_deployments (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES cloud_tenants(id) ON DELETE CASCADE,
  sandbox_id       TEXT,
  run_id           TEXT,
  target           TEXT NOT NULL DEFAULT 'preview', -- preview|sandbox|static|container
  status           TEXT NOT NULL DEFAULT 'building', -- building|live|failed|expired
  commit_sha       TEXT,
  preview_base_url TEXT,
  health_status    TEXT NOT NULL DEFAULT 'unknown', -- unknown|healthy|unhealthy
  last_health_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cloud_deployments_tenant_status ON cloud_deployments(tenant_id, status);

-- Signed preview URL token ledger: one row per issued token (token_hash = sha256
-- of the issued token, never the raw token). Revocation lookup is by deployment.
CREATE TABLE IF NOT EXISTS cloud_preview_tokens (
  id            TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES cloud_deployments(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  exp           TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_preview_tokens_deployment ON cloud_preview_tokens(deployment_id);
