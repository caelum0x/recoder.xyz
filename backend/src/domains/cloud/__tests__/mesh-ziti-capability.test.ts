/**
 * Ziti mesh CAPABILITY tests — the deepened introspection reads (services /
 * enrollment posture / topology) + the governance-gated enrollment WRITE, over a
 * MOCKED controller `fetchLike` seam.
 *
 * LIVE PATH: the mocked `fetchLike` stands in for the OpenZiti controller
 * edge-management REST API (`GET /identities`, `GET /services`, `POST /identities`)
 * the ziti engine (`apps/desktop/server/engines/ziti`) serves over its loopback
 * endpoint. These tests assert the truthful-degrade contract (absent controller ⇒
 * empty/`down`/`{ ok:false }`, never a fake) and that the enroll WRITE is CLOSED
 * behind the governance gate + caller subject binding.
 */
import { describe, it, expect } from 'vitest';
import { createZitiMeshAdapter } from '../adapters/ziti-mesh.adapter.js';
import { buildCloudMeshMcpTools } from '../mcp/cloud-mesh-engine.js';
import { createMeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import { createXdsEnvoyAdapter } from '../adapters/xds-envoy.adapter.js';
import type { FetchLike, HttpRequestInit, HttpResponse } from '../adapters/http.js';
import type { Logger } from '../../../shared/logger.js';
import type { TenancyService } from '../services/tenancy.service.js';
import type { Tenant } from '../types.js';
import type { CloudGovernanceGatePort } from '../ports/governance-gate.port.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';

const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Logger;

/** A FetchLike that dispatches per path to a canned JSON body (any 2xx). */
function fetchRouter(routes: Record<string, unknown>): FetchLike {
  return async (url: string) => {
    const path = new URL(url).pathname;
    const body = routes[path];
    const ok = body !== undefined;
    return {
      ok,
      status: ok ? 200 : 404,
      text: async () => '',
      json: async () => body ?? {},
    } satisfies HttpResponse;
  };
}

const ENDPOINT = 'http://127.0.0.1:1280';

function zitiWith(fetchLike: FetchLike) {
  return createZitiMeshAdapter({ endpoint: ENDPOINT, logger: silentLogger, fetchLike });
}

describe('ziti adapter — service list + status', () => {
  it('maps registered services with encryption + role attributes', async () => {
    const ziti = zitiWith(
      fetchRouter({
        '/services': {
          data: [
            { id: 's1', name: 'echo', status: 'registered', encryptionRequired: true, roleAttributes: ['#prod'] },
            { id: 's2', name: 'db', encryptionRequired: false },
          ],
        },
      }),
    );
    const services = await ziti.services();
    expect(services).toHaveLength(2);
    expect(services[0]).toEqual({
      id: 's1',
      name: 'echo',
      status: 'registered',
      encryptionRequired: true,
      roleAttributes: ['#prod'],
    });
    // Defaults: unknown status coerces to 'registered', missing encryption ⇒ false.
    expect(services[1]).toEqual({ id: 's2', name: 'db', status: 'registered', encryptionRequired: false, roleAttributes: [] });
  });

  it('returns empty services when the controller endpoint is absent (truthful down)', async () => {
    const ziti = createZitiMeshAdapter({ endpoint: null, logger: silentLogger, fetchLike: null });
    expect(await ziti.services()).toEqual([]);
    expect((await ziti.status()).status).toBe('down');
  });
});

describe('ziti adapter — enrollment posture', () => {
  it('reports enrolled vs outstanding token from the identity enrollment sub-object', async () => {
    const ziti = zitiWith(
      fetchRouter({
        '/identities': [
          { id: 'i1', name: 'joined', status: 'active', enrollment: {} },
          { id: 'i2', name: 'pending', enrollment: { ott: { expiresAt: '2099-01-01T00:00:00Z' } } },
        ],
      }),
    );
    const enrollments = await ziti.enrollments();
    expect(enrollments).toHaveLength(2);
    expect(enrollments[0]).toMatchObject({ identityId: 'i1', enrolled: true, method: 'none', expiresAt: null });
    expect(enrollments[1]).toMatchObject({ identityId: 'i2', enrolled: false, method: 'ott', expiresAt: '2099-01-01T00:00:00Z' });
  });
});

describe('ziti adapter — topology', () => {
  it('merges engine status + identities + services + enrollments with a timestamp', async () => {
    const ziti = zitiWith(
      fetchRouter({
        '/health': {},
        '/identities': [{ id: 'i1', name: 'a', enrollment: {} }],
        '/services': [{ id: 's1', name: 'echo' }],
      }),
    );
    const topo = await ziti.topology();
    expect(topo.engine.status).toBe('up');
    expect(topo.identities).toHaveLength(1);
    expect(topo.services).toHaveLength(1);
    expect(topo.enrollments).toHaveLength(1);
    expect(() => new Date(topo.checkedAt).toISOString()).not.toThrow();
  });
});

describe('ziti adapter — enroll WRITE (transport)', () => {
  it('degrades truthfully when the controller endpoint is absent', async () => {
    const ziti = createZitiMeshAdapter({ endpoint: null, logger: silentLogger, fetchLike: null });
    const out = await ziti.enroll({ name: 'edge-1' });
    expect(out).toEqual({ ok: false, reason: 'ziti controller endpoint not configured' });
  });

  it('POSTs the identity and returns the created id + enrollment JWT', async () => {
    let seen: { url: string; init?: HttpRequestInit } | null = null;
    const fetchLike: FetchLike = async (url, init) => {
      seen = { url, init };
      return {
        ok: true,
        status: 201,
        text: async () => '',
        json: async () => ({ data: { id: 'new-id', status: 'registered', enrollmentJwt: 'jwt-token' } }),
      };
    };
    const out = await zitiWith(fetchLike).enroll({ name: 'edge-1', method: 'ott', roleAttributes: ['#edge'] });
    expect(out).toEqual({
      ok: true,
      identity: { id: 'new-id', name: 'edge-1', status: 'registered' },
      enrollmentJwt: 'jwt-token',
    });
    expect(seen!.init?.method).toBe('POST');
    const sentBody = JSON.parse(seen!.init?.body ?? '{}');
    expect(sentBody).toMatchObject({ name: 'edge-1', type: 'Device', roleAttributes: ['#edge'] });
  });

  it('returns a truthful reason on a controller error status', async () => {
    const out = await zitiWith(fetchRouter({})).enroll({ name: 'edge-1' });
    expect(out).toEqual({ ok: false, reason: 'ziti controller returned 404' });
  });
});

// --- MCP tool wiring (reads are engine-status; the write is gated + bound) ---

const tenant: Tenant = {
  id: 't-1',
  orgId: null,
  ownerUserId: 'u-1',
  tier: 'cloud',
  isolationLevel: 'shared',
  region: 'us',
  quota: { maxSandboxes: 0, maxConcurrent: 0, maxPreview: 0, cpuMillis: 0, memMb: 0 },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const tenancyStub = {
  ensure: async () => ({ ok: true as const, value: tenant }),
  resolve: async () => ({ ok: true as const, value: tenant }),
} as unknown as TenancyService;

function meshServiceWith(fetchLike: FetchLike) {
  return createMeshDiagnosticsService({
    ziti: zitiWith(fetchLike),
    xds: createXdsEnvoyAdapter({ endpoint: null, logger: silentLogger, fetchLike: null }),
    logger: silentLogger,
  });
}

function toolMap(fetchLike: FetchLike, gate?: CloudGovernanceGatePort): Map<string, McpToolRegistration> {
  const tools = buildCloudMeshMcpTools({
    mesh: meshServiceWith(fetchLike),
    tenancy: tenancyStub,
    enroller: zitiWith(fetchLike),
    logger: silentLogger,
    ...(gate ? { gate } : {}),
  });
  return new Map(tools.map((t) => [t.name, t]));
}

const caller: McpToolCaller = { userId: 'u-1' };

const allowGate = {
  decide: async () => ({ effect: 'allow', tier: 'low', degraded: false, reason: 'ok' }),
  recordAudit: async () => {},
} as unknown as CloudGovernanceGatePort;

const denyGate = {
  decide: async () => ({ effect: 'deny', tier: 'high', degraded: false, reason: 'policy' }),
  recordAudit: async () => {},
} as unknown as CloudGovernanceGatePort;

describe('cloud mesh MCP read tools', () => {
  const fetchLike = fetchRouter({
    '/health': {},
    '/services': [{ id: 's1', name: 'echo', encryptionRequired: true }],
    '/identities': [{ id: 'i1', name: 'a', enrollment: { ott: { expiresAt: '2099-01-01T00:00:00Z' } } }],
  });

  it('cloud_mesh_services_list returns engine status + services', async () => {
    const res = (await toolMap(fetchLike).get('cloud_mesh_services_list')!.handler({}, caller)) as {
      count: number;
      services: unknown[];
    };
    expect(res.count).toBe(1);
    expect(res.services).toHaveLength(1);
  });

  it('cloud_mesh_enrollment_status counts enrolled vs pending', async () => {
    const res = (await toolMap(fetchLike).get('cloud_mesh_enrollment_status')!.handler({}, caller)) as {
      pending: number;
      enrolled: number;
    };
    expect(res.pending).toBe(1);
    expect(res.enrolled).toBe(0);
  });

  it('cloud_mesh_topology returns counts + a timestamp', async () => {
    const res = (await toolMap(fetchLike).get('cloud_mesh_topology')!.handler({}, caller)) as {
      identities: number;
      services: number;
      pendingEnrollments: number;
    };
    expect(res.identities).toBe(1);
    expect(res.services).toBe(1);
    expect(res.pendingEnrollments).toBe(1);
  });
});

describe('cloud_mesh_enroll WRITE tool (governed + subject-bound)', () => {
  const enrollFetch: FetchLike = async (url, init) => {
    if (new URL(url).pathname === '/identities' && init?.method === 'POST') {
      return { ok: true, status: 201, text: async () => '', json: async () => ({ data: { id: 'e-1', status: 'registered' } }) };
    }
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  };

  it('refuses without an authenticated caller', async () => {
    const res = (await toolMap(enrollFetch, allowGate).get('cloud_mesh_enroll')!.handler({ name: 'x' })) as {
      ok: boolean;
      code: string;
    };
    expect(res.ok).toBe(false);
    expect(res.code).toBe('AUTH_REQUIRED');
  });

  it('blocks on a governance deny (never a fake success)', async () => {
    const res = (await toolMap(enrollFetch, denyGate).get('cloud_mesh_enroll')!.handler({ name: 'x' }, caller)) as {
      ok: boolean;
      effect: string;
    };
    expect(res.ok).toBe(false);
    expect(res.effect).toBe('blocked');
  });

  it('enrols when the gate allows + the caller is bound to its own tenant', async () => {
    const res = (await toolMap(enrollFetch, allowGate).get('cloud_mesh_enroll')!.handler({ name: 'edge-1' }, caller)) as {
      ok: boolean;
      identity?: { id: string };
      tenantId?: string;
    };
    expect(res.ok).toBe(true);
    expect(res.identity?.id).toBe('e-1');
    expect(res.tenantId).toBe('t-1');
  });

  it('surfaces the truthful degrade reason when the controller is absent (gate allowed)', async () => {
    const tools = buildCloudMeshMcpTools({
      mesh: meshServiceWith(fetchRouter({})),
      tenancy: tenancyStub,
      enroller: createZitiMeshAdapter({ endpoint: null, logger: silentLogger, fetchLike: null }),
      logger: silentLogger,
      gate: allowGate,
    });
    const enroll = new Map(tools.map((t) => [t.name, t])).get('cloud_mesh_enroll')!;
    const res = (await enroll.handler({ name: 'edge-1' }, caller)) as { ok: boolean; error?: string };
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not configured');
  });
});
