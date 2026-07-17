/**
 * Cloud domain — public CORE + TENANCY barrel (Phase 10, step 1–3).
 *
 * This exports the FROZEN seams + the working tenancy stack the rest of the
 * backend wires against BEFORE any provider adapter, deploy service, fleet
 * supervisor, or mesh adapter exists:
 *
 *   - domain value types (Sandbox / Deployment / Tenant / FleetNode / …),
 *   - the config slice (provider keys, preview signing secret, tier quotas),
 *   - the four ports (sandbox-provider, deploy-target, mesh, cloud-repository),
 *   - the concrete `CloudRepositories` over the persistence `QueryExecutor`,
 *   - the WORKING `TenancyService` (resolve / ensure / quota / placement) that
 *     gates every downstream cloud write.
 *
 * The provider adapters, sandbox provisioner, preview deploy service, fleet
 * supervisor, mesh diagnostics, the composer (`cloud-module.ts`), routes, and MCP
 * engine land in later Phase-10 steps. Bootstrap wiring (config overrides for
 * provider keys + preview secret, `SandboxProvider`/`PreviewService` injection
 * into conductor/agent-os, route mount, MCP registration, migration apply) is a
 * SERIAL integrate step — see the build report.
 */

// Types (domain vocabulary).
export * from './types.js';

// Config slice (provider keys + preview signing secret + per-tier quotas).
export {
  sliceCloudConfig,
  tierQuota,
  hasCloudProvider,
  isPreviewConfigured,
  cloudConfigSchema,
  DEFAULT_TIER_QUOTAS,
  type CloudConfig,
  type CloudConfigOverrides,
  type CloudProviderCredential,
  type CloudProviderCredentialOverrides,
} from './config.js';

// Ports (frozen cross-domain seams).
export type {
  SandboxProvider,
  ProviderAvailability,
  ProvisionSpec,
  ProviderSandbox,
  ProviderExecInput,
  ProviderExecResult,
} from './ports/sandbox-provider.port.js';
export type {
  DeployTarget,
  PreviewService,
  DeployInput,
  PreviewHealth,
} from './ports/deploy-target.port.js';
export type {
  MeshDiagnostics,
  MeshSnapshot,
  MeshEngineStatus,
  ZitiIdentity,
  XdsCluster,
} from './ports/mesh.port.js';
export type {
  CloudGovernanceGatePort,
  GovernanceAction,
  GateDecisionContext,
  GateVerdict,
} from './ports/governance-gate.port.js';
export type {
  CloudRepositories,
  TenantRepository,
  SandboxRepository,
  DeploymentRepository,
  PreviewTokenRepository,
  FleetRepository,
  DomainRepository,
  MeshRepository,
  TenantUpsert,
  SandboxInsert,
  DeploymentInsert,
  PreviewTokenInsert,
  FleetNodeUpsert,
  DomainInsert,
  MeshEndpointUpsert,
} from './ports/cloud-repository.port.js';

// Persistence (concrete CloudRepositories over QueryExecutor).
export { createCloudRepositories } from './repositories/cloud.repository.js';

// Governance write seam (guard BEFORE a cloud mutation; seal the audit AFTER).
export { guardCloudWrite, recordCloudAudit, type GuardedCloudWrite } from './services/cloud-write-gate.js';

// Tenancy (the WORKING isolation + quota + placement gate).
export {
  createTenancyService,
  quotaDeniedError,
  type TenancyService,
  type TenancyServiceDeps,
  type TenantRef,
  type TenantBillingQuotaPort,
} from './services/tenancy.service.js';

// Sandbox provider adapters (degrade-safe wrappers over the LOCAL port).
export { createDaytonaAdapter, type DaytonaAdapterDeps } from './adapters/daytona.adapter.js';
export { createE2bAdapter, type E2bAdapterDeps } from './adapters/e2b.adapter.js';
export {
  createLocalContainerAdapter,
  type LocalContainerAdapterDeps,
  type LocalContainerRuntime,
} from './adapters/local-container.adapter.js';
export { type FetchLike, type HttpResponse, globalFetch, probe } from './adapters/http.js';

// Sandbox provisioner (quota → select → persist → launch → RunEvent + reaper).
export {
  createSandboxProvisionerService,
  type SandboxProvisionerService,
  type SandboxProvisionerDeps,
  type ProvisionRequest,
  type CloudRunEvent,
  type CloudRunEventSink,
} from './services/sandbox-provisioner.service.js';

// Preview: HMAC signer + deploy target + the deploy service (real health probe).
export { createPreviewUrlSigner, type PreviewUrlSigner } from './services/preview-url-signer.js';
export { createPreviewTarget, type PreviewTargetDeps } from './adapters/preview-target.adapter.js';
export {
  createPreviewDeployService,
  type PreviewDeployService,
  type PreviewDeployServiceDeps,
} from './services/preview-deploy.service.js';

// Fleet supervisor (capacity manifest + heartbeat staleness sweep).
export {
  createFleetSupervisorService,
  type FleetSupervisorService,
  type FleetSupervisorDeps,
} from './services/fleet-supervisor.service.js';

// Mesh: read-only ziti + xDS adapters + the merged diagnostics service.
export { createZitiMeshAdapter, type ZitiMeshAdapter } from './adapters/ziti-mesh.adapter.js';
export { createXdsEnvoyAdapter, type XdsEnvoyAdapter } from './adapters/xds-envoy.adapter.js';
export {
  createMeshDiagnosticsService,
  type MeshDiagnosticsService,
  type MeshDiagnosticsDeps,
} from './services/mesh-diagnostics.service.js';

// Custom domains: CRUD + DNS/TLS verification (verifier is an injected seam).
export {
  createDomainsService,
  type DomainsService,
  type DomainsServiceDeps,
  type DomainVerifierPort,
  type DomainVerifierResult,
} from './services/domains.service.js';

// Governance-gated WRITE MCP tools (sandbox provision/destroy + domain CRUD).
export { buildCloudWriteMcpTools, type CloudWriteMcpDeps } from './mcp/cloud-write-engine.js';

// Composed health.
export { buildCloudHealth, type CloudHealthDeps } from './health.js';

// --- The composed module (factory + public surface) ---

import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { CloudConfigOverrides } from './config.js';
import type { CloudRepositories } from './ports/cloud-repository.port.js';
import type { TenancyService as TenancyServiceType, TenantBillingQuotaPort as TenantBillingQuotaPortType } from './services/tenancy.service.js';
import type { SandboxProvisionerService as SandboxProvisionerServiceType, CloudRunEventSink as CloudRunEventSinkType } from './services/sandbox-provisioner.service.js';
import type { PreviewDeployService as PreviewDeployServiceType } from './services/preview-deploy.service.js';
import type { FleetSupervisorService as FleetSupervisorServiceType } from './services/fleet-supervisor.service.js';
import type { MeshDiagnosticsService as MeshDiagnosticsServiceType } from './services/mesh-diagnostics.service.js';
import type { LocalContainerRuntime as LocalContainerRuntimeType } from './adapters/local-container.adapter.js';
import type { DomainsService as DomainsServiceType, DomainVerifierPort as DomainVerifierPortType } from './services/domains.service.js';
import type { CloudGovernanceGatePort as CloudGovernanceGatePortType } from './ports/governance-gate.port.js';

/**
 * Dependencies injected by bootstrap (after persistence + identity + billing).
 * Optional seams degrade safe: `billingQuota` (Phase-9 entitlement bridge) only
 * tightens quota; `runEvents` bridges sandbox lifecycle to the agent-os emitter;
 * `localRuntime` supplies the self-host container runtime (absent ⇒ local `down`).
 */
export interface CloudModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the durable state-of-record binds to. */
  readonly executor: QueryExecutor;
  /** The composed identity auth middleware the `/api/agent-os/cloud` edges guard with. */
  readonly middleware: AuthMiddleware;
  /** Not-yet-in-AppConfig cloud values (provider keys, preview secret, mesh endpoints). */
  readonly overrides?: CloudConfigOverrides;
  /** Billing entitlement → cloud quota bridge (tightens only; absent ⇒ tenant quota alone). */
  readonly billingQuota?: TenantBillingQuotaPortType;
  /** Sandbox lifecycle RunEvent sink (bridged to agent-os; absent ⇒ dropped). */
  readonly runEvents?: CloudRunEventSinkType;
  /** Self-host container runtime (docker/podman); absent ⇒ local provider `down`. */
  readonly localRuntime?: LocalContainerRuntimeType;
  /** Real DNS/TLS ownership prober for custom domains; absent ⇒ `verify` stays truthfully pending. */
  readonly domainVerifier?: DomainVerifierPortType;
  /**
   * Phase-3 governance gate (`governance.gate()`, injected by bootstrap) guarding
   * EVERY cloud write via `decide → audit` — the conductor/identity pattern.
   * Absent ⇒ warn-logged auth-only writes (degrade-open until the serial wiring
   * lands); PRESENT ⇒ policy is authoritative and an erroring gate fails CLOSED.
   */
  readonly governanceGate?: CloudGovernanceGatePortType;
}

/** The public surface every other domain + the edge consume. */
export interface CloudModule {
  readonly name: 'cloud';
  /** THE tenancy gate: resolve / ensure / quota / placement fronting every write. */
  tenancy(): TenancyServiceType;
  /** The sandbox provisioner (quota-gated provision + destroy + reaper/reconcile). */
  provisioner(): SandboxProvisionerServiceType;
  /** The preview deploy service (deploy + signed URL + REAL health probe). */
  preview(): PreviewDeployServiceType;
  /** The fleet capacity supervisor (manifest + heartbeat staleness). */
  fleet(): FleetSupervisorServiceType;
  /** The read-only mesh diagnostics (ziti + xDS registrations + status). */
  mesh(): MeshDiagnosticsServiceType;
  /** The custom-domains service (CRUD + DNS/TLS verification). */
  domains(): DomainsServiceType;
  /** The concrete repositories (tenant-scoped; for cross-domain read wiring). */
  repositories(): CloudRepositories;
  /** The `/api/agent-os/cloud` router. */
  routes(): Router;
  /** Read-only MCP introspection tools (tenant/sandboxes/preview/mesh/fleet). */
  mcp(): readonly McpToolRegistration[];
  /** Truthful component health (degrade-safe — never a faked `up`). */
  health(): Promise<ComponentHealth>;
  /** Boot hook (starts the TTL reaper + fleet supervisor). Idempotent. */
  start(): Promise<void>;
  /** Shutdown hook (stops the loops). Idempotent, degrade-safe. */
  stop(): Promise<void>;
}

// Value imports last so the type-only imports above form no runtime cycle.
import { CloudComposer } from './cloud-module.js';
import { sliceCloudConfig } from './config.js';

/**
 * Build the cloud module. Synchronous — no engine daemons; adapters are pure TS +
 * HTTPS. Never throws for a missing provider key / preview secret / mesh endpoint:
 * the adapters degrade to `down` and the gate keeps denying (fail-safe law §37).
 */
export function createCloudModule(deps: CloudModuleDeps): CloudModule {
  const cfg = sliceCloudConfig(deps.config, deps.overrides ?? {});
  return new CloudComposer(deps, cfg, deps.executor);
}
