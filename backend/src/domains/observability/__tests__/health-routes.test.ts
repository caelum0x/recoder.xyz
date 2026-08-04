/**
 * The `/health` + `/health/full` HTTP CONTRACT the desktop health dot + any
 * load-balancer probe depend on (the dot reads `/health/full` and its `sources[]`).
 * These assert the TRUTHFULNESS invariant survives the route layer end-to-end:
 *
 *  - all sources up            → 200 `up`, and `/health/full` carries `sources[]`;
 *  - one source down           → `degraded` (never masked green), the down source
 *                                named in `sources[]`, endpoint still 200 (serving);
 *  - EVERY required source down → rollup `down` ⇒ HTTP 503 (NOT 200) on both the
 *                                shallow and the full edge, `sources[]` still carried;
 *  - a health CHECK that throws → that component reports `unknown` (with a reason)
 *                                and the endpoint STILL ANSWERS (never a 500 crash).
 *
 * Uses the REAL `HealthAggregator` over the REAL boot-time `HealthRegistry` and the
 * REAL `buildHealthRoutes` express router over an ephemeral loopback server — no
 * stubbed aggregator, so the wiring itself is under test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ComponentHealth } from '../../../shared/health-types.js';
import { createHealthRegistry, type HealthRegistry } from '../../../bootstrap/health-registry.js';
import { HealthAggregator } from '../services/health-aggregator.service.js';
import { buildHealthRoutes } from '../routes/observability.routes.js';
import type { EngineHealth, HealthFull, HealthShallow } from '../types.js';

const ENGINES: readonly EngineHealth[] = [
  { engine: 'logging', status: 'up', degraded: false },
  { engine: 'metrics', status: 'up', degraded: false },
];

function comp(name: string, status: ComponentHealth['status'], reason?: string): ComponentHealth {
  return { name, status, degraded: status !== 'up', ...(reason ? { reason } : {}) };
}

interface Harness {
  base: string;
  close: () => Promise<void>;
}

function serve(registry: HealthRegistry): Promise<Harness> {
  const aggregator = new HealthAggregator({
    registry,
    service: 'recoder-backend',
    instanceId: 'test-instance',
    defaultSpaceId: 'default',
  });
  const app = express();
  app.use(buildHealthRoutes({ aggregator, engines: () => ENGINES }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.close();
  harness = null;
});

// Uses node:http directly (NOT global.fetch — the test setup mocks fetch to a
// 404 stub, so a real loopback request must bypass it).
function get<T>(path: string): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${harness!.base}${path}`);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET' },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) as T });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('GET /health + /health/full contract', () => {
  it('all sources up → 200 up, and /health/full carries the per-component sources[]', async () => {
    const registry = createHealthRegistry();
    registry.register({ name: 'persistence', health: () => comp('persistence', 'up') });
    registry.register({ name: 'conductor', health: () => comp('conductor', 'up') });
    harness = await serve(registry);

    const shallow = await get<HealthShallow>('/health');
    expect(shallow.status).toBe(200);
    expect(shallow.body.status).toBe('up');
    // shallow leaks no per-domain detail — only a count.
    expect(shallow.body.sources).toBe(2);

    const full = await get<HealthFull>('/health/full');
    expect(full.status).toBe(200);
    expect(full.body.status).toBe('up');
    // the dot reads this list — it must be present and name every source.
    expect(full.body.sources.map((s) => s.name).sort()).toEqual(['conductor', 'persistence']);
    expect(full.body.counts).toEqual({ up: 2, down: 0, degraded: 0, unknown: 0 });
  });

  it('one source down → degraded (never masked green), named in sources[], endpoint still 200', async () => {
    const registry = createHealthRegistry();
    registry.register({ name: 'persistence', health: () => comp('persistence', 'up') });
    registry.register({
      name: 'conductor',
      health: () => comp('conductor', 'down', 'no substrate reachable'),
    });
    harness = await serve(registry);

    const full = await get<HealthFull>('/health/full');
    expect(full.status).toBe(200); // degraded still SERVES
    expect(full.body.status).toBe('degraded');
    expect(full.body.degraded).toBe(true);
    const conductor = full.body.sources.find((s) => s.name === 'conductor');
    expect(conductor?.status).toBe('down');
    expect(conductor?.reason).toBe('no substrate reachable');

    // shallow reflects the same truthful degrade (still 200, not down).
    const shallow = await get<HealthShallow>('/health');
    expect(shallow.status).toBe(200);
    expect(shallow.body.status).toBe('degraded');
  });

  it('EVERY required source down → rollup down ⇒ HTTP 503 on both edges, sources[] still carried', async () => {
    const registry = createHealthRegistry();
    registry.register({ name: 'persistence', health: () => comp('persistence', 'down', 'no DATABASE_URL') });
    registry.register({ name: 'conductor', health: () => comp('conductor', 'down', 'substrate down') });
    harness = await serve(registry);

    const full = await get<HealthFull>('/health/full');
    expect(full.status).toBe(503); // NOT 200 — a down rollup must fail the probe
    expect(full.body.status).toBe('down');
    expect(full.body.sources.map((s) => s.name).sort()).toEqual(['conductor', 'persistence']);
    expect(full.body.sources.every((s) => s.status === 'down')).toBe(true);

    const shallow = await get<HealthShallow>('/health');
    expect(shallow.status).toBe(503);
    expect(shallow.body.status).toBe('down');
  });

  it('a health check that THROWS → that component unknown (with reason), endpoint still answers (no 500)', async () => {
    const registry = createHealthRegistry();
    registry.register({ name: 'persistence', health: () => comp('persistence', 'up') });
    registry.register({
      name: 'memory',
      health: () => {
        throw new Error('bd binary crashed');
      },
    });
    harness = await serve(registry);

    const full = await get<HealthFull>('/health/full');
    // endpoint answered — a throwing probe must not crash the route (never 500).
    expect(full.status).toBe(200);
    expect(full.body.status).toBe('degraded'); // unknown (no worse) → degraded, never up
    const memory = full.body.sources.find((s) => s.name === 'memory');
    expect(memory?.status).toBe('unknown');
    expect(memory?.reason).toBe('bd binary crashed');
    // the surviving source is preserved truthfully.
    expect(full.body.sources.find((s) => s.name === 'persistence')?.status).toBe('up');
  });

  it('empty registry → up (nothing registered is not a fabricated component)', async () => {
    harness = await serve(createHealthRegistry());
    const full = await get<HealthFull>('/health/full');
    expect(full.status).toBe(200);
    expect(full.body.status).toBe('up');
    expect(full.body.sources).toEqual([]);
  });
});
