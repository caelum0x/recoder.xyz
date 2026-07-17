/**
 * The repository interfaces this domain DECLARES; the concrete impl over the
 * persistence `QueryExecutor` is injected (`repositories/cloud.repository.ts`).
 *
 * Every table carries `tenant_id` and is accessed app-layer-scoped
 * (`WHERE tenant_id = :tenantId` — NO Supabase RLS). All access is parameterized
 * `:param` SQL. Each repo exposes an `isAvailable()` the services read for the
 * fail-safe DENY path (repo down ⇒ deny/zero-headroom, never optimistic allow).
 */
import type {
  Deployment,
  DeploymentStatus,
  DomainRecord,
  DomainVerificationStatus,
  FleetNode,
  FleetNodeKind,
  MeshEndpoint,
  PreviewHealthStatus,
  PreviewToken,
  Sandbox,
  SandboxStatus,
  Tenant,
  TenantQuota,
  TenantTier,
  TlsStatus,
} from '../types.js';

/** Input to create/replace a tenant row (id + owner are the identity). */
export interface TenantUpsert {
  readonly id: string;
  readonly orgId?: string | null;
  readonly ownerUserId: string;
  readonly tier: TenantTier;
  readonly isolationLevel: Tenant['isolationLevel'];
  readonly region: string;
  readonly quota: TenantQuota;
}

export interface TenantRepository {
  isAvailable(): boolean;
  upsert(input: TenantUpsert): Promise<Tenant>;
  getById(id: string): Promise<Tenant | null>;
  /** Resolve the tenant a user owns directly (personal tenant); `null` when none. */
  getByOwner(ownerUserId: string): Promise<Tenant | null>;
  /** Resolve an org's tenant; `null` when none. */
  getByOrg(orgId: string): Promise<Tenant | null>;
  list(): Promise<readonly Tenant[]>;
}

/** Input to persist a sandbox BEFORE the provider launches (survivability). */
export interface SandboxInsert {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly runId?: string | null;
  readonly provider: Sandbox['provider'];
  readonly externalId?: string | null;
  readonly status: SandboxStatus;
  readonly region: string;
  readonly image?: string | null;
  readonly resources: Sandbox['resources'];
  readonly expiresAt?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SandboxRepository {
  isAvailable(): boolean;
  insert(input: SandboxInsert): Promise<Sandbox>;
  getById(id: string, tenantId: string): Promise<Sandbox | null>;
  updateStatus(
    id: string,
    status: SandboxStatus,
    patch?: { externalId?: string | null; lastHeartbeat?: string | null },
  ): Promise<void>;
  listByTenant(tenantId: string): Promise<readonly Sandbox[]>;
  /** Count sandboxes for a tenant in the given states (quota accounting). */
  countByTenant(tenantId: string, statuses: readonly SandboxStatus[]): Promise<number>;
  /** Sandboxes whose TTL has passed and are not yet reaped (the reaper source). */
  listExpired(now: string): Promise<readonly Sandbox[]>;
}

export interface DeploymentInsert {
  readonly id: string;
  readonly tenantId: string;
  readonly sandboxId?: string | null;
  readonly runId?: string | null;
  readonly target: Deployment['target'];
  readonly status: DeploymentStatus;
  readonly commitSha?: string | null;
  readonly previewBaseUrl?: string | null;
  readonly expiresAt?: string | null;
}

export interface DeploymentRepository {
  isAvailable(): boolean;
  insert(input: DeploymentInsert): Promise<Deployment>;
  getById(id: string, tenantId: string): Promise<Deployment | null>;
  updateStatus(id: string, status: DeploymentStatus): Promise<void>;
  updateHealth(id: string, health: PreviewHealthStatus, checkedAt: string): Promise<void>;
  /** Count active (`building|live`) preview deployments for a tenant (quota). */
  countActiveByTenant(tenantId: string): Promise<number>;
}

export interface PreviewTokenInsert {
  readonly id: string;
  readonly deploymentId: string;
  readonly tokenHash: string;
  readonly exp: string;
}

export interface PreviewTokenRepository {
  isAvailable(): boolean;
  insert(input: PreviewTokenInsert): Promise<PreviewToken>;
  listByDeployment(deploymentId: string): Promise<readonly PreviewToken[]>;
  revoke(deploymentId: string): Promise<number>;
  /** True when ANY non-revoked, unexpired token exists for the deployment. */
  isRevoked(deploymentId: string, now: string): Promise<boolean>;
}

export interface FleetNodeUpsert {
  readonly id: string;
  readonly tenantId?: string | null;
  readonly kind: FleetNodeKind;
  readonly status: FleetNode['status'];
  readonly capacity: FleetNode['capacity'];
  readonly manifest?: Readonly<Record<string, unknown>>;
  readonly lastSeen: string;
}

export interface FleetRepository {
  isAvailable(): boolean;
  upsert(input: FleetNodeUpsert): Promise<FleetNode>;
  listByKind(kind: FleetNodeKind): Promise<readonly FleetNode[]>;
  list(): Promise<readonly FleetNode[]>;
}

export interface DomainInsert {
  readonly id: string;
  readonly tenantId: string;
  readonly hostname: string;
  readonly verificationStatus: DomainVerificationStatus;
  readonly dnsRecords: DomainRecord['dnsRecords'];
  readonly tlsStatus: TlsStatus;
}

export interface DomainRepository {
  isAvailable(): boolean;
  insert(input: DomainInsert): Promise<DomainRecord>;
  getById(id: string, tenantId: string): Promise<DomainRecord | null>;
  updateVerification(id: string, status: DomainVerificationStatus, tls: TlsStatus): Promise<void>;
  listByTenant(tenantId: string): Promise<readonly DomainRecord[]>;
  /** Delete a tenant-scoped domain; returns `true` when a row was removed. */
  delete(id: string, tenantId: string): Promise<boolean>;
}

export interface MeshEndpointUpsert {
  readonly id: string;
  readonly tenantId: string;
  readonly service: string;
  readonly zitiIdentity?: string | null;
  readonly xdsCluster?: string | null;
  readonly status: MeshEndpoint['status'];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MeshRepository {
  isAvailable(): boolean;
  upsert(input: MeshEndpointUpsert): Promise<MeshEndpoint>;
  listByTenant(tenantId: string): Promise<readonly MeshEndpoint[]>;
  list(): Promise<readonly MeshEndpoint[]>;
}

/** The whole repository bundle the composer wires from one executor. */
export interface CloudRepositories {
  readonly tenants: TenantRepository;
  readonly sandboxes: SandboxRepository;
  readonly deployments: DeploymentRepository;
  readonly previewTokens: PreviewTokenRepository;
  readonly fleet: FleetRepository;
  readonly domains: DomainRepository;
  readonly mesh: MeshRepository;
}
