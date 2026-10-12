/**
 * `CloudComposer` — the composer that fuses the cloud domain into one module. It:
 *  - builds the {@link CloudRepositories} over the Phase-1 persistence executor,
 *  - builds the WORKING {@link TenancyService} (the gate fronting every write),
 *    tightened by the optional Phase-9 billing quota port,
 *  - builds the sandbox adapters (daytona / e2b / resandbox / local-container) + the
 *    {@link SandboxProvisionerService} (quota → select → persist → launch →
 *    RunEvent, with a TTL reaper + reconcile),
 *  - builds the preview signer + target + {@link PreviewDeployService} (real
 *    health probe), the {@link FleetSupervisorService}, and the read-only mesh
 *    diagnostics over the ziti + xDS adapters,
 *  - mounts `/api/agent-os/cloud`, exposes the read-only MCP tools, and reports
 *    truthful, degrade-safe health.
 *
 * No `process.env` reads (config is injected); no top-level singletons. Every
 * path degrades safely: without a DB the repos no-op truthfully and the gate
 * denies; without a provider key the adapters report `down` and provisioning
 * denies; without a signing secret the preview URL mint denies — never a fake.
 */
import { Router } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { CloudConfig } from './config.js';
import { isRecloudDeployConfigured } from './config.js';
import type { CloudGovernanceGatePort } from './ports/governance-gate.port.js';
import type { CloudRepositories } from './ports/cloud-repository.port.js';
import type { SandboxProvider } from './ports/sandbox-provider.port.js';
import { createCloudRepositories } from './repositories/cloud.repository.js';
import {
  createTenancyService,
  type TenancyService,
  type TenantBillingQuotaPort,
} from './services/tenancy.service.js';
import { createDaytonaAdapter } from './adapters/daytona.adapter.js';
import { createE2bAdapter } from './adapters/e2b.adapter.js';
import { createResandboxAdapter } from './adapters/resandbox.adapter.js';
import {
  createLocalContainerAdapter,
  type LocalContainerRuntime,
} from './adapters/local-container.adapter.js';
import { createPreviewUrlSigner } from './services/preview-url-signer.js';
import { createPreviewTarget } from './adapters/preview-target.adapter.js';
import { createRecloudDeployTarget } from './adapters/recloud-deploy.adapter.js';
import {
  createPreviewDeployService,
  type PreviewDeployService,
} from './services/preview-deploy.service.js';
import {
  createSandboxProvisionerService,
  type SandboxProvisionerService,
  type CloudRunEventSink,
} from './services/sandbox-provisioner.service.js';
import {
  createFleetSupervisorService,
  type FleetSupervisorService,
} from './services/fleet-supervisor.service.js';
import {
  createZitiMeshAdapter,
  type ZitiMeshAdapter,
} from './adapters/ziti-mesh.adapter.js';
import { createXdsEnvoyAdapter } from './adapters/xds-envoy.adapter.js';
import { createXdsControlPlaneWriter } from './adapters/xds-control-plane.adapter.js';
import {
  createMeshDiagnosticsService,
  type MeshDiagnosticsService,
} from './services/mesh-diagnostics.service.js';
import {
  createMeshFabricService,
  type MeshFabricService,
} from './services/mesh-fabric.service.js';
import {
  createDomainsService,
  type DomainsService,
  type DomainVerifierPort,
} from './services/domains.service.js';
import { buildCloudRouter } from './routes/cloud.routes.js';
import { buildInternalCloudRouter } from './routes/internal-cloud.routes.js';
import { buildCloudMcpTools } from './mcp/cloud-engine.js';
import { buildCloudWriteMcpTools } from './mcp/cloud-write-engine.js';
import { buildCloudMeshMcpTools } from './mcp/cloud-mesh-engine.js';
import { buildCloudXdsMcpTools } from './mcp/cloud-xds-engine.js';
import { buildCloudHealth } from './health.js';
import type { ProviderId } from './types.js';
import type { CloudModule, CloudModuleDeps } from './index.js';

export class CloudComposer implements CloudModule {
  readonly name = 'cloud' as const;

  private readonly log: Logger;
  private readonly cfg: CloudConfig;
  private readonly middleware: AuthMiddleware;
  /** Phase-3 governance gate (capability token). Absent ⇒ warn-logged auth-only writes. */
  private readonly gate: CloudGovernanceGatePort | undefined;

  private readonly repos: CloudRepositories;
  private readonly tenancyService: TenancyService;
  private readonly providers: Readonly<
    Partial<Record<ProviderId, SandboxProvider>>
  >;
  private readonly provisionerService: SandboxProvisionerService;
  private readonly previewService: PreviewDeployService;
  private readonly fleetService: FleetSupervisorService;
  private readonly meshService: MeshDiagnosticsService;
  /** The ziti overlay adapter, retained so the governed mesh enroll WRITE tool can transport it. */
  private readonly zitiAdapter: ZitiMeshAdapter;
  /** The GOVERNED mesh-fabric write seam (ziti enroll + xds snapshot bump). */
  private readonly meshFabricService: MeshFabricService;
  private readonly domainsService: DomainsService;
  private started = false;

  constructor(
    deps: CloudModuleDeps,
    cfg: CloudConfig,
    executor: QueryExecutor
  ) {
    this.log = deps.logger;
    this.cfg = cfg;
    this.middleware = deps.middleware;
    this.gate = deps.governanceGate;

    // Durable state-of-record over the single persistence executor.
    this.repos = createCloudRepositories(executor);

    // THE gate: tier / isolation / quota / placement, tightened by billing.
    this.tenancyService = createTenancyService({
      repo: this.repos.tenants,
      config: cfg,
      logger: this.log,
      ...(deps.billingQuota ? { billingQuota: deps.billingQuota } : {}),
    });

    // Sandbox provider adapters (degrade-safe — absent key ⇒ `down`).
    this.providers = {
      daytona: createDaytonaAdapter({
        credential: cfg.daytona,
        logger: this.log,
      }),
      e2b: createE2bAdapter({ credential: cfg.e2b, logger: this.log }),
      resandbox: createResandboxAdapter({ credential: cfg.resandbox, logger: this.log }),
      local: createLocalContainerAdapter({
        enabled: cfg.localEnabled,
        logger: this.log,
        ...(deps.localRuntime ? { runtime: deps.localRuntime } : {}),
      }),
    };

    // Read-only mesh diagnostics over the ziti + xDS engine adapters. Built
    // BEFORE the provisioner + preview so the governed mesh-fabric WRITE seam can
    // be fused into both flows. The ziti adapter is retained so the mesh-enroll
    // MCP tool can transport it.
    this.zitiAdapter = createZitiMeshAdapter({
      endpoint: cfg.zitiEndpoint,
      logger: this.log,
    });
    this.meshService = createMeshDiagnosticsService({
      ziti: this.zitiAdapter,
      xds: createXdsEnvoyAdapter({
        endpoint: cfg.xdsEndpoint,
        logger: this.log,
      }),
      logger: this.log,
    });

    // The GOVERNED mesh-fabric write seam: ziti enroll (per sandbox) + the
    // recoder-xds control-plane snapshot bump (per preview edge). The xds writer
    // drives the engine's `POST /network-config`; absent endpoint ⇒ truthful skip.
    this.meshFabricService = createMeshFabricService({
      enroller: this.zitiAdapter,
      xds: createXdsControlPlaneWriter({
        endpoint: cfg.xdsEndpoint,
        logger: this.log,
      }),
      mesh: this.repos.mesh,
      logger: this.log,
      ...(this.gate ? { gate: this.gate } : {}),
    });

    // Provisioner (quota → select → persist → launch → RunEvent + reaper/reconcile).
    // On a successful provision it FUSES the sandbox onto the ziti mesh (governed,
    // best-effort — a mesh miss never blocks the sandbox).
    this.provisionerService = createSandboxProvisionerService({
      repo: this.repos.sandboxes,
      tenancy: this.tenancyService,
      providers: this.providers,
      logger: this.log,
      meshFabric: this.meshFabricService,
      ...(deps.runEvents ? { runEvents: deps.runEvents } : {}),
    });

    // Preview: signer + target + service (real health probe + token ledger). On a
    // successful deploy it FUSES the preview edge onto the mesh (mesh upsert + xds
    // snapshot bump so Envoy fronts it) and can resolve preview-over-overlay.
    const signer = createPreviewUrlSigner(cfg);
    // recloud (Recoder Cloud) is the real deploy backend when configured; otherwise
    // the default target just allocates a preview URL under the base domain.
    const target = isRecloudDeployConfigured(cfg)
      ? createRecloudDeployTarget({ config: cfg, logger: this.log })
      : createPreviewTarget({ config: cfg, logger: this.log });
    this.previewService = createPreviewDeployService({
      repo: this.repos.deployments,
      tokens: this.repos.previewTokens,
      target,
      signer,
      logger: this.log,
      meshFabric: this.meshFabricService,
      mesh: this.repos.mesh,
      overlay: this.meshService,
      tenantOf: (tenantId: string) => this.repos.tenants.getById(tenantId),
    });

    // Fleet capacity supervisor.
    this.fleetService = createFleetSupervisorService({
      repo: this.repos.fleet,
      logger: this.log,
    });

    // Custom-domains CRUD + DNS/TLS verification. The verifier is an optional
    // seam (real DNS/ACME prober); absent ⇒ `verify` truthfully stays pending.
    this.domainsService = createDomainsService({
      repo: this.repos.domains,
      logger: this.log,
      cnameTarget: cfg.previewBaseDomain,
      ...(deps.domainVerifier ? { verifier: deps.domainVerifier } : {}),
    });
  }

  tenancy(): TenancyService {
    return this.tenancyService;
  }

  provisioner(): SandboxProvisionerService {
    return this.provisionerService;
  }

  preview(): PreviewDeployService {
    return this.previewService;
  }

  fleet(): FleetSupervisorService {
    return this.fleetService;
  }

  mesh(): MeshDiagnosticsService {
    return this.meshService;
  }

  domains(): DomainsService {
    return this.domainsService;
  }

  /** The concrete repositories (for cross-domain read wiring; tenant-scoped). */
  repositories(): CloudRepositories {
    return this.repos;
  }

  routes(): Router {
    const router = Router();
    router.use(
      buildCloudRouter({
        tenancy: this.tenancyService,
        provisioner: this.provisionerService,
        preview: this.previewService,
        mesh: this.meshService,
        fleet: this.fleetService,
        domains: this.domainsService,
        mw: this.middleware,
        logger: this.log,
        // Phase-3 governance decide→audit seam guarding EVERY write edge.
        ...(this.gate ? { gate: this.gate } : {}),
        // Solo/desktop fail-open on the cross-tenant mesh/fleet reads.
        soloMode: this.cfg.soloMode,
        // Deny-safe active-preview count over the deployment repo (`NaN` on error).
        activePreviewCount: async (tenantId: string) => {
          if (!this.repos.deployments.isAvailable()) return Number.NaN;
          return this.repos.deployments.countActiveByTenant(tenantId);
        },
      })
    );
    return router;
  }

  /** The `/internal/cloud/*` router (INTERNAL_SERVICE_KEY-gated network-config view). */
  internalRoutes(): Router {
    return buildInternalCloudRouter({
      mesh: this.repos.mesh,
      meshDiagnostics: this.meshService,
      middleware: this.middleware,
      logger: this.log,
    });
  }

  /** The GOVERNED mesh-fabric write seam (ziti enroll + xds snapshot bump). */
  meshFabric(): MeshFabricService {
    return this.meshFabricService;
  }

  mcp(): readonly McpToolRegistration[] {
    return [
      ...buildCloudMcpTools(this, this.cfg.soloMode),
      // Governance-gated WRITE tools (provision/destroy sandbox, domain CRUD) —
      // the same `decide → audit` gate the HTTP edges use (defence in depth).
      ...buildCloudWriteMcpTools({
        tenancy: this.tenancyService,
        provisioner: this.provisionerService,
        domains: this.domainsService,
        preview: this.previewService,
        logger: this.log,
        ...(this.gate ? { gate: this.gate } : {}),
      }),
      // Ziti mesh introspection reads + the ONE governance-gated enrollment WRITE.
      ...buildCloudMeshMcpTools({
        mesh: this.meshService,
        tenancy: this.tenancyService,
        enroller: this.zitiAdapter,
        logger: this.log,
        ...(this.gate ? { gate: this.gate } : {}),
        soloMode: this.cfg.soloMode,
      }),
      // xDS control-plane introspection reads (snapshot/clusters/routes/listeners/
      // endpoints) over the recoder-xds engine — read-only, degrade-safe.
      ...buildCloudXdsMcpTools(this),
    ];
  }

  async health(): Promise<ComponentHealth> {
    return buildCloudHealth({
      tenancy: this.tenancyService,
      provisioner: this.provisionerService,
      preview: this.previewService,
      mesh: this.meshService,
      fleet: this.fleetService,
    });
  }

  /** Boot: start the TTL reaper + fleet supervisor loops; log truthful posture. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.provisionerService.startReaper();
    this.fleetService.startSupervisor();
    this.log.info(
      {
        defaultTier: this.cfg.defaultTier,
        daytonaConfigured: this.cfg.daytona.present,
        e2bConfigured: this.cfg.e2b.present,
        localEnabled: this.cfg.localEnabled,
        previewSigningConfigured: this.cfg.previewSigningSecretPresent,
        zitiConfigured: this.cfg.zitiEndpoint !== null,
        xdsConfigured: this.cfg.xdsEndpoint !== null,
      },
      'cloud module started'
    );
  }

  /** Shutdown: stop the reaper + supervisor. Idempotent, degrade-safe. */
  async stop(): Promise<void> {
    this.provisionerService.stop();
    this.fleetService.stop();
    this.started = false;
  }
}

// Re-export the local runtime + run-event seams so bootstrap can type its bridges.
export type {
  LocalContainerRuntime,
  CloudRunEventSink,
  TenantBillingQuotaPort,
  DomainVerifierPort,
};
