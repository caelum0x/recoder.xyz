/**
 * Mesh FUSION tests — prove the networking engines actually FIRE inside the
 * product flows, not just that the fabric compiles:
 *
 *  - a SUCCESSFUL sandbox provision drives the REAL SandboxProvisionerService,
 *    which invokes the REAL MeshFabricService, which enrols a per-sandbox ziti
 *    identity (the enroller.enroll transport fires) + upserts the mesh endpoint;
 *  - a SUCCESSFUL preview deploy drives the REAL PreviewDeployService, which
 *    invokes the REAL MeshFabricService, which bumps the recoder-xds snapshot (the
 *    xds writer registerUpstream transport fires) + upserts the mesh endpoint;
 *  - both are best-effort: a mesh miss NEVER fails the provision / deploy.
 */
import { describe, it, expect } from 'vitest';
import { createSandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import { createPreviewDeployService } from '../services/preview-deploy.service.js';
import { createMeshFabricService } from '../services/mesh-fabric.service.js';
import { createTenancyService } from '../services/tenancy.service.js';
import { sliceCloudConfig } from '../config.js';
import { ok } from '../../../shared/result.js';
import type { Result } from '../../../shared/result.js';
import type { AppError } from '../../../shared/errors.js';
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

describe('FUSION — sandbox provision enrolls onto the ziti mesh', () => {
  it('fires the ziti enroller on a successful provision (per-sandbox identity + mesh endpoint)', async () => {
    const enrolledNames: string[] = [];
    const upserts: MeshEndpointUpsert[] = [];
    const enroller: ZitiMeshEnroller = {
      enroll: async spec => {
        enrolledNames.push(spec.name);
        return {
          ok: true,
          identity: {
            id: `id-${spec.name}`,
            name: spec.name,
            status: 'registered',
          },
          enrollmentJwt: null,
        };
      },
    };
    const xds: XdsControlPlaneWriter = {
      isConfigured: () => false,
      registerUpstream: async () => ({ ok: false, reason: 'n/a' }),
    };
    const meshFabric = createMeshFabricService({
      enroller,
      xds,
      mesh: memMesh(upserts),
      logger: silentLogger,
    });

    const svc = createSandboxProvisionerService({
      repo: memSandboxRepo(),
      tenancy: tenancyFor(),
      providers: { daytona: upProvider() },
      logger: silentLogger,
      meshFabric,
      reaperIntervalMs: 0,
    });

    const r = await svc.provision({ tenant: tenant(), userId: 'user_1' });
    expect(r.ok).toBe(true);
    // The FUSION fired: a per-sandbox ziti identity was enrolled + registered.
    expect(enrolledNames).toHaveLength(1);
    expect(enrolledNames[0]).toMatch(/^sandbox-/);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.zitiIdentity).toBe(`id-${enrolledNames[0]}`);
  });

  it('still succeeds (best-effort) when the ziti controller is absent', async () => {
    const enroller: ZitiMeshEnroller = {
      enroll: async () => ({
        ok: false,
        reason: 'ziti controller endpoint not configured',
      }),
    };
    const xds: XdsControlPlaneWriter = {
      isConfigured: () => false,
      registerUpstream: async () => ({ ok: false, reason: 'n/a' }),
    };
    const meshFabric = createMeshFabricService({
      enroller,
      xds,
      mesh: memMesh([]),
      logger: silentLogger,
    });
    const svc = createSandboxProvisionerService({
      repo: memSandboxRepo(),
      tenancy: tenancyFor(),
      providers: { daytona: upProvider() },
      logger: silentLogger,
      meshFabric,
      reaperIntervalMs: 0,
    });
    const r = await svc.provision({ tenant: tenant(), userId: 'user_1' });
    expect(r.ok).toBe(true);
  });
});

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

describe('FUSION — preview deploy bumps the xDS snapshot (Envoy fronts the edge)', () => {
  it('fires the xds writer on a successful deploy (mesh endpoint + snapshot version)', async () => {
    const bumped: XdsUpstreamSpec[] = [];
    const upserts: MeshEndpointUpsert[] = [];
    const xds: XdsControlPlaneWriter = {
      isConfigured: () => true,
      registerUpstream: async spec => {
        bumped.push(spec);
        return { ok: true, version: 'v12', clusters: 8, cluster: spec.name };
      },
    };
    const enroller: ZitiMeshEnroller = {
      enroll: async () => ({ ok: false, reason: 'n/a' }),
    };
    const meshFabric = createMeshFabricService({
      enroller,
      xds,
      mesh: memMesh(upserts),
      logger: silentLogger,
    });

    const preview = createPreviewDeployService({
      repo: memDeploymentRepo(),
      tokens: noTokens,
      target: target(),
      signer: noSigner,
      logger: silentLogger,
      meshFabric,
      mesh: memMesh(upserts),
      tenantOf: async () => tenant(),
    });

    const r = await preview.deploy({ tenantId: 'tnt_1', target: 'preview' });
    expect(r.ok).toBe(true);
    // The FUSION fired: the preview edge was registered as an Envoy upstream and
    // the served xDS snapshot was bumped.
    expect(bumped).toHaveLength(1);
    expect(bumped[0]?.name).toBe('preview-dep_1');
    expect(bumped[0]?.host).toBe('dep_1.preview.recoder.xyz');
    expect(bumped[0]?.port).toBe(443);
    expect(
      upserts.some(
        u => u.status === 'active' && u.metadata?.snapshotVersion === 'v12'
      )
    ).toBe(true);
  });

  it('still succeeds (best-effort) when the xds engine is absent', async () => {
    const xds: XdsControlPlaneWriter = {
      isConfigured: () => false,
      registerUpstream: async () => ({ ok: false, reason: 'xds absent' }),
    };
    const enroller: ZitiMeshEnroller = {
      enroll: async () => ({ ok: false, reason: 'n/a' }),
    };
    const meshFabric = createMeshFabricService({
      enroller,
      xds,
      mesh: memMesh([]),
      logger: silentLogger,
    });
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
    const r = await preview.deploy({ tenantId: 'tnt_1', target: 'preview' });
    expect(r.ok).toBe(true);
  });
});
