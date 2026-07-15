/**
 * Degrade-safe contract tests for the Python-sidecar engine adapters. With the
 * engine ABSENT (no venv / no API key / no sidecar URL), each adapter must report
 * a truthful `down` health and return `{ ok:false, reason }` from `invoke` —
 * never a faked `up`, never a fabricated result, never a thrown seam. The
 * always-local surfaces (pal's in-proc `plan` decision) still succeed.
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import { enginesConfigSchema, type EnginesConfig } from '../../config.js';
import type {
  PreflightResult,
  SidecarHandle,
  SidecarSpec,
  SidecarSupervisorPort,
} from '../../ports/sidecar-supervisor.port.js';
import { down, type EngineHealth } from '../../types.js';
import { Mem0Adapter, type Mem0ClientFns } from './mem0.adapter.js';
import { BrowserUseAdapter } from './browser-use.adapter.js';
import { PalMcpAdapter } from './pal-mcp.adapter.js';

const log = { warn() {}, info() {}, debug() {}, error() {}, child: () => log } as unknown as Logger;

function config(overrides: Partial<EnginesConfig> = {}): EnginesConfig {
  return enginesConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    repoRoot: null,
    palRootDir: null,
    napiPaths: { openfang: null, tensorzero: null, governance: null },
    daemonBins: { colbert: null, 'ops-recorder': null, multica: null, ziti: null, 'tensorzero-loopback': null },
    externalUrls: {
      colbert: null,
      'ops-recorder': null,
      multica: null,
      ziti: null,
      'tensorzero-loopback': null,
      mem0: null,
      'browser-use': null,
    },
    sidecarPython: { mem0: null, 'browser-use': null, 'pal-mcp': null },
    enabled: {},
    napiFirst: true,
    ...overrides,
  });
}

/** A supervisor that never spawns and always reports the engine down. */
const deadSupervisor: SidecarSupervisorPort = {
  async preflight(): Promise<PreflightResult> {
    return { ok: false, reason: 'venv absent' };
  },
  async ensureStarted(): Promise<SidecarHandle | null> {
    return null;
  },
  async stop(): Promise<void> {},
  handle(): SidecarHandle | null {
    return null;
  },
  async health(spec: SidecarSpec): Promise<EngineHealth> {
    return down(spec.engineId as never, 'sidecar', 'venv absent');
  },
  async stopAll(): Promise<void> {},
};

const unavailableMem0: Mem0ClientFns = {
  async add() {
    return { available: false, reason: 'no key' };
  },
  async search() {
    return { available: false, reason: 'no key', results: [] };
  },
  async getAll() {
    return { available: false, reason: 'no key', results: [] };
  },
  async delete() {
    return { available: false, deleted: false, reason: 'no key' };
  },
  async health() {
    return { available: false, mode: 'none', reason: 'no MEM0_API_KEY and no self-hostable LLM/embedder' };
  },
};

describe('Mem0Adapter', () => {
  it('reports down + fails invoke when mem0 is unconfigured', async () => {
    const adapter = new Mem0Adapter({ supervisor: deadSupervisor, config: config(), log, client: unavailableMem0 });
    const health = await adapter.health();
    expect(health.status).toBe('down');
    const res = await adapter.invoke({ op: 'add', input: { userId: 'u1', messages: 'hi' } });
    expect(res.ok).toBe(false);
  });

  it('degrades REST-only ops (history/update/get) truthfully with no sidecar base', async () => {
    const adapter = new Mem0Adapter({ supervisor: deadSupervisor, config: config(), log, client: unavailableMem0 });
    const res = await adapter.invoke({ op: 'history', input: { memoryId: 'm1' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unavailable');
  });

  it('validates input at the boundary (missing userId)', async () => {
    const adapter = new Mem0Adapter({ supervisor: deadSupervisor, config: config(), log, client: unavailableMem0 });
    const res = await adapter.invoke({ op: 'search', input: { query: 'x' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });

  it('is disabled truthfully via config', async () => {
    const adapter = new Mem0Adapter({ supervisor: deadSupervisor, config: config({ enabled: { mem0: false } }), log, client: unavailableMem0 });
    expect((await adapter.health()).status).toBe('down');
    const res = await adapter.invoke({ op: 'add', input: { userId: 'u', messages: 'x' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('disabled');
  });
});

describe('BrowserUseAdapter', () => {
  it('reports down (no puppeteer, no BROWSER_USE_URL) and degrades navigate', async () => {
    const adapter = new BrowserUseAdapter({ supervisor: deadSupervisor, config: config(), log });
    const health = await adapter.health();
    expect(health.status).toBe('down');
    const res = await adapter.invoke({ op: 'navigate', input: { url: 'https://example.com' } });
    expect(res.ok).toBe(false);
  });

  it('rejects navigate without a url', async () => {
    const adapter = new BrowserUseAdapter({ supervisor: deadSupervisor, config: config(), log });
    const res = await adapter.invoke({ op: 'navigate', input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });
});

describe('PalMcpAdapter', () => {
  it('serves the in-proc pal plan decision even with no venv (deny-biased default)', async () => {
    const adapter = new PalMcpAdapter({ supervisor: deadSupervisor, config: config({ palRootDir: '/nonexistent/pal' }), log });
    const res = await adapter.invoke({ op: 'plan', input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBeTruthy();
  });

  it('reports down + fails multi-model ops when the pal venv is absent', async () => {
    const adapter = new PalMcpAdapter({ supervisor: deadSupervisor, config: config({ palRootDir: '/nonexistent/pal' }), log });
    const health = await adapter.health();
    expect(health.status).toBe('down');
    const res = await adapter.invoke({ op: 'chat', input: { prompt: 'hi' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unavailable');
  });

  it('exposes a truthful external server config for the composer', () => {
    const adapter = new PalMcpAdapter({ supervisor: deadSupervisor, config: config({ palRootDir: '/nonexistent/pal' }), log });
    const cfg = adapter.externalServerConfig();
    expect(cfg.serverId).toBeTruthy();
  });
});
