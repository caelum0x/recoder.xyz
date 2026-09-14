/**
 * Cloud domain value types — the off-box substrate vocabulary.
 *
 * This domain owns the shapes for remote sandboxes, preview deployments, signed
 * preview URLs, multi-tenancy (tier / isolation / region / quota), the fleet
 * supervisor manifest, custom domains, and the mesh registry. Provider transport
 * shapes are reused from `@recoder/agent-sandbox`; what lives here is the
 * Postgres state-of-record projection + the cross-domain seams other domains
 * (conductor, agent-os, edge, observability) compile against.
 *
 * FROZEN NOTE: `Tenant`, `TenantTier`, `TenantQuota`, and the quota/placement
 * decision envelopes are the load-bearing tenancy seams the sandbox provisioner
 * and preview deploy service gate on. Widening them is a cross-domain migration,
 * not a local edit.
 */

// --- Providers ---

/**
 * The sandbox providers, in default degrade preference order. `resandbox` is the
 * self-hosted Recoder Sandbox (our E2B fork) — E2B-compatible REST against our own
 * host; preferred over the hosted `e2b` when its base URL is configured.
 */
export type ProviderId = 'daytona' | 'resandbox' | 'e2b' | 'local';

/** All providers, for iteration (catalog/health/tests). */
export const PROVIDER_IDS: readonly ProviderId[] = ['daytona', 'resandbox', 'e2b', 'local'] as const;

// --- Tenancy (multi-tenant isolation + quota) ---

/**
 * The deployment/isolation tier a tenant runs under. This is DISTINCT from the
 * billing plan tier (`free|pro|team|max|enterprise`): it decides *where* a
 * capability provisions (self-host = the user's own box; cloud/teams = off-box),
 * not what features the subject pays for. Placement + provider selection key off
 * this; billing entitlements only *lower* the effective quota.
 */
export type TenantTier = 'self-host' | 'cloud' | 'teams';

/** All tenant tiers, lowest→highest capability. */
export const TENANT_TIERS: readonly TenantTier[] = ['self-host', 'cloud', 'teams'] as const;

/** How strongly a tenant's workloads are isolated from other tenants'. */
export type IsolationLevel = 'shared' | 'dedicated' | 'isolated';

export const ISOLATION_LEVELS: readonly IsolationLevel[] = ['shared', 'dedicated', 'isolated'] as const;

/**
 * The per-tenant resource ceilings enforced BEFORE any provider call. `0` means
 * "unlimited" for a count cap (self-host is bounded by the machine, not policy).
 * The `cpuMillis`/`memMb` caps are per-sandbox resource requests.
 */
export interface TenantQuota {
  /** Total sandboxes a tenant may hold across all states (`0` = unlimited). */
  readonly maxSandboxes: number;
  /** Concurrently *running* sandboxes (`0` = unlimited). */
  readonly maxConcurrent: number;
  /** Active preview deployments (`0` = unlimited). */
  readonly maxPreview: number;
  /** Per-sandbox CPU request cap (milli-cores). */
  readonly cpuMillis: number;
  /** Per-sandbox memory request cap (MiB). */
  readonly memMb: number;
}

/** A resolved tenant record (state-of-record; `cloud_tenants`). */
export interface Tenant {
  readonly id: string;
  /** Org scope when the tenant is an organization; `null` for a personal tenant. */
  readonly orgId: string | null;
  readonly ownerUserId: string;
  readonly tier: TenantTier;
  readonly isolationLevel: IsolationLevel;
  readonly region: string;
  readonly quota: TenantQuota;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The metered resource kinds tenancy gates a provision/deploy against. */
export type CloudQuotaKind = 'sandbox' | 'concurrent' | 'preview';

export const CLOUD_QUOTA_KINDS: readonly CloudQuotaKind[] = ['sandbox', 'concurrent', 'preview'] as const;

/**
 * A quota headroom decision. Deny-first (fail-safe law §37): any uncertainty
 * resolves to `allowed:false` with a machine reason, never an optimistic allow.
 */
export interface CloudQuotaDecision {
  readonly allowed: boolean;
  readonly kind: CloudQuotaKind;
  /** The effective ceiling (`0` = unlimited). */
  readonly limit: number;
  /** Current usage counted against the window. */
  readonly used: number;
  /** Units left before the ceiling (`Number.MAX_SAFE_INTEGER` when unlimited). */
  readonly remaining: number;
  /** Machine reason when denied (`quota_exceeded` | `usage_unknown`). */
  readonly reason?: 'quota_exceeded' | 'usage_unknown';
}

/** Where a tenant's workloads land. */
export type PlacementTarget = 'local' | 'cloud';

/** The self-host-vs-cloud routing decision for a tenant. */
export interface Placement {
  readonly target: PlacementTarget;
  /** Ordered provider preference the provisioner filters by availability. */
  readonly providerCandidates: readonly ProviderId[];
  readonly region: string;
  readonly isolationLevel: IsolationLevel;
}

// --- Sandboxes (state-of-record) ---

export type SandboxStatus = 'pending' | 'running' | 'stopped' | 'error' | 'reaped';

export const SANDBOX_STATUSES: readonly SandboxStatus[] = [
  'pending',
  'running',
  'stopped',
  'error',
  'reaped',
] as const;

/** Per-sandbox resource request (bounded by the tenant quota caps). */
export interface SandboxResources {
  readonly cpuMillis: number;
  readonly memMb: number;
}

/** A sandbox row — the Postgres state-of-record for a remote worktree. */
export interface Sandbox {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  /** The agent-os Run this sandbox backs, when launched by a run. */
  readonly runId: string | null;
  readonly provider: ProviderId;
  /** The provider's own id for the sandbox (`null` until provisioned). */
  readonly externalId: string | null;
  readonly status: SandboxStatus;
  readonly region: string;
  readonly image: string | null;
  readonly resources: SandboxResources;
  readonly createdAt: string;
  /** TTL — reaped when passed (`null` = no expiry). */
  readonly expiresAt: string | null;
  readonly lastHeartbeat: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

// --- Deployments + signed preview URLs ---

/** Where a preview artifact is deployed. */
export type DeployTargetKind = 'preview' | 'sandbox' | 'static' | 'container';

export const DEPLOY_TARGET_KINDS: readonly DeployTargetKind[] = [
  'preview',
  'sandbox',
  'static',
  'container',
] as const;

export type DeploymentStatus = 'building' | 'live' | 'failed' | 'expired';

/** Truthful preview health — never inferred from a bare 200. */
export type PreviewHealthStatus = 'unknown' | 'healthy' | 'unhealthy';

/** A deployment row — a run artifact promoted to a preview target. */
export interface Deployment {
  readonly id: string;
  readonly tenantId: string;
  readonly sandboxId: string | null;
  readonly runId: string | null;
  readonly target: DeployTargetKind;
  readonly status: DeploymentStatus;
  readonly commitSha: string | null;
  readonly previewBaseUrl: string | null;
  readonly healthStatus: PreviewHealthStatus;
  readonly lastHealthAt: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
}

/** The claims minted into a signed preview URL (HMAC subject). */
export interface PreviewUrlClaims {
  readonly deploymentId: string;
  readonly tenantId: string;
  /** Unix seconds the token expires. */
  readonly exp: number;
}

/** A minted signed preview URL + its claims. */
export interface SignedPreviewUrl {
  readonly url: string;
  readonly token: string;
  readonly claims: PreviewUrlClaims;
}

/** A persisted preview token (revocation + audit; `cloud_preview_tokens`). */
export interface PreviewToken {
  readonly id: string;
  readonly deploymentId: string;
  /** sha256 of the issued token (never the raw token). */
  readonly tokenHash: string;
  readonly exp: string;
  readonly revoked: boolean;
  readonly createdAt: string;
}

// --- Fleet supervisor ---

export type FleetNodeKind = 'sandbox' | 'preview' | 'mesh';

export type FleetNodeStatus = 'up' | 'down' | 'draining';

/** Capacity accounting for a fleet node (slots + resource envelope). */
export interface FleetCapacity {
  readonly slotsTotal: number;
  readonly slotsUsed: number;
  readonly cpuMillis: number;
  readonly memMb: number;
}

/** A cloud capacity node (sandbox pool / preview runner / mesh endpoint). */
export interface FleetNode {
  readonly id: string;
  /** `null` = shared pool (not tenant-pinned). */
  readonly tenantId: string | null;
  readonly kind: FleetNodeKind;
  readonly status: FleetNodeStatus;
  readonly capacity: FleetCapacity;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly lastSeen: string;
  readonly createdAt: string;
}

// --- Custom domains / DNS ---

export type DomainVerificationStatus = 'pending' | 'verified' | 'failed';

export type TlsStatus = 'none' | 'pending' | 'active';

/** An expected DNS record for custom-domain verification. */
export interface DnsRecord {
  readonly type: 'TXT' | 'CNAME' | 'A';
  readonly name: string;
  readonly value: string;
}

/** A custom domain row (`cloud_domains`). */
export interface DomainRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly hostname: string;
  readonly verificationStatus: DomainVerificationStatus;
  readonly dnsRecords: readonly DnsRecord[];
  readonly tlsStatus: TlsStatus;
  readonly createdAt: string;
}

// --- Mesh registry (registered, no live data plane yet) ---

export type MeshEndpointStatus = 'registered' | 'active' | 'down';

/** A mesh endpoint registration (ziti identity + xds cluster; status only). */
export interface MeshEndpoint {
  readonly id: string;
  readonly tenantId: string;
  readonly service: string;
  readonly zitiIdentity: string | null;
  readonly xdsCluster: string | null;
  readonly status: MeshEndpointStatus;
  readonly registeredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}
