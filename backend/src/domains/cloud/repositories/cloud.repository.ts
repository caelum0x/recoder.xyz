/**
 * `createCloudRepositories` — the concrete {@link CloudRepositories} bundle over
 * the injected {@link QueryExecutor}.
 *
 * All access is parameterized `:param` SQL bound through the executor (never
 * string interpolation), app-layer scoped by `tenant_id`. jsonb columns are
 * written as `JSON.stringify(...)` (pg casts the string to jsonb) and read back
 * with a tolerant parser (pg returns an object; a string is parsed defensively).
 * Each repo mirrors the executor's `isAvailable()` so the tenancy/provisioner
 * services can take the fail-safe DENY path when Postgres is down.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type {
  CloudRepositories,
  DeploymentInsert,
  DeploymentRepository,
  DomainInsert,
  DomainRepository,
  FleetNodeUpsert,
  FleetRepository,
  MeshEndpointUpsert,
  MeshRepository,
  PreviewTokenInsert,
  PreviewTokenRepository,
  SandboxInsert,
  SandboxRepository,
  TenantRepository,
  TenantUpsert,
} from '../ports/cloud-repository.port.js';
import type {
  Deployment,
  DeploymentStatus,
  DnsRecord,
  DomainRecord,
  DomainVerificationStatus,
  FleetCapacity,
  FleetNode,
  FleetNodeKind,
  IsolationLevel,
  MeshEndpoint,
  PreviewHealthStatus,
  PreviewToken,
  ProviderId,
  Sandbox,
  SandboxResources,
  SandboxStatus,
  Tenant,
  TenantQuota,
  TenantTier,
  TlsStatus,
} from '../types.js';
import { DEFAULT_TIER_QUOTAS } from '../config.js';

// --- coercion helpers ---

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function strOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}

function iso(v: unknown, fallback = new Date().toISOString()): string {
  if (v == null) return fallback;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Tolerant jsonb read: pg returns an object, but a string is parsed defensively. */
function json(v: unknown): Record<string, unknown> {
  if (v == null) return {};
  if (typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v) as unknown;
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function jsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// --- row mappers ---

function mapQuota(v: unknown): TenantQuota {
  const q = json(v);
  const floor = DEFAULT_TIER_QUOTAS['self-host'];
  return {
    maxSandboxes: num(q.maxSandboxes, floor.maxSandboxes),
    maxConcurrent: num(q.maxConcurrent, floor.maxConcurrent),
    maxPreview: num(q.maxPreview, floor.maxPreview),
    cpuMillis: num(q.cpuMillis, floor.cpuMillis),
    memMb: num(q.memMb, floor.memMb),
  };
}

function mapTenant(row: QueryRow): Tenant {
  return {
    id: str(row.id),
    orgId: strOrNull(row.org_id),
    ownerUserId: str(row.owner_user_id),
    tier: str(row.tier) as TenantTier,
    isolationLevel: str(row.isolation_level) as IsolationLevel,
    region: str(row.region),
    quota: mapQuota(row.quota),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapResources(v: unknown): SandboxResources {
  const r = json(v);
  return { cpuMillis: num(r.cpuMillis, 0), memMb: num(r.memMb, 0) };
}

function mapSandbox(row: QueryRow): Sandbox {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    userId: str(row.user_id),
    runId: strOrNull(row.run_id),
    provider: str(row.provider) as ProviderId,
    externalId: strOrNull(row.external_id),
    status: str(row.status) as SandboxStatus,
    region: str(row.region),
    image: strOrNull(row.image),
    resources: mapResources(row.resources),
    createdAt: iso(row.created_at),
    expiresAt: isoOrNull(row.expires_at),
    lastHeartbeat: isoOrNull(row.last_heartbeat),
    metadata: json(row.metadata),
  };
}

function mapDeployment(row: QueryRow): Deployment {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    sandboxId: strOrNull(row.sandbox_id),
    runId: strOrNull(row.run_id),
    target: str(row.target) as Deployment['target'],
    status: str(row.status) as DeploymentStatus,
    commitSha: strOrNull(row.commit_sha),
    previewBaseUrl: strOrNull(row.preview_base_url),
    healthStatus: str(row.health_status) as PreviewHealthStatus,
    lastHealthAt: isoOrNull(row.last_health_at),
    createdAt: iso(row.created_at),
    expiresAt: isoOrNull(row.expires_at),
  };
}

function mapPreviewToken(row: QueryRow): PreviewToken {
  return {
    id: str(row.id),
    deploymentId: str(row.deployment_id),
    tokenHash: str(row.token_hash),
    exp: iso(row.exp),
    revoked: Boolean(row.revoked),
    createdAt: iso(row.created_at),
  };
}

function mapCapacity(v: unknown): FleetCapacity {
  const c = json(v);
  return {
    slotsTotal: num(c.slotsTotal, 0),
    slotsUsed: num(c.slotsUsed, 0),
    cpuMillis: num(c.cpuMillis, 0),
    memMb: num(c.memMb, 0),
  };
}

function mapFleetNode(row: QueryRow): FleetNode {
  return {
    id: str(row.id),
    tenantId: strOrNull(row.tenant_id),
    kind: str(row.kind) as FleetNodeKind,
    status: str(row.status) as FleetNode['status'],
    capacity: mapCapacity(row.capacity),
    manifest: json(row.manifest),
    lastSeen: iso(row.last_seen),
    createdAt: iso(row.created_at),
  };
}

function mapDnsRecords(v: unknown): DnsRecord[] {
  return jsonArray(v)
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      type: str(r.type) as DnsRecord['type'],
      name: str(r.name),
      value: str(r.value),
    }));
}

function mapDomain(row: QueryRow): DomainRecord {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    hostname: str(row.hostname),
    verificationStatus: str(row.verification_status) as DomainVerificationStatus,
    dnsRecords: mapDnsRecords(row.dns_records),
    tlsStatus: str(row.tls_status) as TlsStatus,
    createdAt: iso(row.created_at),
  };
}

function mapMeshEndpoint(row: QueryRow): MeshEndpoint {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    service: str(row.service),
    zitiIdentity: strOrNull(row.ziti_identity),
    xdsCluster: strOrNull(row.xds_cluster),
    status: str(row.status) as MeshEndpoint['status'],
    registeredAt: iso(row.registered_at),
    metadata: json(row.metadata),
  };
}

// --- repositories ---

function createTenantRepository(qx: QueryExecutor): TenantRepository {
  return {
    isAvailable: () => qx.isAvailable(),
    async upsert(input: TenantUpsert): Promise<Tenant> {
      const rows = await qx.execute<QueryRow>(
        `INSERT INTO cloud_tenants
           (id, org_id, owner_user_id, tier, isolation_level, region, quota, updated_at)
         VALUES (:id, :orgId, :ownerUserId, :tier, :isolationLevel, :region, :quota, now())
         ON CONFLICT (id) DO UPDATE SET
           org_id = excluded.org_id,
           owner_user_id = excluded.owner_user_id,
           tier = excluded.tier,
           isolation_level = excluded.isolation_level,
           region = excluded.region,
           quota = excluded.quota,
           updated_at = now()
         RETURNING *`,
        {
          id: input.id,
          orgId: input.orgId ?? null,
          ownerUserId: input.ownerUserId,
          tier: input.tier,
          isolationLevel: input.isolationLevel,
          region: input.region,
          quota: JSON.stringify(input.quota),
        },
      );
      return mapTenant(rows[0]!);
    },
    async getById(id: string): Promise<Tenant | null> {
      const row = await qx.one<QueryRow>(`SELECT * FROM cloud_tenants WHERE id = :id`, { id });
      return row ? mapTenant(row) : null;
    },
    async getByOwner(ownerUserId: string): Promise<Tenant | null> {
      const row = await qx.one<QueryRow>(
        `SELECT * FROM cloud_tenants WHERE owner_user_id = :ownerUserId AND org_id IS NULL LIMIT 1`,
        { ownerUserId },
      );
      return row ? mapTenant(row) : null;
    },
    async getByOrg(orgId: string): Promise<Tenant | null> {
      const row = await qx.one<QueryRow>(
        `SELECT * FROM cloud_tenants WHERE org_id = :orgId LIMIT 1`,
        { orgId },
      );
      return row ? mapTenant(row) : null;
    },
    async list(): Promise<readonly Tenant[]> {
      const rows = await qx.execute<QueryRow>(`SELECT * FROM cloud_tenants ORDER BY created_at DESC`);
      return rows.map(mapTenant);
    },
  };
}

function createSandboxRepository(qx: QueryExecutor): SandboxRepository {
  return {
    isAvailable: () => qx.isAvailable(),
    async insert(input: SandboxInsert): Promise<Sandbox> {
      const rows = await qx.execute<QueryRow>(
        `INSERT INTO cloud_sandboxes
           (id, tenant_id, user_id, run_id, provider, external_id, status, region, image, resources, expires_at, metadata)
         VALUES
           (:id, :tenantId, :userId, :runId, :provider, :externalId, :status, :region, :image, :resources, :expiresAt, :metadata)
         RETURNING *`,
        {
          id: input.id,
          tenantId: input.tenantId,
          userId: input.userId,
          runId: input.runId ?? null,
          provider: input.provider,
          externalId: input.externalId ?? null,
          status: input.status,
          region: input.region,
          image: input.image ?? null,
          resources: JSON.stringify(input.resources),
          expiresAt: input.expiresAt ?? null,
          metadata: JSON.stringify(input.metadata ?? {}),
        },
      );
      return mapSandbox(rows[0]!);
    },
    async getById(id: string, tenantId: string): Promise<Sandbox | null> {
      const row = await qx.one<QueryRow>(
        `SELECT * FROM cloud_sandboxes WHERE id = :id AND tenant_id = :tenantId`,
        { id, tenantId },
      );
      return row ? mapSandbox(row) : null;
    },
    async updateStatus(id, status, patch): Promise<void> {
      await qx.mutate(
        `UPDATE cloud_sandboxes SET
           status = :status,
           external_id = COALESCE(:externalId, external_id),
           last_heartbeat = COALESCE(:lastHeartbeat, last_heartbeat)
         WHERE id = :id`,
        {
          id,
          status,
          externalId: patch?.externalId ?? null,
          lastHeartbeat: patch?.lastHeartbeat ?? null,
        },
      );
    },
    async listByTenant(tenantId: string): Promise<readonly Sandbox[]> {
      const rows = await qx.execute<QueryRow>(
        `SELECT * FROM cloud_sandboxes WHERE tenant_id = :tenantId ORDER BY created_at DESC`,
        { tenantId },
      );
      return rows.map(mapSandbox);
    },
    async countByTenant(tenantId, statuses): Promise<number> {
      if (statuses.length === 0) return 0;
      const rows = await qx.execute<QueryRow>(
        `SELECT COUNT(*)::int AS n FROM cloud_sandboxes
         WHERE tenant_id = :tenantId AND status = ANY(:statuses)`,
        { tenantId, statuses: [...statuses] },
      );
      return num(rows[0]?.n, 0);
    },
    async listExpired(now: string): Promise<readonly Sandbox[]> {
      const rows = await qx.execute<QueryRow>(
        `SELECT * FROM cloud_sandboxes
         WHERE expires_at IS NOT NULL AND expires_at <= :now
           AND status NOT IN ('reaped', 'stopped')
         ORDER BY expires_at ASC`,
        { now },
      );
      return rows.map(mapSandbox);
    },
  };
}

function createDeploymentRepository(qx: QueryExecutor): DeploymentRepository {
  return {
    isAvailable: () => qx.isAvailable(),
    async insert(input: DeploymentInsert): Promise<Deployment> {
      const rows = await qx.execute<QueryRow>(
        `INSERT INTO cloud_deployments
           (id, tenant_id, sandbox_id, run_id, target, status, commit_sha, preview_base_url, expires_at)
         VALUES
           (:id, :tenantId, :sandboxId, :runId, :target, :status, :commitSha, :previewBaseUrl, :expiresAt)
         RETURNING *`,
        {
          id: input.id,
          tenantId: input.tenantId,
          sandboxId: input.sandboxId ?? null,
          runId: input.runId ?? null,
          target: input.target,
          status: input.status,
          commitSha: input.commitSha ?? null,
          previewBaseUrl: input.previewBaseUrl ?? null,
          expiresAt: input.expiresAt ?? null,
        },
      );
      return mapDeployment(rows[0]!);
    },
    async getById(id: string, tenantId: string): Promise<Deployment | null> {
      const row = await qx.one<QueryRow>(
        `SELECT * FROM cloud_deployments WHERE id = :id AND tenant_id = :tenantId`,
        { id, tenantId },
      );
      return row ? mapDeployment(row) : null;
    },
    async updateStatus(id: string, status: DeploymentStatus): Promise<void> {
      await qx.mutate(`UPDATE cloud_deployments SET status = :status WHERE id = :id`, { id, status });
    },
    async updateHealth(id: string, health: PreviewHealthStatus, checkedAt: string): Promise<void> {
      await qx.mutate(
        `UPDATE cloud_deployments SET health_status = :health, last_health_at = :checkedAt WHERE id = :id`,
        { id, health, checkedAt },
      );
    },
    async countActiveByTenant(tenantId: string): Promise<number> {
      const rows = await qx.execute<QueryRow>(
        `SELECT COUNT(*)::int AS n FROM cloud_deployments
         WHERE tenant_id = :tenantId AND status IN ('building', 'live')`,
        { tenantId },
      );
      return num(rows[0]?.n, 0);
    },
  };
}

function createPreviewTokenRepository(qx: QueryExecutor): PreviewTokenRepository {
  return {
    isAvailable: () => qx.isAvailable(),
    async insert(input: PreviewTokenInsert): Promise<PreviewToken> {
      const rows = await qx.execute<QueryRow>(
        `INSERT INTO cloud_preview_tokens (id, deployment_id, token_hash, exp)
         VALUES (:id, :deploymentId, :tokenHash, :exp)
         RETURNING *`,
        { id: input.id, deploymentId: input.deploymentId, tokenHash: input.tokenHash, exp: input.exp },
      );
      return mapPreviewToken(rows[0]!);
    },
    async listByDeployment(deploymentId: string): Promise<readonly PreviewToken[]> {
      const rows = await qx.execute<QueryRow>(
        `SELECT * FROM cloud_preview_tokens WHERE deployment_id = :deploymentId ORDER BY created_at DESC`,
        { deploymentId },
      );
      return rows.map(mapPreviewToken);
    },
    async revoke(deploymentId: string): Promise<number> {
      return qx.mutate(
        `UPDATE cloud_preview_tokens SET revoked = TRUE WHERE deployment_id = :deploymentId AND revoked = FALSE`,
        { deploymentId },
      );
    },
    async isRevoked(deploymentId: string, now: string): Promise<boolean> {
      const rows = await qx.execute<QueryRow>(
        `SELECT COUNT(*)::int AS n FROM cloud_preview_tokens
         WHERE deployment_id = :deploymentId AND revoked = FALSE AND exp > :now`,
        { deploymentId, now },
      );
      // A deployment is "revoked" (no valid URL) when NO live, unexpired token remains.
      return num(rows[0]?.n, 0) === 0;
    },
  };
}

function createFleetRepository(qx: QueryExecutor): FleetRepository {
  return {
    isAvailable: () => qx.isAvailable(),
    async upsert(input: FleetNodeUpsert): Promise<FleetNode> {
      const rows = await qx.execute<QueryRow>(
        `INSERT INTO cloud_fleet_nodes (id, tenant_id, kind, status, capacity, manifest, last_seen)
         VALUES (:id, :tenantId, :kind, :status, :capacity, :manifest, :lastSeen)
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = excluded.tenant_id,
           kind = excluded.kind,
           status = excluded.status,
           capacity = excluded.capacity,
           -- Preserve the registered manifest when a heartbeat carries none
           -- (manifest is optional): a bare status/last_seen beat sends '{}' and
           -- would otherwise CLOBBER the node's registration to empty every beat.
           -- Only a real (non-empty) manifest overwrites. (recoder-l8lv)
           manifest = CASE
             WHEN excluded.manifest = '{}'::jsonb THEN cloud_fleet_nodes.manifest
             ELSE excluded.manifest
           END,
           last_seen = excluded.last_seen
         RETURNING *`,
        {
          id: input.id,
          tenantId: input.tenantId ?? null,
          kind: input.kind,
          status: input.status,
          capacity: JSON.stringify(input.capacity),
          manifest: JSON.stringify(input.manifest ?? {}),
          lastSeen: input.lastSeen,
        },
      );
      return mapFleetNode(rows[0]!);
    },
    async listByKind(kind: FleetNodeKind): Promise<readonly FleetNode[]> {
      const rows = await qx.execute<QueryRow>(
        `SELECT * FROM cloud_fleet_nodes WHERE kind = :kind ORDER BY last_seen DESC`,
        { kind },
      );
      return rows.map(mapFleetNode);
    },
    async list(): Promise<readonly FleetNode[]> {
      const rows = await qx.execute<QueryRow>(`SELECT * FROM cloud_fleet_nodes ORDER BY last_seen DESC`);
      return rows.map(mapFleetNode);
    },
  };
}

function createDomainRepository(qx: QueryExecutor): DomainRepository {
  return {
    isAvailable: () => qx.isAvailable(),
    async insert(input: DomainInsert): Promise<DomainRecord> {
      const rows = await qx.execute<QueryRow>(
        // The DO UPDATE is guarded so a conflicting hostname owned by ANOTHER
        // tenant NO-OPS (the WHERE fails) instead of overwriting that tenant's
        // config — closes the cross-tenant hijack/DoS race (recoder-4780). A
        // no-op yields an empty RETURNING, handled below.
        `INSERT INTO cloud_domains (id, tenant_id, hostname, verification_status, dns_records, tls_status)
         VALUES (:id, :tenantId, :hostname, :verificationStatus, :dnsRecords, :tlsStatus)
         ON CONFLICT (hostname) DO UPDATE SET
           verification_status = excluded.verification_status,
           dns_records = excluded.dns_records,
           tls_status = excluded.tls_status
         WHERE cloud_domains.tenant_id = excluded.tenant_id
         RETURNING *`,
        {
          id: input.id,
          tenantId: input.tenantId,
          hostname: input.hostname,
          verificationStatus: input.verificationStatus,
          dnsRecords: JSON.stringify(input.dnsRecords),
          tlsStatus: input.tlsStatus,
        },
      );
      const row = rows[0];
      // Empty RETURNING ⇒ the hostname is held by a different tenant and the
      // guarded upsert declined to overwrite it. Surface a truthful conflict
      // rather than crashing on `rows[0]!`.
      if (!row) {
        throw createError(ErrorCode.CONFLICT, 'That hostname is already claimed by another tenant.');
      }
      return mapDomain(row);
    },
    async getById(id: string, tenantId: string): Promise<DomainRecord | null> {
      const row = await qx.one<QueryRow>(
        `SELECT * FROM cloud_domains WHERE id = :id AND tenant_id = :tenantId`,
        { id, tenantId },
      );
      return row ? mapDomain(row) : null;
    },
    async getByHostname(hostname: string): Promise<DomainRecord | null> {
      // Global (cross-tenant) lookup — hostname is unique; used by the service to
      // reject a cross-tenant claim before the guarded upsert. (recoder-4780)
      const row = await qx.one<QueryRow>(
        `SELECT * FROM cloud_domains WHERE hostname = :hostname`,
        { hostname },
      );
      return row ? mapDomain(row) : null;
    },
    async updateVerification(id, status, tls): Promise<void> {
      await qx.mutate(
        `UPDATE cloud_domains SET verification_status = :status, tls_status = :tls WHERE id = :id`,
        { id, status, tls },
      );
    },
    async listByTenant(tenantId: string): Promise<readonly DomainRecord[]> {
      const rows = await qx.execute<QueryRow>(
        `SELECT * FROM cloud_domains WHERE tenant_id = :tenantId ORDER BY created_at DESC`,
        { tenantId },
      );
      return rows.map(mapDomain);
    },
    async delete(id: string, tenantId: string): Promise<boolean> {
      const affected = await qx.mutate(
        `DELETE FROM cloud_domains WHERE id = :id AND tenant_id = :tenantId`,
        { id, tenantId },
      );
      return num(affected, 0) > 0;
    },
  };
}

function createMeshRepository(qx: QueryExecutor): MeshRepository {
  return {
    isAvailable: () => qx.isAvailable(),
    async upsert(input: MeshEndpointUpsert): Promise<MeshEndpoint> {
      const rows = await qx.execute<QueryRow>(
        `INSERT INTO cloud_mesh_endpoints (id, tenant_id, service, ziti_identity, xds_cluster, status, metadata)
         VALUES (:id, :tenantId, :service, :zitiIdentity, :xdsCluster, :status, :metadata)
         ON CONFLICT (id) DO UPDATE SET
           service = excluded.service,
           ziti_identity = excluded.ziti_identity,
           xds_cluster = excluded.xds_cluster,
           status = excluded.status,
           metadata = excluded.metadata
         RETURNING *`,
        {
          id: input.id,
          tenantId: input.tenantId,
          service: input.service,
          zitiIdentity: input.zitiIdentity ?? null,
          xdsCluster: input.xdsCluster ?? null,
          status: input.status,
          metadata: JSON.stringify(input.metadata ?? {}),
        },
      );
      return mapMeshEndpoint(rows[0]!);
    },
    async listByTenant(tenantId: string): Promise<readonly MeshEndpoint[]> {
      const rows = await qx.execute<QueryRow>(
        `SELECT * FROM cloud_mesh_endpoints WHERE tenant_id = :tenantId ORDER BY registered_at DESC`,
        { tenantId },
      );
      return rows.map(mapMeshEndpoint);
    },
    async list(): Promise<readonly MeshEndpoint[]> {
      const rows = await qx.execute<QueryRow>(
        `SELECT * FROM cloud_mesh_endpoints ORDER BY registered_at DESC`,
      );
      return rows.map(mapMeshEndpoint);
    },
  };
}

/** Build the whole cloud repository bundle from one persistence executor. */
export function createCloudRepositories(qx: QueryExecutor): CloudRepositories {
  return {
    tenants: createTenantRepository(qx),
    sandboxes: createSandboxRepository(qx),
    deployments: createDeploymentRepository(qx),
    previewTokens: createPreviewTokenRepository(qx),
    fleet: createFleetRepository(qx),
    domains: createDomainRepository(qx),
    mesh: createMeshRepository(qx),
  };
}
