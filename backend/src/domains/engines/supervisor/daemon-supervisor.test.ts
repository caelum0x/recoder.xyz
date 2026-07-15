/**
 * `DaemonSupervisor` degrade-safe contract (no real spawn):
 *  - a `null` binPath → `ensureStarted` resolves null + `health` reports down,
 *  - a non-loopback listen addr is refused,
 *  - `isLoopback` classifies loopback vs routable addrs.
 * The health probe is stubbed via `globalThis.fetch` so no network is touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DaemonSupervisor, isLoopback } from './daemon-supervisor.js';
import { ProcessRegistry } from './process-registry.js';
import type { DaemonSpec } from '../ports/daemon-supervisor.port.js';

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as import('../../../shared/logger.js').Logger;

function supervisor(): DaemonSupervisor {
  return new DaemonSupervisor(new ProcessRegistry(log), log);
}

const absentBinSpec: DaemonSpec = {
  engineId: 'colbert',
  binPath: null,
  args: [],
  listenAddr: '127.0.0.1:8893',
};

describe('isLoopback', () => {
  it('accepts loopback hosts and rejects routable ones', () => {
    expect(isLoopback('127.0.0.1:8893')).toBe(true);
    expect(isLoopback('localhost:3000')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('0.0.0.0:8893')).toBe(false);
    expect(isLoopback('10.0.0.5:8893')).toBe(false);
  });
});

describe('DaemonSupervisor (degrade-safe)', () => {
  it('resolves null when the binary is absent', async () => {
    const sup = supervisor();
    await expect(sup.ensureStarted(absentBinSpec)).resolves.toBeNull();
  });

  it('reports down health when the binary is absent (with a reason)', async () => {
    const sup = supervisor();
    const health = await sup.health(absentBinSpec);
    expect(health.status).toBe('down');
    expect(health.transport).toBe('daemon');
    expect(health.reason).toMatch(/binary not built|not resolved/);
  });

  it('probes an externally-managed URL for health', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sup = supervisor();
    const health = await sup.health({ ...absentBinSpec, externalUrl: 'http://127.0.0.1:9999' });
    expect(health.status).toBe('up');
    expect(fetchMock).toHaveBeenCalled();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
});
