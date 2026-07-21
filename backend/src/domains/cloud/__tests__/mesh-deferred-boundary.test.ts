/**
 * DEFERRED networking-boundary regression lock. The ziti + recoder-xds write
 * seams are SHIPPED and WIRED end-to-end (SandboxProvisionerService.enrollOnMesh
 * → MeshFabricService.enrollSandbox; PreviewDeployService.frontOnMesh →
 * MeshFabricService.registerPreviewEdge), but per OWNER DECISION 7 the mesh stays
 * cloud-tier-deferred: `ZITI_ENDPOINT` / `XDS_ENDPOINT` are withheld until the
 * cloud/teams launch, so there is NO live data plane yet.
 *
 * This test pins that intentional deferral so a future edit cannot silently flip
 * on a mesh with no consumer, AND proves the deferral degrades TRUTHFULLY:
 *
 *   1. the activation switch is OFF by default — `sliceCloudConfig({})` yields
 *      `zitiEndpoint === null` AND `xdsEndpoint === null`;
 *   2. the real adapters built from that null default are unconfigured, report
 *      `down`, and make NO network egress (the injected `fetchLike` is never
 *      called — nothing wakes a controller / control plane pre-launch);
 *   3. with the endpoints null the shipped write seams return a truthful
 *      `{ …:false, reason, degraded }` SKIP and the sandbox provision / preview
 *      deploy STILL succeed — the deferred mesh NEVER blocks the run;
 *   4. mesh diagnostics report `down` / empty truthfully when unconfigured;
 *   5. with a CONFIGURED endpoint (fake adapter) the fusion fires: enroll runs on
 *      provision and `registerUpstream` bumps a snapshot version that is sealed as
 *      governed audit evidence — proving activation is a single endpoint flip, no
 *      code change.
 */
import { describe, it, expect } from 'vitest';
import { createSandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import { createPreviewDeployService } from '../services/preview-deploy.service.js';
import { createMeshFabricService } from '../services/mesh-fabric.service.js';
import { createMeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import { createTenancyService } from '../services/tenancy.service.js';
import { createZitiMeshAdapter } from '../adapters/ziti-mesh.adapter.js';
import { createXdsEnvoyAdapter } from '../adapters/xds-envoy.adapter.js';
import { createXdsControlPlaneWriter } from '../adapters/xds-control-plane.adapter.js';
import { sliceCloudConfig } from '../config.js';
import { ok } from '../../../shared/result.js';
import type { Result } from '../../../shared/result.js';
import type { AppError } from '../../../shared/errors.js';
import type { FetchLike } from '../adapters/http.js';
import type { SandboxProvider } from '../ports/sandbox-provider.port.js';
import type {
  DeploymentRepository,
  MeshRepository,
  MeshEndpointUpsert,
  PreviewTokenRepository,
  SandboxRepository,
  SandboxInsert,
  DeploymentInsert,
} from '../ports/cloud-repository.port.js';
import type { DeployTarget, DeployInput } from '../ports/deploy-target.port.js';
import type {
  ZitiMeshEnroller,
  XdsControlPlaneWriter,
  XdsUpstreamSpec,
} from '../ports/mesh-write.port.js';
import type { CloudGovernanceGatePort } from '../ports/governance-gate.port.js';
import type { GateVerdict } from '../../governance/types.js';
import type { PreviewUrlSigner } from '../services/preview-url-signer.js';
import type { Deployment, Sandbox, SandboxStatus, Tenant } from '../types.js';
import type { Logger } from '../../../shared/logger.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<
  typeof sliceCloudConfig
>[0];
const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Logger;

function tenant(): Tenant {
  const cfg = sliceCloudConfig(appConfig, { daytona: { apiKey: 'dt_live' } });
  return {
    id: 'tnt_1',
    orgId: null,
    ownerUserId: 'user_1',
    tier: 'cloud',
    isolationLevel: 'dedicated',
    region: 'us-east',
    quota: cfg.tierQuotas.cloud,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  };
}

function sandbox(): Sandbox {
  return {
    id: 'sb_1',
    tenantId: 'tnt_1',
    userId: 'user_1',
    runId: null,
    provider: 'daytona',
    externalId: 'ext_1',
    status: 'running',
    region: 'us-east',
    image: null,
    resources: { cpuMillis: 1000, memMb: 1024 },
    createdAt: '2026-07-19T00:00:00.000Z',
    expiresAt: null,
    lastHeartbeat: null,
    metadata: {},
  };
}

function deployment(): Deployment {
  return {
    id: 'dep_1',
    tenantId: 'tnt_1',
    sandboxId: 'sb_1',
    runId: null,
    target: 'preview',
    status: 'live',
    commitSha: null,
    previewBaseUrl: 'https://dep_1.preview.recoder.xyz',
    healthStatus: 'unknown',
    lastHealthAt: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    expiresAt: null,
  };
}

function tenancyFor() {
  return createTenancyService({
    repo: { isAvailable: () => true } as unknown as Parameters<
      typeof createTenancyService
    >[0]['repo'],
    config: sliceCloudConfig(appConfig, { daytona: { apiKey: 'dt_live' } }),
    logger: silentLogger,
  });
}

function memSandboxRepo(): SandboxRepository {
  const rows = new Map<string, Sandbox>();
  return {
    isAvailable: () => true,
    async insert(input: SandboxInsert) {
      const row: Sandbox = {
        id: input.id,
        tenantId: input.tenantId,
        userId: input.userId,
        runId: input.runId ?? null,
        provider: input.provider,
        externalId: input.externalId ?? null,
        status: input.status,
        region: input.region,
        image: input.image ?? null,
        resources: input.resources,
        createdAt: '2026-07-19T00:00:00.000Z',
        expiresAt: input.expiresAt ?? null,
        lastHeartbeat: null,
        metadata: input.metadata ?? {},
      };
      rows.set(row.id, row);
      return row;
    },
    async getById(id, tenantId) {
      const r = rows.get(id);
      return r && r.tenantId === tenantId ? r : null;
    },
    async updateStatus(id, status, patch) {
      const r = rows.get(id);
      if (r)
        rows.set(id, {
          ...r,
          status,
          externalId: patch?.externalId ?? r.externalId,
          lastHeartbeat: patch?.lastHeartbeat ?? r.lastHeartbeat,
        });
    },
    async listByTenant(tenantId) {
      return [...rows.values()].filter(r => r.tenantId === tenantId);
    },
    async countByTenant() {
      return 0;
    },
    async listExpired() {
      return [];
    },
  };
}

function memMesh(upserts: MeshEndpointUpsert[]): MeshRepository {
  return {
    isAvailable: () => true,
    async upsert(input) {
      upserts.push(input);
      return {
        id: input.id,
        tenantId: input.tenantId,
        service: input.service,
        zitiIdentity: input.zitiIdentity ?? null,
        xdsCluster: input.xdsCluster ?? null,
        status: input.status,
        registeredAt: '2026-07-19T00:00:00.000Z',
        metadata: input.metadata ?? {},
      };
    },
    async listByTenant() {
      return [];
    },
    async list() {
      return [];
    },
  };
}

function memDeploymentRepo(): DeploymentRepository {
  const rows = new Map<string, Deployment>();
  return {
    isAvailable: () => true,
    async insert(input: DeploymentInsert) {
      const row: Deployment = {
        id: input.id,
        tenantId: input.tenantId,
        sandboxId: input.sandboxId ?? null,
        runId: input.runId ?? null,
        target: input.target,
        status: input.status,
        commitSha: input.commitSha ?? null,
        previewBaseUrl: input.previewBaseUrl ?? null,
        healthStatus: 'unknown',
        lastHealthAt: null,
        createdAt: '2026-07-19T00:00:00.000Z',
        expiresAt: input.expiresAt ?? null,
      };
      rows.set(row.id, row);
      return row;
    },
    async getById(id, tenantId) {
      const r = rows.get(id);
      return r && r.tenantId === tenantId ? r : null;
    },
    async updateStatus() {},
    async updateHealth() {},
    async countActiveByTenant() {
      return 0;
    },
  };
}

function upProvider(): SandboxProvider {
  return {
    id: 'daytona',
    availability: async () => ({ provider: 'daytona', status: 'up' }),
    provision: async () =>
      ok({
        provider: 'daytona',
        externalId: 'ext_1',
        status: 'running' as SandboxStatus,
      }),
    get: async () =>
      ok({
        provider: 'daytona',
        externalId: 'ext_1',
        status: 'running' as SandboxStatus,
      }),
    destroy: async () => ok(undefined),
  };
}

const noTokens = {
  isAvailable: () => true,
} as unknown as PreviewTokenRepository;
const noSigner = { isConfigured: () => false } as unknown as PreviewUrlSigner;

function target(): DeployTarget {
  return {
    kind: 'preview',
    available: async () => true,
    deploy: async (input: DeployInput): Promise<Result<Deployment, AppError>> =>
      ok({
        id: 'dep_1',
        tenantId: input.tenantId,
        sandboxId: input.sandboxId ?? null,
        runId: input.runId ?? null,
        target: input.target,
        status: 'live',
        commitSha: input.commitSha ?? null,
        previewBaseUrl: 'https://dep_1.preview.recoder.xyz',
        healthStatus: 'unknown',
        lastHealthAt: null,
        createdAt: '2026-07-19T00:00:00.000Z',
        expiresAt: null,
      }),
    probe: async d => ({
      deploymentId: d.id,
      status: 'unknown',
      httpStatus: null,
      checkedAt: '2026-07-19T00:00:00.000Z',
    }),
  };
}

/** A `FetchLike` that records every call — used to prove ZERO egress pre-launch. */
function countingFetch(): { fetch: FetchLike; calls: () => number } {
  let calls = 0;
  return {
    fetch: async () => {
      calls += 1;
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
    },
    calls: () => calls,
  };
}

// --- 1. The activation switch defaults OFF (owner decision 7) --------------

describe('deferred networking boundary — the activation switch is off by default', () => {
  it('sliceCloudConfig({}) yields BOTH mesh endpoints null (no accidental data plane)', () => {
    const cfg = sliceCloudConfig(appConfig, {});
    expect(cfg.zitiEndpoint).toBeNull();
    expect(cfg.xdsEndpoint).toBeNull();
  });
});

// --- 2. Real adapters from the null default are unconfigured + no egress ----

describe('deferred networking boundary — adapters built from the null default make no egress', () => {
  it('the xds control-plane WRITER is unconfigured and never touches the network', async () => {
    const cfg = sliceCloudConfig(appConfig, {});
    const spy = countingFetch();
    const writer = createXdsControlPlaneWriter({
      endpoint: cfg.xdsEndpoint,
      logger: silentLogger,
      fetchLike: spy.fetch,
    });
    expect(writer.isConfigured()).toBe(false);
    const out = await writer.registerUpstream({
      name: 'preview-x',
      host: 'h',
      port: 8080,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/not configured/);
    expect(spy.calls()).toBe(0);
  });

  it('the ziti adapter reports down (source named) and never touches the network', async () => {
    const cfg = sliceCloudConfig(appConfig, {});
    const spy = countingFetch();
    const ziti = createZitiMeshAdapter({
      endpoint: cfg.zitiEndpoint,
      logger: silentLogger,
      fetchLike: spy.fetch,
    });
    const health = await ziti.status();
    expect(health.status).toBe('down');
    expect(health.reason).toMatch(/not configured/);
    const enrolled = await ziti.enroll({ name: 'edge-1' });
    expect(enrolled.ok).toBe(false);
    expect(spy.calls()).toBe(0);
  });
});

// --- 3. The wired write seams degrade to a truthful SKIP, never blocking ----

describe('deferred networking boundary — the wired seams skip truthfully and never block the run', () => {
  function deferredFabric(upserts: MeshEndpointUpsert[]) {
    const cfg = sliceCloudConfig(appConfig, {});
    return createMeshFabricService({
      enroller: createZitiMeshAdapter({
        endpoint: cfg.zitiEndpoint,
        logger: silentLogger,
        fetchLike: null,
      }),
      xds: createXdsControlPlaneWriter({
        endpoint: cfg.xdsEndpoint,
        logger: silentLogger,
        fetchLike: null,
      }),
      mesh: memMesh(upserts),
      logger: silentLogger,
    });
  }

  it('sandbox provision SUCCEEDS while enrollSandbox degrades truthfully (never enrolled)', async () => {
    const upserts: MeshEndpointUpsert[] = [];
    const meshFabric = deferredFabric(upserts);

    const svc = createSandboxProvisionerService({
      repo: memSandboxRepo(),
      tenancy: tenancyFor(),
      providers: { daytona: upProvider() },
      logger: silentLogger,
      meshFabric,
      reaperIntervalMs: 0,
    });
    const provisioned = await svc.provision({ tenant: tenant(), userId: 'user_1' });
    expect(provisioned.ok).toBe(true);

    // The shipped enroll seam degrades truthfully: skipped, not faked-enrolled.
    const enroll = await meshFabric.enrollSandbox(tenant(), sandbox());
    expect(enroll.enrolled).toBe(false);
    if (!enroll.enrolled) {
      expect(enroll.degraded).toBe(true);
      expect(enroll.blocked).toBeFalsy();
    }
    // No enrolled identity ⇒ no endpoint registration written.
    expect(upserts).toHaveLength(0);
  });

  it('preview deploy SUCCEEDS (DNS host preserved) while the xds edge only records intent', async () => {
    const upserts: MeshEndpointUpsert[] = [];
    const meshFabric = deferredFabric(upserts);

    const preview = createPreviewDeployService({
      repo: memDeploymentRepo(),
      tokens: noTokens,
      target: target(),
      signer: noSigner,
      logger: silentLogger,
      meshFabric,
      mesh: memMesh([]),
      tenantOf: async () => tenant(),
    });
    const deployed = await preview.deploy({ tenantId: 'tnt_1', target: 'preview' });
    expect(deployed.ok).toBe(true);
    // The preview still resolves via its public DNS subdomain — xds only supplements.
    if (deployed.ok)
      expect(deployed.value.previewBaseUrl).toBe('https://dep_1.preview.recoder.xyz');

    // Intent recorded at 'registered'; NEVER faked 'active', NEVER a snapshotVersion.
    expect(upserts.map(u => u.status)).toEqual(['registered']);
    expect(upserts.every(u => u.metadata?.snapshotVersion === undefined)).toBe(true);

    // The shipped edge seam degrades truthfully.
    const edge = await meshFabric.registerPreviewEdge(tenant(), deployment(), {
      host: 'dep_1.preview.recoder.xyz',
      port: 443,
      tls: true,
    });
    expect(edge.fronted).toBe(false);
    if (!edge.fronted) expect(edge.degraded).toBe(true);
  });
});

// --- 4. Diagnostics report down / empty truthfully when unconfigured --------

describe('deferred networking boundary — diagnostics are down/empty (truthful, never faked up)', () => {
  it('reports degraded module health, down status, and empty registrations', async () => {
    const cfg = sliceCloudConfig(appConfig, {});
    const diagnostics = createMeshDiagnosticsService({
      ziti: createZitiMeshAdapter({
        endpoint: cfg.zitiEndpoint,
        logger: silentLogger,
        fetchLike: null,
      }),
      xds: createXdsEnvoyAdapter({
        endpoint: cfg.xdsEndpoint,
        logger: silentLogger,
        fetchLike: null,
      }),
      logger: silentLogger,
    });
    expect((await diagnostics.moduleHealth()).status).toBe('degraded');
    expect((await diagnostics.status()).status).toBe('down');
    expect(await diagnostics.zitiIdentities()).toEqual([]);
    expect(await diagnostics.xdsClusters()).toEqual([]);
  });
});

// --- 5. A configured endpoint (fake adapter) FIRES the fusion + seals evidence

describe('configured networking boundary — activation fires the fusion (single endpoint flip)', () => {
  function allowVerdict(): GateVerdict {
    return {
      verdictId: 'v1',
      requestId: 'r1',
      effect: 'allow',
      tier: 'low',
      reason: 'ok',
      degraded: false,
      engine: 'ts',
      createdAt: '2026-07-19T00:00:00.000Z',
    };
  }

  function allowGate(audits: unknown[]): CloudGovernanceGatePort {
    return {
      decide: async () => allowVerdict(),
      recordAudit: async (entry: unknown) => {
        audits.push(entry);
        return { hash: 'h', sealed: true } as never;
      },
    } as unknown as CloudGovernanceGatePort;
  }

  it('enroll fires on provision and the snapshot bump is sealed as governed audit evidence', async () => {
    const enrolledNames: string[] = [];
    const bumped: XdsUpstreamSpec[] = [];
    const upserts: MeshEndpointUpsert[] = [];
    const audits: unknown[] = [];

    const enroller: ZitiMeshEnroller = {
      enroll: async spec => {
        enrolledNames.push(spec.name);
        return {
          ok: true,
          identity: { id: `id-${spec.name}`, name: spec.name, status: 'registered' },
          enrollmentJwt: null,
        };
      },
    };
    const xds: XdsControlPlaneWriter = {
      isConfigured: () => true,
      registerUpstream: async spec => {
        bumped.push(spec);
        return { ok: true, version: 'v-boundary', clusters: 4, cluster: spec.name };
      },
    };
    const meshFabric = createMeshFabricService({
      enroller,
      xds,
      mesh: memMesh(upserts),
      logger: silentLogger,
      gate: allowGate(audits),
    });

    // (a) enroll fires on a successful provision.
    const svc = createSandboxProvisionerService({
      repo: memSandboxRepo(),
      tenancy: tenancyFor(),
      providers: { daytona: upProvider() },
      logger: silentLogger,
      meshFabric,
      reaperIntervalMs: 0,
    });
    const provisioned = await svc.provision({ tenant: tenant(), userId: 'user_1' });
    expect(provisioned.ok).toBe(true);
    expect(enrolledNames).toHaveLength(1);
    expect(enrolledNames[0]).toMatch(/^sandbox-/);

    // (b) registerUpstream bumps the version, sealed into the audit chain as evidence.
    const edge = await meshFabric.registerPreviewEdge(tenant(), deployment(), {
      host: 'dep_1.preview.recoder.xyz',
      port: 443,
      tls: true,
    });
    expect(edge.fronted).toBe(true);
    if (edge.fronted) expect(edge.version).toBe('v-boundary');
    expect(bumped).toHaveLength(1);
    const sealed = audits.find(
      (a): a is { payload: { snapshotVersion?: string } } =>
        typeof a === 'object' &&
        a !== null &&
        (a as { payload?: { snapshotVersion?: string } }).payload?.snapshotVersion ===
          'v-boundary',
    );
    expect(sealed).toBeTruthy();
  });
});
