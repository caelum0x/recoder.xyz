/**
 * Mesh-fabric WRITE tests — the GOVERNED networking write seam that fuses a
 * workload onto the mesh. Proves:
 *  - a sandbox enrollment runs the governance `decide` BEFORE the write, enrols a
 *    per-sandbox ziti identity, upserts `cloud_mesh_endpoints`, and seals audit;
 *  - a governance DENY blocks the enroll (the ziti controller is never touched);
 *  - an absent ziti controller degrades TRUTHFULLY (enrolled:false, degraded:true)
 *    — never a faked identity, never a throw;
 *  - a preview edge upserts the endpoint AND bumps the xDS snapshot, returning the
 *    served version as evidence; an absent xds engine degrades truthfully;
 *  - the xDS control-plane writer adapter POSTs /network-config and is degrade-safe.
 */
import { describe, it, expect } from 'vitest';
import {
  createMeshFabricService,
  previewEdgeTarget,
} from '../services/mesh-fabric.service.js';
import { createXdsControlPlaneWriter } from '../adapters/xds-control-plane.adapter.js';
import type { FetchLike } from '../adapters/http.js';
import type {
  ZitiMeshEnroller,
  XdsControlPlaneWriter,
} from '../ports/mesh-write.port.js';
import type {
  MeshRepository,
  MeshEndpointUpsert,
} from '../ports/cloud-repository.port.js';
import type { CloudGovernanceGatePort } from '../ports/governance-gate.port.js';
import type { GateVerdict } from '../../governance/types.js';
import type { Deployment, MeshEndpoint, Sandbox, Tenant } from '../types.js';
import type { Logger } from '../../../shared/logger.js';

const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Logger;

function tenant(): Tenant {
  return {
    id: 'tnt_1',
    orgId: null,
    ownerUserId: 'user_1',
    tier: 'cloud',
    isolationLevel: 'dedicated',
    region: 'us-east',
    quota: {
      maxSandboxes: 20,
      maxConcurrent: 5,
      maxPreview: 10,
      cpuMillis: 2000,
      memMb: 4096,
    },
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  };
}

function sandbox(over: Partial<Sandbox> = {}): Sandbox {
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
    ...over,
  };
}

function deployment(over: Partial<Deployment> = {}): Deployment {
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
    ...over,
  };
}

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

function gate(
  effect: 'allow' | 'deny',
  audits: unknown[]
): CloudGovernanceGatePort {
  return {
    decide: async () =>
      effect === 'allow'
        ? allowVerdict()
        : { ...allowVerdict(), effect: 'deny', reason: 'policy deny' },
    recordAudit: async entry => {
      audits.push(entry);
      return { hash: 'h', sealed: true } as never;
    },
  } as unknown as CloudGovernanceGatePort;
}

function memMesh(
  upserts: MeshEndpointUpsert[],
  rows: MeshEndpoint[] = []
): MeshRepository {
  return {
    isAvailable: () => true,
    async upsert(input) {
      upserts.push(input);
      const row: MeshEndpoint = {
        id: input.id,
        tenantId: input.tenantId,
        service: input.service,
        zitiIdentity: input.zitiIdentity ?? null,
        xdsCluster: input.xdsCluster ?? null,
        status: input.status,
        registeredAt: '2026-07-19T00:00:00.000Z',
        metadata: input.metadata ?? {},
      };
      return row;
    },
    async listByTenant() {
      return rows;
    },
    async list() {
      return rows;
    },
  };
}

const okEnroller: ZitiMeshEnroller = {
  enroll: async spec => ({
    ok: true,
    identity: { id: `id-${spec.name}`, name: spec.name, status: 'registered' },
    enrollmentJwt: 'jwt',
  }),
};
const absentEnroller: ZitiMeshEnroller = {
  enroll: async () => ({
    ok: false,
    reason: 'ziti controller endpoint not configured',
  }),
};
const okXds: XdsControlPlaneWriter = {
  isConfigured: () => true,
  registerUpstream: async spec => ({
    ok: true,
    version: 'v7',
    clusters: 6,
    cluster: spec.name,
  }),
};
const absentXds: XdsControlPlaneWriter = {
  isConfigured: () => false,
  registerUpstream: async () => ({
    ok: false,
    reason: 'xds control-plane write endpoint not configured',
  }),
};

describe('MeshFabric — enrollSandbox (governed ziti enroll on provision)', () => {
  it('gates, enrols a per-sandbox identity, upserts the endpoint, seals audit', async () => {
    const upserts: MeshEndpointUpsert[] = [];
    const audits: unknown[] = [];
    let enrolledName = '';
    const fabric = createMeshFabricService({
      enroller: {
        enroll: async s => {
          enrolledName = s.name;
          return okEnroller.enroll(s);
        },
      },
      xds: okXds,
      mesh: memMesh(upserts),
      logger: silentLogger,
      gate: gate('allow', audits),
    });
    const out = await fabric.enrollSandbox(tenant(), sandbox());
    expect(out.enrolled).toBe(true);
    if (out.enrolled) expect(out.identityId).toBe('id-sandbox-sb_1');
    expect(enrolledName).toBe('sandbox-sb_1');
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.zitiIdentity).toBe('id-sandbox-sb_1');
    expect(upserts[0]?.service).toBe('sandbox-sb_1');
    expect(audits).toHaveLength(1);
  });

  it('BLOCKS the enroll on a governance deny (ziti controller never touched)', async () => {
    const upserts: MeshEndpointUpsert[] = [];
    let touched = false;
    const fabric = createMeshFabricService({
      enroller: {
        enroll: async s => {
          touched = true;
          return okEnroller.enroll(s);
        },
      },
      xds: okXds,
      mesh: memMesh(upserts),
      logger: silentLogger,
      gate: gate('deny', []),
    });
    const out = await fabric.enrollSandbox(tenant(), sandbox());
    expect(out.enrolled).toBe(false);
    if (!out.enrolled) expect(out.blocked).toBe(true);
    expect(touched).toBe(false);
    expect(upserts).toHaveLength(0);
  });

  it('degrades truthfully (never fakes) when the ziti controller is absent', async () => {
    const upserts: MeshEndpointUpsert[] = [];
    const audits: unknown[] = [];
    const fabric = createMeshFabricService({
      enroller: absentEnroller,
      xds: okXds,
      mesh: memMesh(upserts),
      logger: silentLogger,
      gate: gate('allow', audits),
    });
    const out = await fabric.enrollSandbox(tenant(), sandbox());
    expect(out.enrolled).toBe(false);
    if (!out.enrolled) expect(out.degraded).toBe(true);
    expect(upserts).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

describe('MeshFabric — registerPreviewEdge (governed xds snapshot bump on deploy)', () => {
  it('upserts the edge and bumps the xDS snapshot, returning the served version', async () => {
    const upserts: MeshEndpointUpsert[] = [];
    const audits: unknown[] = [];
    let bumpedName = '';
    const fabric = createMeshFabricService({
      enroller: okEnroller,
      xds: {
        isConfigured: () => true,
        registerUpstream: async s => {
          bumpedName = s.name;
          return okXds.registerUpstream(s);
        },
      },
      mesh: memMesh(upserts),
      logger: silentLogger,
      gate: gate('allow', audits),
    });
    const out = await fabric.registerPreviewEdge(tenant(), deployment(), {
      host: 'dep_1.preview.recoder.xyz',
      port: 443,
      tls: true,
    });
    expect(out.fronted).toBe(true);
    if (out.fronted) {
      expect(out.version).toBe('v7');
      expect(out.cluster).toBe('preview-dep_1');
    }
    expect(bumpedName).toBe('preview-dep_1');
    // Two upserts: the durable 'registered' intent, then the 'active' refresh.
    expect(upserts.map(u => u.status)).toEqual(['registered', 'active']);
    expect(upserts[1]?.metadata?.snapshotVersion).toBe('v7');
    expect(audits).toHaveLength(1);
  });

  it('degrades truthfully when the xds engine is absent (intent recorded, no fake bump)', async () => {
    const upserts: MeshEndpointUpsert[] = [];
    const audits: unknown[] = [];
    const fabric = createMeshFabricService({
      enroller: okEnroller,
      xds: absentXds,
      mesh: memMesh(upserts),
      logger: silentLogger,
      gate: gate('allow', audits),
    });
    const out = await fabric.registerPreviewEdge(tenant(), deployment(), {
      host: 'h',
      port: 8080,
    });
    expect(out.fronted).toBe(false);
    if (!out.fronted) expect(out.degraded).toBe(true);
    expect(upserts.map(u => u.status)).toEqual(['registered']);
    expect(audits).toHaveLength(0);
  });
});

describe('previewEdgeTarget — upstream derivation', () => {
  it('derives host/port/tls from an https preview url', () => {
    expect(previewEdgeTarget('https://dep_1.preview.recoder.xyz')).toEqual({
      host: 'dep_1.preview.recoder.xyz',
      port: 443,
      tls: true,
    });
  });
  it('derives port 80 for http and honours an explicit port', () => {
    expect(previewEdgeTarget('http://box:8080/x')).toEqual({
      host: 'box',
      port: 8080,
      tls: false,
    });
  });
  it('returns null for a null/malformed url (truthful skip)', () => {
    expect(previewEdgeTarget(null)).toBeNull();
    expect(previewEdgeTarget('not a url')).toBeNull();
  });
});

/** A FetchLike answering with a fixed status + JSON body. */
function fetchJson(status: number, body: unknown): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => '',
    json: async () => body,
  });
}

describe('xDS control-plane writer adapter — POST /network-config transport', () => {
  it('is not configured and degrades when no endpoint is set', async () => {
    const w = createXdsControlPlaneWriter({
      endpoint: null,
      logger: silentLogger,
      fetchLike: null,
    });
    expect(w.isConfigured()).toBe(false);
    const out = await w.registerUpstream({
      name: 'preview-x',
      host: 'h',
      port: 80,
    });
    expect(out.ok).toBe(false);
  });

  it('posts the upstream and returns the bumped version on 200', async () => {
    let seenUrl = '';
    const fetchLike: FetchLike = async url => {
      seenUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          version: 'v9',
          clusters: 7,
          cluster: 'preview-x',
        }),
      };
    };
    const w = createXdsControlPlaneWriter({
      endpoint: 'http://127.0.0.1:18001',
      logger: silentLogger,
      fetchLike,
    });
    const out = await w.registerUpstream({
      name: 'preview-x',
      host: '10.0.0.1',
      port: 8080,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.version).toBe('v9');
    expect(seenUrl).toBe('http://127.0.0.1:18001/network-config');
  });

  it('degrades truthfully on the engine 422 (invalid edge) — never a faked bump', async () => {
    const w = createXdsControlPlaneWriter({
      endpoint: 'http://127.0.0.1:18001',
      logger: silentLogger,
      fetchLike: fetchJson(422, { error: 'bad' }),
    });
    const out = await w.registerUpstream({
      name: 'preview-x',
      host: 'h',
      port: 80,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('422');
  });
});
