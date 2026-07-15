-- cloud_0002_fleet_mesh — Fleet supervisor + custom domains + mesh registry.
--
-- Phase 10, part 2. The cloud capacity manifest (heartbeat-based up|down +
-- capacity accounting), the custom-domain / DNS-verification surface, and the
-- networking mesh registry. The mesh is REGISTERED AND OBSERVABLE with NO LIVE
-- DATA PLANE until launch: these rows record ziti identity + xds cluster
-- registration + status, they do not route traffic.
--
-- Access is app-layer tenant-scoped — NO Supabase RLS. Applies after
-- cloud_0001_core (fleet nodes may be shared/null-tenant; domains + mesh
-- reference cloud_tenants). Every statement is idempotent.

-- Cloud capacity nodes: sandbox pools / preview runners / mesh endpoints, with a
-- heartbeat (last_seen) driving up|down and capacity accounting. tenant_id null =
-- shared pool.
CREATE TABLE IF NOT EXISTS cloud_fleet_nodes (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT,                            -- null = shared pool
  kind       TEXT NOT NULL,                   -- sandbox|preview|mesh
  status     TEXT NOT NULL DEFAULT 'down',    -- up|down|draining
  capacity   JSONB NOT NULL DEFAULT '{}'::jsonb, -- {slotsTotal,slotsUsed,cpuMillis,memMb}
  manifest   JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_fleet_kind_status ON cloud_fleet_nodes(kind, status);

-- Custom domains: hostname + expected DNS records + verification/TLS status.
CREATE TABLE IF NOT EXISTS cloud_domains (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES cloud_tenants(id) ON DELETE CASCADE,
  hostname            TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'pending', -- pending|verified|failed
  dns_records         JSONB NOT NULL DEFAULT '[]'::jsonb, -- expected TXT/CNAME/A records
  tls_status          TEXT NOT NULL DEFAULT 'none',    -- none|pending|active
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_domains_tenant ON cloud_domains(tenant_id);

-- Mesh endpoint registry: ziti identity + xds cluster registration + status.
-- Registered-but-no-live-data-plane until launch.
CREATE TABLE IF NOT EXISTS cloud_mesh_endpoints (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES cloud_tenants(id) ON DELETE CASCADE,
  service       TEXT NOT NULL,
  ziti_identity TEXT,
  xds_cluster   TEXT,
  status        TEXT NOT NULL DEFAULT 'registered', -- registered|active|down
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cloud_mesh_tenant ON cloud_mesh_endpoints(tenant_id);
