/**
 * Supervision-lifecycle tests for the `recodergit mcp --http` loopback server:
 * `ensureServer` / `serverHealth` / `stopServer` (RecoderGitService) plus the
 * `RecodergitAdapter` up / starting-degraded / down health mapping.
 *
 * TRUTHFUL READINESS (the defect these tests lock down): a bare pid is NOT
 * 'ready'. The service must stay 'starting' until an injectable readiness probe
 * confirms the child's loopback endpoint is actually listening, and must degrade
 * to a truthful 'unavailable' (never a faked 'ready'/'up') when the probe never
 * succeeds. Every seam (spawnServer + readinessProbe + timing) is injected so no
 * real process is spawned and no real socket is opened.
 */
import { describe, it, expect } from 'vitest';
import {
  createRecoderGitService,
  type ServerProcessHandle,
  type ServerReadinessProbe,
} from './recodergit-service.js';
import { RecodergitAdapter } from './adapters/cli/recodergit.adapter.js';
import { enginesConfigSchema, type EnginesConfig } from './config.js';
import type { Logger } from '../../shared/logger.js';

const log = {
  warn() {},
  info() {},
  debug() {},
  error() {},
  child: () => log,
} as unknown as Logger;

function config(overrides: Partial<EnginesConfig> = {}): EnginesConfig {
  return enginesConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    repoRoot: null,
    palRootDir: null,
    napiPaths: { openfang: null, tensorzero: null, governance: null },
    daemonBins: {
      colbert: null,
      'ops-recorder': null,
      multica: null,
      ziti: null,
      'tensorzero-loopback': null,
    },
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

/** Fake spawned-process handle: captures exit/error callbacks, counts kills. */
interface FakeHandle extends ServerProcessHandle {
  killCount: number;
  triggerExit: (code: number | null) => void;
  triggerError: (error: Error) => void;
}

function makeHandle(pid: number | null): FakeHandle {
  let exitCb: ((code: number | null) => void) | null = null;
  let errorCb: ((error: Error) => void) | null = null;
  const handle: FakeHandle = {
    pid,
    killCount: 0,
    kill() {
      handle.killCount += 1;
    },
    onExit(cb) {
      exitCb = cb;
    },
    onError(cb) {
      errorCb = cb;
    },
    triggerExit(code) {
      exitCb?.(code);
    },
    triggerError(error) {
      errorCb?.(error);
    },
  };
  return handle;
}

/** Common injected deps for a service that "spawns" a fake, probeable server. */
function serviceDeps(overrides: Record<string, unknown> = {}) {
  return {
    isEnabled: () => true,
    resolveBin: () => '/fake/recodergit-bin',
    serverPort: () => 7337,
    serverReadyTimeoutMs: 2_000,
    serverReadyIntervalMs: 5,
    ...overrides,
  };
}

const READY_BASE_URL = 'http://127.0.0.1:7337/mcp';

describe('RecoderGitService server supervision', () => {
  it("stays 'starting' until the probe succeeds, then flips to 'ready'", async () => {
    let listening = false;
    const probe: ServerReadinessProbe = async () => listening;
    const handle = makeHandle(4321);
    const service = createRecoderGitService(
      serviceDeps({ spawnServer: () => handle, readinessProbe: probe })
    );

    const pending = service.ensureServer();
    // Synchronously observable BEFORE any probe succeeds: pid exists but the
    // server is not confirmed listening — no baseUrl is advertised.
    const starting = service.serverHealth();
    expect(starting.status).toBe('starting');
    expect(starting.baseUrl).toBeNull();
    expect(starting.pid).toBeNull();

    // Now let the loopback endpoint answer; the next poll confirms readiness.
    listening = true;
    const health = await pending;
    expect(health.status).toBe('ready');
    expect(health.baseUrl).toBe(READY_BASE_URL);
    expect(health.port).toBe(7337);
    expect(health.pid).toBe(4321);
    expect(health.reason).toBeUndefined();

    service.stopServer();
  });

  it("degrades to a truthful 'unavailable' (NOT ready) when the probe never succeeds, and stops the child", async () => {
    const handle = makeHandle(999);
    const service = createRecoderGitService(
      serviceDeps({
        spawnServer: () => handle,
        readinessProbe: async () => false,
        serverReadyTimeoutMs: 40,
        serverReadyIntervalMs: 5,
      })
    );

    const health = await service.ensureServer();
    expect(health.status).toBe('unavailable');
    expect(health.baseUrl).toBeNull();
    expect(health.pid).toBeNull();
    expect(health.reason).toMatch(/did not become ready/i);
    // The unresponsive child must be stopped — never left dangling.
    expect(handle.killCount).toBe(1);
  });

  it("degrades to 'unavailable' without probing when spawn returns no pid", async () => {
    let probeCalls = 0;
    const service = createRecoderGitService(
      serviceDeps({
        spawnServer: () => makeHandle(null),
        readinessProbe: async () => {
          probeCalls += 1;
          return true;
        },
      })
    );

    const health = await service.ensureServer();
    expect(health.status).toBe('unavailable');
    expect(health.baseUrl).toBeNull();
    expect(health.reason).toMatch(/no pid/i);
    expect(probeCalls).toBe(0);
  });

  it("degrades to 'unavailable' without spawning when the bin is unresolved", async () => {
    let spawnCalls = 0;
    const service = createRecoderGitService(
      serviceDeps({
        resolveBin: () => null,
        spawnServer: () => {
          spawnCalls += 1;
          return makeHandle(1);
        },
        readinessProbe: async () => true,
      })
    );

    const health = await service.ensureServer();
    expect(health.status).toBe('unavailable');
    expect(health.reason).toMatch(/bin not found/i);
    expect(spawnCalls).toBe(0);
  });

  it("reports 'unavailable' (baseUrl cleared) when a ready child later exits", async () => {
    const handle = makeHandle(555);
    const service = createRecoderGitService(
      serviceDeps({ spawnServer: () => handle, readinessProbe: async () => true })
    );

    const ready = await service.ensureServer();
    expect(ready.status).toBe('ready');
    expect(ready.baseUrl).toBe(READY_BASE_URL);

    handle.triggerExit(1);
    const after = service.serverHealth();
    expect(after.status).toBe('unavailable');
    expect(after.baseUrl).toBeNull();
    expect(after.reason).toMatch(/exited/i);
  });

  it('stopServer transitions cleanly and is idempotent', async () => {
    const handle = makeHandle(777);
    const service = createRecoderGitService(
      serviceDeps({ spawnServer: () => handle, readinessProbe: async () => true })
    );

    await service.ensureServer();
    expect(service.serverHealth().status).toBe('ready');

    service.stopServer();
    const stopped = service.serverHealth();
    expect(stopped.status).toBe('unavailable');
    expect(stopped.baseUrl).toBeNull();
    expect(handle.killCount).toBe(1);

    // Idempotent: a second stop neither throws nor re-kills the cleared handle.
    expect(() => service.stopServer()).not.toThrow();
    expect(handle.killCount).toBe(1);
  });

  it('is idempotent: a ready server is not re-spawned across calls', async () => {
    let spawnCalls = 0;
    const handle = makeHandle(321);
    const service = createRecoderGitService(
      serviceDeps({
        spawnServer: () => {
          spawnCalls += 1;
          return handle;
        },
        readinessProbe: async () => true,
      })
    );

    const first = await service.ensureServer();
    const second = await service.ensureServer();
    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    expect(spawnCalls).toBe(1);

    service.stopServer();
  });
});

describe('RecodergitAdapter health mapping (server truth)', () => {
  it("maps a probed-ready server to 'up' with the loopback baseUrl", async () => {
    const service = createRecoderGitService(
      serviceDeps({
        spawnServer: () => makeHandle(42),
        readinessProbe: async () => true,
      })
    );
    const adapter = new RecodergitAdapter({ config: config(), log, service });

    const ensure = await adapter.invoke({ op: 'ensure-server', input: {} });
    expect(ensure.ok).toBe(true);

    const health = await adapter.health();
    expect(health.status).toBe('up');
    expect(health.bindingPath).toBe(READY_BASE_URL);

    await adapter.stop();
  });

  it("maps a mid-probe 'starting' server to 'degraded' (branch is reachable, not dead)", async () => {
    // A probe that never resolves parks the poll loop in 'starting' so the
    // adapter's starting→degraded branch is genuinely observable.
    const neverProbe: ServerReadinessProbe = () =>
      new Promise<boolean>(() => {});
    const service = createRecoderGitService(
      serviceDeps({
        spawnServer: () => makeHandle(43),
        readinessProbe: neverProbe,
        serverReadyTimeoutMs: 60_000,
        serverReadyIntervalMs: 50,
      })
    );
    void service.ensureServer();
    expect(service.serverHealth().status).toBe('starting');

    const adapter = new RecodergitAdapter({ config: config(), log, service });
    const health = await adapter.health();
    expect(health.status).toBe('degraded');
    expect(health.reason).toMatch(/starting/i);
  });

  it("maps a probe-timeout server to a truthful 'down' with the real reason", async () => {
    const service = createRecoderGitService(
      serviceDeps({
        spawnServer: () => makeHandle(44),
        readinessProbe: async () => false,
        serverReadyTimeoutMs: 40,
        serverReadyIntervalMs: 5,
      })
    );
    const adapter = new RecodergitAdapter({ config: config(), log, service });

    // Drive the bring-up to its timeout degrade.
    await adapter.invoke({ op: 'ensure-server', input: {} });

    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(health.reason).toMatch(/did not become ready/i);
  });

  it("keeps the flag-disabled 'down' case green (no spawn, invoke fails truthfully)", async () => {
    const adapter = new RecodergitAdapter({
      config: config(),
      log,
      serviceDeps: { isEnabled: () => false },
    });

    const health = await adapter.health();
    expect(health.status).toBe('down');

    const res = await adapter.invoke({ op: 'ensure-server', input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('disabled');
  });
});
