/**
 * FleetSupervisor — declarative polyglot supervisor (RECODER-ENGINES §11/§24).
 * Every dep is faked: no network, no subprocess, no filesystem. The through-line
 * is the degrade-safe contract — with nothing configured, every service reports
 * available:false + its degradeTo fallback, and it never throws or fakes success.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  FLEET,
  fleetServiceIds,
  getFleetService,
  type FleetFetch,
  type FleetService,
} from './index';
import { FleetSupervisor, getFleetHealth } from './supervisor';

/** A fetch fake that returns a fixed status for any URL (records calls). */
function fakeFetch(status: number): FleetFetch {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status }));
}

/** A fetch fake that resolves per-URL, throwing (unreachable) for unmapped URLs. */
function routedFetch(routes: Record<string, number>): FleetFetch {
  return vi.fn(async (url: string) => {
    for (const [needle, status] of Object.entries(routes)) {
      if (url.includes(needle)) return { ok: status >= 200 && status < 300, status };
    }
    throw new Error('ECONNREFUSED');
  });
}

const EMPTY_ENV: NodeJS.ProcessEnv = {};

describe('fleet manifest', () => {
  it('covers every RECODER-ENGINES §24 polyglot service', () => {
    const ids = fleetServiceIds();
    for (const id of [
      'governance',
      'openfang',
      'tensorzero',
      'recoder-xds',
      'ziti',
      'beads',
      'multica',
      'colbert',
      'mem0',
      'browser-use',
      'ops-recorder',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('marks every service loopback-only and non-spawnable this phase', () => {
    for (const svc of FLEET) {
      expect(svc.loopbackOnly).toBe(true);
      expect(svc.spawnable).toBe(false);
      expect(svc.degradeTo.length).toBeGreaterThan(0);
    }
  });

  it('resolves no default endpoint for env-contract services with empty env', () => {
    // colbert/mem0 are addressed purely by env contract — no loopback default.
    const colbert = getFleetService('colbert') as FleetService;
    expect(colbert.resolveEndpoint(EMPTY_ENV)).toBeUndefined();
    expect(colbert.healthUrl(EMPTY_ENV)).toBeUndefined();
  });

  it('resolveBinary degrades to undefined when an explicit env var points at a missing path', () => {
    const openfang = getFleetService('openfang') as FleetService;
    expect(openfang.resolveBinary({ OPENFANG_BIN: '/definitely/not/here/openfang' })).toBeUndefined();
  });

  it('builds the health URL from the env-contract base for colbert/mem0', () => {
    const colbert = getFleetService('colbert') as FleetService;
    expect(colbert.healthUrl({ COLBERT_RERANK_URL: 'http://127.0.0.1:8070/' })).toBe(
      'http://127.0.0.1:8070/health',
    );
    const mem0 = getFleetService('mem0') as FleetService;
    expect(mem0.healthUrl({ MEM0_BASE_URL: 'http://mem0.local:8071' })).toBe(
      'http://mem0.local:8071/health',
    );
  });

  it('falls back to a loopback default endpoint for openfang/tensorzero and honors overrides', () => {
    const openfang = getFleetService('openfang') as FleetService;
    expect(openfang.healthUrl(EMPTY_ENV)).toBe('http://127.0.0.1:4200/api/health');
    expect(openfang.healthUrl({ OPENFANG_URL: 'http://box:9000' })).toBe('http://box:9000/api/health');

    const tz = getFleetService('tensorzero') as FleetService;
    expect(tz.healthUrl(EMPTY_ENV)).toBe('http://127.0.0.1:3030/health');
  });

  it('getFleetService returns undefined for an unknown id', () => {
    expect(getFleetService('nope')).toBeUndefined();
  });
});

describe('FleetSupervisor.status (degrade-safe)', () => {
  it('reports EVERY service degraded when nothing is configured and endpoints are unreachable', async () => {
    // fetch always throws => unreachable; empty env => no sockets, no binaries.
    const fetch: FleetFetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const sup = new FleetSupervisor({
      env: EMPTY_ENV,
      fetch,
      fileExists: () => false,
    });
    const statuses = await sup.status();
    expect(statuses).toHaveLength(FLEET.length);
    for (const s of statuses) {
      expect(s.available).toBe(false);
      expect(s.source).not.toBe('binary');
      // The truthful reason always names the TS fallback.
      expect(s.reason).toContain('degraded to:');
      expect(s.reason).toContain(s.degradeTo);
    }
  });

  it('never throws even when the injected fetch rejects', async () => {
    const fetch: FleetFetch = vi.fn(async () => {
      throw new Error('boom');
    });
    const sup = new FleetSupervisor({ env: EMPTY_ENV, fetch, fileExists: () => false });
    await expect(sup.status()).resolves.toBeInstanceOf(Array);
  });

  it('marks an HTTP service available when its endpoint returns 200', async () => {
    const sup = new FleetSupervisor({
      env: { OPENFANG_URL: 'http://127.0.0.1:4200' },
      fetch: routedFetch({ '127.0.0.1:4200/api/health': 200 }),
      fileExists: () => false,
    });
    const statuses = await sup.status();
    const openfang = statuses.find((s) => s.id === 'openfang');
    expect(openfang?.available).toBe(true);
    expect(openfang?.source).toBe('endpoint');
    expect(openfang?.reason).toMatch(/HTTP 200/);
  });

  it('treats a non-2xx/3xx endpoint as degraded (truthful, not down)', async () => {
    const sup = new FleetSupervisor({
      env: { COLBERT_RERANK_URL: 'http://127.0.0.1:8070' },
      fetch: fakeFetch(503),
      fileExists: () => false,
    });
    const colbert = (await sup.status()).find((s) => s.id === 'colbert');
    expect(colbert?.available).toBe(false);
    expect(colbert?.reason).toMatch(/HTTP 503/);
    expect(colbert?.reason).toContain('identity rerank order');
  });

  it('probes governance via UDS socket existence (fileExists)', async () => {
    const present = new FleetSupervisor({
      env: { GOV_SOCK: '/tmp/gov.sock' },
      fetch: fakeFetch(200),
      fileExists: (p) => p === '/tmp/gov.sock',
    });
    const govUp = (await present.status()).find((s) => s.id === 'governance');
    expect(govUp?.available).toBe(true);
    expect(govUp?.source).toBe('endpoint');

    const absent = new FleetSupervisor({
      env: { GOV_SOCK: '/tmp/gov.sock' },
      fetch: fakeFetch(200),
      fileExists: () => false,
    });
    const govDown = (await absent.status()).find((s) => s.id === 'governance');
    expect(govDown?.available).toBe(false);
  });

  it('reports beads (cmd) available from binary presence without spawning a subprocess', async () => {
    // Use a services override so binary resolution is deterministic (no real fs).
    const beadsSvc = getFleetService('beads') as FleetService;
    const fakeBeads: FleetService = { ...beadsSvc, resolveBinary: () => '/fake/bd' };
    const sup = new FleetSupervisor({
      env: EMPTY_ENV,
      services: [fakeBeads],
      fetch: fakeFetch(200),
      fileExists: () => false,
      // no cmdProbe => must NOT run a subprocess, report binary presence instead
    });
    const beads = (await sup.status()).find((s) => s.id === 'beads');
    expect(beads?.available).toBe(true);
    expect(beads?.source).toBe('binary');
  });

  it('reports beads degraded when no prebuilt binary resolves', async () => {
    const beadsSvc = getFleetService('beads') as FleetService;
    const fakeBeads: FleetService = { ...beadsSvc, resolveBinary: () => undefined };
    const sup = new FleetSupervisor({ env: EMPTY_ENV, services: [fakeBeads], fetch: fakeFetch(200) });
    const beads = (await sup.status()).find((s) => s.id === 'beads');
    expect(beads?.available).toBe(false);
    expect(beads?.source).toBe('none');
  });

  it('runs the injected cmdProbe for beads when provided', async () => {
    const cmdProbe = vi.fn(async () => false);
    const beadsSvc = getFleetService('beads') as FleetService;
    const fakeBeads: FleetService = { ...beadsSvc, resolveBinary: () => '/fake/bd' };
    const sup = new FleetSupervisor({
      env: EMPTY_ENV,
      services: [fakeBeads],
      fetch: fakeFetch(200),
      fileExists: () => false,
      cmdProbe,
    });
    const beads = (await sup.status()).find((s) => s.id === 'beads');
    expect(cmdProbe).toHaveBeenCalledWith(['bd', 'vc', 'status']);
    expect(beads?.available).toBe(false);
  });

  it('does not probe a grpc target when no tcp prober is injected (truthful, degraded)', async () => {
    const sup = new FleetSupervisor({
      env: { RECODER_XDS_URL: '127.0.0.1:18000' },
      fetch: fakeFetch(200),
      fileExists: () => false,
    });
    const xds = (await sup.status()).find((s) => s.id === 'recoder-xds');
    expect(xds?.available).toBe(false);
    expect(xds?.reason).toMatch(/not probed/);
  });

  it('marks a grpc target available when the injected tcpProbe succeeds', async () => {
    const tcpProbe = vi.fn(async () => true);
    const sup = new FleetSupervisor({
      env: { RECODER_XDS_URL: '127.0.0.1:18000' },
      fetch: fakeFetch(200),
      fileExists: () => false,
      tcpProbe,
    });
    const xds = (await sup.status()).find((s) => s.id === 'recoder-xds');
    expect(tcpProbe).toHaveBeenCalledWith('127.0.0.1', 18000);
    expect(xds?.available).toBe(true);
  });
});

describe('FleetSupervisor.ensure / stop (safe no-ops this phase)', () => {
  it('ensure never spawns and returns truthful probe status', async () => {
    const sup = new FleetSupervisor({
      env: { OPENFANG_URL: 'http://127.0.0.1:4200' },
      fetch: routedFetch({ '127.0.0.1:4200/api/health': 200 }),
      fileExists: () => false,
    });
    const status = await sup.ensure('openfang');
    expect(status?.available).toBe(true);
  });

  it('ensure returns undefined for an unknown service', async () => {
    const sup = new FleetSupervisor({ env: EMPTY_ENV, fetch: fakeFetch(200), fileExists: () => false });
    expect(await sup.ensure('nope')).toBeUndefined();
  });

  it('stop is a safe no-op that never throws', async () => {
    const sup = new FleetSupervisor({ env: EMPTY_ENV, fetch: fakeFetch(200), fileExists: () => false });
    await expect(sup.stop('openfang')).resolves.toBeUndefined();
    await expect(sup.stop('nope')).resolves.toBeUndefined();
  });
});

describe('getFleetHealth (/health/full)', () => {
  it('summarizes available vs degraded truthfully', async () => {
    const health = await getFleetHealth({
      env: { OPENFANG_URL: 'http://127.0.0.1:4200', COLBERT_RERANK_URL: 'http://127.0.0.1:8070' },
      fetch: routedFetch({ '4200/api/health': 200, '8070/health': 200 }),
      fileExists: () => false,
    });
    expect(health.summary.total).toBe(FLEET.length);
    expect(health.summary.available).toBe(2);
    expect(health.summary.degraded).toBe(FLEET.length - 2);
    expect(health.summary.available + health.summary.degraded).toBe(health.summary.total);
    expect(typeof health.generatedAt).toBe('string');
  });

  it('reports all-degraded with an empty env and unreachable fetch (desktop cold boot)', async () => {
    const health = await getFleetHealth({
      env: EMPTY_ENV,
      fetch: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
      fileExists: () => false,
    });
    expect(health.summary.available).toBe(0);
    expect(health.summary.degraded).toBe(FLEET.length);
  });
});
