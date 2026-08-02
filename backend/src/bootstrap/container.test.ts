/**
 * Foundation boot tests: DI container, config loader, health registry, and a
 * real `start()`/`stop()` on an ephemeral port.
 */
import http from 'node:http';
import { describe, it, expect, afterEach } from 'vitest';

import { createToken, DOMAIN_TOKENS } from '../shared/di-tokens.js';
import { createContainer } from './container.js';
import { loadConfig, type EnvSource } from './config.js';
import { createHealthRegistry } from './health-registry.js';
import { start, type BootHandle } from './index.js';

const baseEnv: EnvSource = { NODE_ENV: 'test', PORT: '0', LOG_LEVEL: 'silent' };

/** Raw HTTP GET — the shared tests/setup.ts mocks global.fetch, so use http. */
function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
  });
}

/** Raw HTTP POST (no body) — used to probe a mounted+gated internal route. */
function httpPost(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    req.end('{}');
  });
}

describe('DI container', () => {
  it('registers and resolves a typed value', () => {
    const token = createToken<{ answer: number }>('demo');
    const container = createContainer();
    container.registerValue(token, { answer: 42 });
    expect(container.resolve(token).answer).toBe(42);
    expect(container.has(token)).toBe(true);
  });

  it('runs a factory once (singleton)', () => {
    const token = createToken<{ n: number }>('lazy');
    let calls = 0;
    const container = createContainer();
    container.registerFactory(token, () => ({ n: ++calls }));
    expect(container.resolve(token).n).toBe(1);
    expect(container.resolve(token).n).toBe(1);
    expect(calls).toBe(1);
  });

  it('throws on unregistered resolve and returns undefined from tryResolve', () => {
    const token = createToken<number>('missing');
    const container = createContainer();
    expect(() => container.resolve(token)).toThrow(/not registered/);
    expect(container.tryResolve(token)).toBeUndefined();
  });
});

describe('config loader', () => {
  it('builds an immutable AppConfig from a fake env', () => {
    const config = loadConfig({ ...baseEnv, PORT: '3100' });
    expect(config.server.port).toBe(3100);
    expect(config.runtime.env).toBe('test');
    expect(config.runtime.isProduction).toBe(false);
    expect(config.internal.serviceKeyPresent).toBe(false);
  });

  it('fails fast on an invalid port', () => {
    expect(() => loadConfig({ ...baseEnv, PORT: '99999' })).toThrow(/Invalid environment/);
  });

  it('rejects a placeholder internal key in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db/x', INTERNAL_SERVICE_KEY: 'changeme' }),
    ).toThrow(/INTERNAL_SERVICE_KEY/);
  });

  it('rejects a localhost DB URL in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://localhost:5432/x' }),
    ).toThrow(/localhost/);
  });
});

describe('health registry', () => {
  it('reports up with zero sources (truthful empty aggregate)', async () => {
    const report = await createHealthRegistry().report();
    expect(report.status).toBe('up');
    expect(report.degraded).toBe(false);
    expect(report.sources).toHaveLength(0);
  });

  it('degrades when a source is down but others are up', async () => {
    const registry = createHealthRegistry();
    registry.register({ name: 'a', health: () => ({ name: 'a', status: 'up', degraded: false }) });
    registry.register({ name: 'b', health: () => ({ name: 'b', status: 'down', degraded: false, reason: 'x' }) });
    const report = await registry.report();
    expect(report.status).toBe('degraded');
    expect(report.degraded).toBe(true);
  });

  it('classifies a throwing/timing-out source as unknown, never a hang', async () => {
    const registry = createHealthRegistry({ probeTimeoutMs: 50 });
    registry.register({
      name: 'slow',
      health: () => new Promise(() => {
        /* never resolves */
      }),
    });
    const report = await registry.report();
    expect(report.sources[0]?.status).toBe('unknown');
  });
});

describe('start()', () => {
  let handle: BootHandle | undefined;

  afterEach(async () => {
    await handle?.stop();
    handle = undefined;
  });

  it('boots an empty host that serves a truthful /health', async () => {
    handle = await start({ env: baseEnv, installSignalHandlers: false });
    const address = handle.server.address();
    expect(address).not.toBeNull();
    const port = typeof address === 'object' && address ? address.port : 0;
    expect(port).toBeGreaterThan(0);

    const res = await httpGet(port, '/health');
    // Registered health sources include persistence (Phase 1), identity
    // (Phase 2), and the engines module. In the test env there is no DATABASE_URL /
    // BETTER_AUTH_SECRET, so persistence + identity degrade SAFELY — a truthful
    // `degraded` (still HTTP 200), never a faked `up` and never `down`.
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { status: string; sources: number; degraded: boolean };
    expect(['up', 'degraded']).toContain(body.status);
    expect(body.sources).toBeGreaterThanOrEqual(3);
  });

  it('returns a 404 envelope for unknown routes', async () => {
    handle = await start({ env: baseEnv, installSignalHandlers: false });
    const address = handle.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await httpGet(port, '/no-such-route');
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('mounts the internal memory harvest edge (gated, not 404)', async () => {
    // Proves the memory.internalRoutes() seam is composed at the route table under
    // /internal/agent-os/memory. Without INTERNAL_SERVICE_KEY the requireInternal
    // gate fails CLOSED (503 SERVICE_UNAVAILABLE) — a truthful "gate not configured",
    // NOT a 404. A 404 here would mean the router was never mounted.
    handle = await start({ env: baseEnv, installSignalHandlers: false });
    const address = handle.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await httpPost(port, '/internal/agent-os/memory/harvest');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(503);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('registers the billing + conductor domains after seam wiring', async () => {
    // Boot proves the billing.setGovernanceGate() + conductor mcpInject wiring did
    // not throw at the composition root; both domains resolve from the container.
    handle = await start({ env: baseEnv, installSignalHandlers: false });
    expect(handle.container.has(DOMAIN_TOKENS.billing)).toBe(true);
    expect(handle.container.has(DOMAIN_TOKENS.conductor)).toBe(true);
  });
});
