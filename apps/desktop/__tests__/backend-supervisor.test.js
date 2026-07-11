/**
 * backend-supervisor tests.
 *
 * Exercise the supervisor's real logic — port pick, env assembly, tmux
 * resolution, secret persistence, health-poll (success + timeout + early exit),
 * mint, child lifecycle (spawn / crash-restart-with-backoff / stop) — using a
 * fake child process, a fake fetch/health server, and an in-memory fs. No
 * Electron runtime, no real backend, no network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  BackendSupervisor,
  PHASE,
  pickFreePort,
  resolveTmuxBin,
  loadOrCreateSecrets,
  assembleBackendEnv,
  backendUrlForPort,
  pollHealth,
  backoffMs,
} = require('../backend-supervisor.js');

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Minimal EventEmitter-ish stream stub. */
function makeStream() {
  const handlers = {};
  return {
    on(event, cb) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(cb);
      return this;
    },
    emit(event, ...args) {
      (handlers[event] || []).forEach((cb) => cb(...args));
    },
  };
}

/** A fake child process the fake spawn returns. */
function makeFakeChild() {
  const handlers = {};
  const child = {
    pid: 4242,
    killed: false,
    stdout: makeStream(),
    stderr: makeStream(),
    on(event, cb) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(cb);
      return this;
    },
    kill(signal) {
      this.killed = true;
      this._killSignal = signal;
      // Simulate async exit on kill.
      setTimeout(() => this._emit('exit', null, signal || 'SIGTERM'), 0);
      return true;
    },
    _emit(event, ...args) {
      (handlers[event] || []).forEach((cb) => cb(...args));
    },
  };
  return child;
}

/** In-memory fs stub covering the calls the supervisor makes. */
function makeMemFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  const dirs = new Set();
  return {
    files,
    existsSync: vi.fn((p) => files.has(p) || dirs.has(p)),
    readFileSync: vi.fn((p) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p);
    }),
    writeFileSync: vi.fn((p, data) => { files.set(p, data); }),
    appendFileSync: vi.fn((p, data) => { files.set(p, (files.get(p) || '') + data); }),
    mkdirSync: vi.fn((p) => { dirs.add(p); }),
    chmodSync: vi.fn(),
  };
}

const noopSleep = () => Promise.resolve();

function baseOptions(overrides = {}) {
  return {
    userDataDir: path.join(os.tmpdir(), 'recoder-sb-test-userdata'),
    repoRoot: '/repo',
    isPackaged: false,
    fs: makeMemFs(),
    spawn: vi.fn(() => makeFakeChild()),
    fetchImpl: vi.fn(),
    pickFreePort: vi.fn(() => Promise.resolve(45678)),
    // Deterministic: the preferred-port (3100) probe must never touch a real
    // socket in unit tests — force the pickFreePort path.
    portIsFree: vi.fn(() => Promise.resolve(false)),
    mintKey: vi.fn(() => Promise.resolve('sk_test_minted_key')),
    sleep: noopSleep,
    healthIntervalMs: 1,
    healthTimeoutMs: 50,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('pickFreePort', () => {
  it('resolves a usable loopback port number', async () => {
    const port = await pickFreePort();
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });
});

describe('resolveTmuxBin', () => {
  it('uses the repo c/tmux/tmux path in dev when it exists', () => {
    const existsSync = (p) => p === '/repo/c/tmux/tmux';
    const bin = resolveTmuxBin({ isPackaged: false, repoRoot: '/repo', existsSync });
    expect(bin).toBe('/repo/c/tmux/tmux');
  });

  it('prefers the bundled extraResources path when packaged', () => {
    const existsSync = (p) => p === '/Resources/backend/c/tmux/tmux';
    const bin = resolveTmuxBin({
      isPackaged: true,
      repoRoot: '/repo',
      resourcesPath: '/Resources',
      existsSync,
    });
    expect(bin).toBe('/Resources/backend/c/tmux/tmux');
  });

  it('returns a best-effort default (never empty) when nothing exists', () => {
    const bin = resolveTmuxBin({ isPackaged: false, repoRoot: '/repo', existsSync: () => false });
    expect(bin).toBeTruthy();
    expect(bin).toContain('tmux');
  });
});

describe('loadOrCreateSecrets', () => {
  it('generates and persists secrets on first run', () => {
    const fs = makeMemFs();
    const secretsPath = '/ud/secrets.json';
    const out = loadOrCreateSecrets({ secretsPath, fs });
    expect(out.apiKeyHashSalt).toMatch(/^[0-9a-f]{64}$/);
    expect(out.internalServiceKey).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.writeFileSync).toHaveBeenCalledWith(secretsPath, expect.any(String), expect.objectContaining({ mode: 0o600 }));
  });

  it('reuses persisted secrets on subsequent runs (stable salt)', () => {
    const fs = makeMemFs();
    const secretsPath = '/ud/secrets.json';
    const first = loadOrCreateSecrets({ secretsPath, fs });
    const second = loadOrCreateSecrets({ secretsPath, fs });
    expect(second).toEqual(first);
  });

  it('regenerates when the persisted secrets file is corrupt', () => {
    const fs = makeMemFs({ '/ud/secrets.json': 'not-json{' });
    const out = loadOrCreateSecrets({ secretsPath: '/ud/secrets.json', fs });
    expect(out.apiKeyHashSalt).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('assembleBackendEnv', () => {
  it('assembles a hermetic env without mutating the base env', () => {
    const baseEnv = { PATH: '/bin', NODE_ENV: undefined };
    const env = assembleBackendEnv({
      baseEnv,
      port: 45678,
      dataDir: '/ud/backend-data',
      tmuxBin: '/repo/c/tmux/tmux',
      apiKeyHashSalt: 'salt123',
      internalServiceKey: 'internal123',
    });
    expect(env.PORT).toBe('45678');
    expect(env.DATA_DIR).toBe('/ud/backend-data');
    expect(env.STRICT_AUTH).toBe('false');
    expect(env.API_KEY_HASH_SALT).toBe('salt123');
    expect(env.INTERNAL_SERVICE_KEY).toBe('internal123');
    expect(env.CONDUCTOR_TMUX_BIN).toBe('/repo/c/tmux/tmux');
    expect(env.RECODER_TMUX_BUILD_PATH).toBe('/repo/c/tmux/tmux');
    expect(env.TMUX_BIN).toBe('/repo/c/tmux/tmux');
    expect(env.PATH).toBe('/bin'); // base env preserved
    // Embedded desktop lowers the admission disk floor to 2GB (lightweight
    // worktrees on a single-user laptop), overridable via base env.
    expect(env.CONDUCTOR_MIN_FREE_DISK_GB).toBe('2');
    // base env object not mutated
    expect(baseEnv.PORT).toBeUndefined();
  });

  it('honors an operator-supplied CONDUCTOR_MIN_FREE_DISK_GB override', () => {
    const env = assembleBackendEnv({
      baseEnv: { CONDUCTOR_MIN_FREE_DISK_GB: '10' },
      port: 1,
      dataDir: '/d',
      tmuxBin: '/t',
      apiKeyHashSalt: 's',
      internalServiceKey: 'i',
    });
    expect(env.CONDUCTOR_MIN_FREE_DISK_GB).toBe('10');
  });

  it('omits ELECTRON_RUN_AS_NODE in dev (electronRunAsNode falsy)', () => {
    const env = assembleBackendEnv({
      baseEnv: {},
      port: 1,
      dataDir: '/d',
      tmuxBin: '/t',
      apiKeyHashSalt: 's',
      internalServiceKey: 'i',
    });
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it('sets ELECTRON_RUN_AS_NODE=1 when packaged (process.execPath is Electron)', () => {
    const env = assembleBackendEnv({
      baseEnv: {},
      port: 1,
      dataDir: '/d',
      tmuxBin: '/t',
      apiKeyHashSalt: 's',
      internalServiceKey: 'i',
      electronRunAsNode: true,
    });
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1');
  });
});

describe('backendUrlForPort', () => {
  it('builds a 127.0.0.1 loopback url', () => {
    expect(backendUrlForPort(3100)).toBe('http://127.0.0.1:3100');
  });
});

describe('backoffMs', () => {
  it('grows exponentially and caps', () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(100, { maxMs: 30000 })).toBe(30000);
  });
});

// ---------------------------------------------------------------------------
// Health polling
// ---------------------------------------------------------------------------

describe('pollHealth', () => {
  it('resolves ok on a 200 success envelope', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({ success: true, data: { available: true } }),
    }));
    const result = await pollHealth({
      backendUrl: 'http://127.0.0.1:45678',
      apiKey: 'sk_x',
      fetch: fetchImpl,
      sleep: noopSleep,
      timeoutMs: 1000,
      intervalMs: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // sends the key on both header forms
    const headers = fetchImpl.mock.calls[0][1].headers;
    expect(headers['x-api-key']).toBe('sk_x');
    expect(headers.Authorization).toBe('Bearer sk_x');
  });

  it('retries while the endpoint is not yet up, then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('ECONNREFUSED');
      return { status: 200, json: async () => ({ success: true }) };
    });
    const result = await pollHealth({
      backendUrl: 'http://127.0.0.1:45678',
      fetch: fetchImpl,
      sleep: noopSleep,
      timeoutMs: 1000,
      intervalMs: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('times out truthfully (never fakes ready)', async () => {
    let t = 0;
    const now = () => { t += 10; return t; };
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const result = await pollHealth({
      backendUrl: 'http://127.0.0.1:45678',
      fetch: fetchImpl,
      sleep: noopSleep,
      now,
      timeoutMs: 30,
      intervalMs: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/timeout/);
    expect(result.reason).toMatch(/ECONNREFUSED/);
  });

  it('bails out early when the backend process has exited', async () => {
    const fetchImpl = vi.fn();
    const result = await pollHealth({
      backendUrl: 'http://127.0.0.1:45678',
      fetch: fetchImpl,
      sleep: noopSleep,
      isAlive: () => false,
      timeoutMs: 1000,
      intervalMs: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('backend-process-exited');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Supervisor lifecycle
// ---------------------------------------------------------------------------

describe('BackendSupervisor.start', () => {
  it('requires userDataDir and repoRoot', () => {
    expect(() => new BackendSupervisor({})).toThrow(/userDataDir and repoRoot/);
  });

  it('picks a port, mints a key, spawns the child, and reaches READY on healthy backend', async () => {
    const child = makeFakeChild();
    const spawn = vi.fn(() => child);
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    const opts = baseOptions({ spawn, fetchImpl });
    const sup = new BackendSupervisor(opts);

    const result = await sup.start();

    expect(result.ok).toBe(true);
    expect(sup.phase).toBe(PHASE.READY);
    expect(sup.getStatus().ready).toBe(true);
    expect(opts.pickFreePort).toHaveBeenCalled();
    expect(opts.mintKey).toHaveBeenCalled();
    // spawn used tsx + src/server.ts in dev
    expect(spawn).toHaveBeenCalled();
    const [command, args] = spawn.mock.calls[0];
    expect(command).toContain('tsx');
    expect(args[0]).toContain('docker-backend/src/server.ts');
    // getAuth exposes the supervised backendUrl + minted key
    const auth = sup.getAuth();
    expect(auth).toEqual({ backendUrl: 'http://127.0.0.1:45678', apiKey: 'sk_test_minted_key' });
  });

  it('getAuth() returns null until READY (never points cockpit at a down backend)', async () => {
    const sup = new BackendSupervisor(baseOptions());
    expect(sup.getAuth()).toBeNull();
  });

  it('marks FAILED (not ready) when health never comes up, and kills the child', async () => {
    const child = makeFakeChild();
    const spawn = vi.fn(() => child);
    let t = 0;
    const now = () => { t += 20; return t; };
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const sup = new BackendSupervisor(baseOptions({
      spawn, fetchImpl, now, healthTimeoutMs: 40, healthIntervalMs: 1,
    }));

    const result = await sup.start();

    expect(result.ok).toBe(false);
    expect(sup.phase).toBe(PHASE.FAILED);
    expect(sup.getAuth()).toBeNull();
    expect(child.killed).toBe(true); // child cleaned up on failure
    expect(result.reason).toMatch(/health check failed/);
  });

  it('continues (warns) when key mint fails — STRICT_AUTH=false still serves loopback', async () => {
    const mintKey = vi.fn(() => Promise.reject(new Error('mint boom')));
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    const sup = new BackendSupervisor(baseOptions({ mintKey, fetchImpl }));

    const result = await sup.start();

    expect(result.ok).toBe(true);
    expect(sup.phase).toBe(PHASE.READY);
    expect(sup.getAuth()).toEqual({ backendUrl: 'http://127.0.0.1:45678', apiKey: null });
  });

  it('is idempotent: concurrent start() calls share one boot', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    const opts = baseOptions({ fetchImpl });
    const sup = new BackendSupervisor(opts);
    const [a, b] = await Promise.all([sup.start(), sup.start()]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // only one child spawned
    expect(opts.spawn).toHaveBeenCalledTimes(1);
  });
});

describe('BackendSupervisor crash + stop lifecycle', () => {
  it('restarts on crash with backoff (until READY) and clears the crash count', async () => {
    const children = [];
    const spawn = vi.fn(() => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    });
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    // jitter 0: the test waits backoffMs(1)+50, so any jitter > 50ms would
    // make the restart assertion time-dependent (flaky).
    const sup = new BackendSupervisor(
      baseOptions({ spawn, fetchImpl, maxRestarts: 3, restartJitterMs: 0 }),
    );

    await sup.start();
    expect(sup.phase).toBe(PHASE.READY);
    expect(children.length).toBe(1);

    // Simulate the running backend crashing.
    children[0]._emit('exit', 1, null);
    expect([PHASE.CRASHED, PHASE.STARTING, PHASE.READY]).toContain(sup.phase);
    expect(sup.restartCount).toBe(1);

    // Let the scheduled restart (backoff timer) fire.
    await new Promise((r) => setTimeout(r, backoffMs(1) + 50));
    expect(children.length).toBe(2); // a new child was spawned
    // After a successful restart the crash count resets.
    expect(sup.phase).toBe(PHASE.READY);
    expect(sup.restartCount).toBe(0);
  });

  it('gives up after maxRestarts and reports FAILED truthfully', async () => {
    const spawn = vi.fn(() => makeFakeChild());
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl, maxRestarts: 1 }));
    await sup.start();

    // First crash schedules restart #1; force restartCount to the cap and crash.
    sup.restartCount = 1;
    sup.child._emit('exit', 1, null);

    expect(sup.phase).toBe(PHASE.FAILED);
    expect(sup.lastError).toMatch(/giving up/);
  });

  it('stop() prevents restart and kills the child', async () => {
    const child = makeFakeChild();
    const spawn = vi.fn(() => child);
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl }));
    await sup.start();

    await sup.stop();
    expect(sup.phase).toBe(PHASE.STOPPED);
    expect(child.killed).toBe(true);

    // A late exit event after stop must NOT trigger a restart.
    const spawnCallsBefore = spawn.mock.calls.length;
    child._emit('exit', null, 'SIGTERM');
    await new Promise((r) => setTimeout(r, backoffMs(1) + 50));
    expect(spawn.mock.calls.length).toBe(spawnCallsBefore);
    expect(sup.phase).toBe(PHASE.STOPPED);
  });
});

describe('BackendSupervisor packaged spawn target', () => {
  it('runs node dist/server.js from resourcesPath/backend when packaged', async () => {
    const child = makeFakeChild();
    const spawn = vi.fn(() => child);
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    const sup = new BackendSupervisor(baseOptions({
      spawn,
      fetchImpl,
      isPackaged: true,
      resourcesPath: '/Resources',
    }));
    await sup.start();
    const [command, args, spawnOpts] = spawn.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args[0]).toBe(path.join('/Resources', 'backend', 'dist', 'server.js'));
    expect(spawnOpts.cwd).toBe(path.join('/Resources', 'backend'));
  });
});

// ---------------------------------------------------------------------------
// Fail-closed auth: the minted key must be REQUIRED, not decorative
// ---------------------------------------------------------------------------

describe('BackendSupervisor auth posture', () => {
  it('runs the child STRICT (fail-closed) when the key mint succeeded', async () => {
    const child = makeFakeChild();
    const spawn = vi.fn(() => child);
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl }));

    const result = await sup.start();

    expect(result.ok).toBe(true);
    const [, , spawnOpts] = spawn.mock.calls[0];
    expect(spawnOpts.env.STRICT_AUTH).toBe('true');
  });

  it('degrades to STRICT_AUTH=false ONLY when the mint failed (documented loopback fallback)', async () => {
    const child = makeFakeChild();
    const spawn = vi.fn(() => child);
    const mintKey = vi.fn(() => Promise.reject(new Error('mint boom')));
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    const sup = new BackendSupervisor(baseOptions({ spawn, mintKey, fetchImpl }));

    const result = await sup.start();

    expect(result.ok).toBe(true);
    const [, , spawnOpts] = spawn.mock.calls[0];
    expect(spawnOpts.env.STRICT_AUTH).toBe('false');
  });
});
