/**
 * Tests for the conductor ops-recorder-daemon spawn seam.
 *
 * These drive the REAL `ensureOpsRecorderDaemon` against a mocked
 * `node:child_process.spawn` and a stubbed `globalThis.fetch` (the ONLY
 * external IO — no real python needed), asserting the degrade-safe contract:
 *  - test-mode guard: never spawns under vitest without OPS_RECORDER_DAEMON_FORCE=1,
 *  - resolution precedence: external OPS_RECORDER_URL beats spawning,
 *  - auth preflight: no OPS_RECORDER_API_KEY and auth not disabled → no spawn
 *    (a keyless shell would 503 every forward — never fake availability),
 *  - spawned mode: health-checked boot exports OPS_RECORDER_URL for the
 *    existing `forwardToOpsRecorder` consumer,
 *  - missing python / health timeout resolve undefined without throwing,
 *  - `__resetOpsRecorderDaemonForTest` clears the memoized seam + exported env.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import {
  ensureOpsRecorderDaemon,
  opsRecorderDaemonHandle,
  resolveOpsRecorderPython,
  stopOpsRecorderDaemon,
  __resetOpsRecorderDaemonForTest,
} from './ops-recorder-daemon.js';

const spawnMock = vi.mocked(spawn);

const ENV_KEYS = [
  'OPS_RECORDER_URL',
  'OPS_RECORDER_PYTHON',
  'OPS_RECORDER_DAEMON_FORCE',
  'OPS_RECORDER_DAEMON_WAIT_MS',
  'OPS_RECORDER_LISTEN',
  'OPS_RECORDER_API_KEY',
  'OPS_RECORDER_AUTH_DISABLED',
  'NODE_ENV',
] as const;
const savedEnv: Record<string, string | undefined> = {};

class FakeChild extends EventEmitter {
  stderr = new EventEmitter();
  exitCode: number | null = null;
  pid = 4243;
  kill = vi.fn(() => true);
  unref = vi.fn();
}

function mockSpawnedChild(): FakeChild {
  const child = new FakeChild();
  spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}

function mockHealth(body: unknown = { status: 'ok' }, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function mockHealthDown(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }),
  );
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.NODE_ENV = 'test';
  delete process.env.OPS_RECORDER_URL;
  delete process.env.OPS_RECORDER_PYTHON;
  delete process.env.OPS_RECORDER_DAEMON_FORCE;
  delete process.env.OPS_RECORDER_LISTEN;
  delete process.env.OPS_RECORDER_API_KEY;
  delete process.env.OPS_RECORDER_AUTH_DISABLED;
  // Keep health-wait short so failure-path tests do not stall the suite.
  process.env.OPS_RECORDER_DAEMON_WAIT_MS = '200';
  __resetOpsRecorderDaemonForTest();
  spawnMock.mockReset();
});

afterEach(() => {
  __resetOpsRecorderDaemonForTest();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

describe('test-mode guard', () => {
  it('never spawns under the test runner without OPS_RECORDER_DAEMON_FORCE=1', async () => {
    const result = await ensureOpsRecorderDaemon();
    expect(result).toBeUndefined();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(opsRecorderDaemonHandle()).toBeUndefined();
  });
});

describe('resolution precedence', () => {
  it('external OPS_RECORDER_URL → reports external mode, does not spawn', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_URL = 'http://10.0.0.5:9100/';
    const result = await ensureOpsRecorderDaemon();
    expect(result).toEqual({ mode: 'external', url: 'http://10.0.0.5:9100' });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(opsRecorderDaemonHandle()).toEqual(result);
  });

  it('external URL wins even when a python interpreter is resolvable', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_URL = 'http://10.0.0.5:9100';
    process.env.OPS_RECORDER_PYTHON = process.execPath; // exists on disk
    process.env.OPS_RECORDER_API_KEY = 'k';
    const result = await ensureOpsRecorderDaemon();
    expect(result?.mode).toBe('external');
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('degrade-safe: auth preflight', () => {
  it('does not spawn when OPS_RECORDER_API_KEY is unset and auth is not disabled', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_PYTHON = process.execPath;
    const result = await ensureOpsRecorderDaemon();
    expect(result).toBeUndefined();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(process.env.OPS_RECORDER_URL).toBeUndefined();
  });

  it('OPS_RECORDER_AUTH_DISABLED=1 allows a keyless spawn (loopback-only dev)', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_PYTHON = process.execPath;
    process.env.OPS_RECORDER_AUTH_DISABLED = '1';
    mockSpawnedChild();
    mockHealth();

    const result = await ensureOpsRecorderDaemon();
    expect(result?.mode).toBe('spawned');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

describe('degrade-safe: missing python', () => {
  it('resolves undefined without spawning when the interpreter is absent', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_API_KEY = 'k';
    process.env.OPS_RECORDER_PYTHON = '/nonexistent/definitely-not-a-python3';
    const result = await ensureOpsRecorderDaemon();
    expect(result).toBeUndefined();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(process.env.OPS_RECORDER_URL).toBeUndefined();
  });

  it('resolveOpsRecorderPython returns undefined for a bad explicit OPS_RECORDER_PYTHON', () => {
    expect(
      resolveOpsRecorderPython({ OPS_RECORDER_PYTHON: '/nonexistent/python3', PATH: '' }),
    ).toBeUndefined();
  });
});

describe('spawned mode', () => {
  it('spawns uvicorn main:app, waits for health, exports OPS_RECORDER_URL', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_PYTHON = process.execPath;
    process.env.OPS_RECORDER_API_KEY = 'k';
    const child = mockSpawnedChild();
    mockHealth();

    const result = await ensureOpsRecorderDaemon();
    expect(result?.mode).toBe('spawned');
    expect(result?.url).toBe('http://127.0.0.1:8073');
    expect(result?.pythonBin).toBe(process.execPath);
    expect(result?.entrypoint).toMatch(/py\/ops-recorder\/work-signals\/main\.py$/);
    expect(result?.child).toBe(child);

    // The existing consumer reads this env per-call — it must now be set.
    expect(process.env.OPS_RECORDER_URL).toBe('http://127.0.0.1:8073');
    expect(opsRecorderDaemonHandle()).toBe(result);

    // Spawn contract: python -m uvicorn main:app, loopback bind, service cwd.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = spawnMock.mock.calls[0] as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv; cwd: string },
    ];
    expect(bin).toBe(process.execPath);
    expect(args).toEqual(['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8073']);
    // The child inherits the API key the forwarding consumer sends per-call.
    expect(opts.env.OPS_RECORDER_API_KEY).toBe('k');
    expect(opts.cwd).toMatch(/py\/ops-recorder\/work-signals$/);
  });

  it('is idempotent — a second ensure() reuses the memoized boot', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_PYTHON = process.execPath;
    process.env.OPS_RECORDER_API_KEY = 'k';
    mockSpawnedChild();
    mockHealth();

    const first = await ensureOpsRecorderDaemon();
    const second = await ensureOpsRecorderDaemon();
    expect(second).toBe(first);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('honors OPS_RECORDER_LISTEN for the bind address and exported URL', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_PYTHON = process.execPath;
    process.env.OPS_RECORDER_API_KEY = 'k';
    process.env.OPS_RECORDER_LISTEN = '127.0.0.1:8074';
    mockSpawnedChild();
    mockHealth();

    const result = await ensureOpsRecorderDaemon();
    expect(result?.url).toBe('http://127.0.0.1:8074');
    expect(process.env.OPS_RECORDER_URL).toBe('http://127.0.0.1:8074');
    const [, args] = spawnMock.mock.calls[0] as unknown as [string, string[]];
    expect(args).toContain('8074');
  });
});

describe('truthful health — never fake success', () => {
  it('kills the child and resolves undefined when health never comes up', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_PYTHON = process.execPath;
    process.env.OPS_RECORDER_API_KEY = 'k';
    process.env.OPS_RECORDER_DAEMON_WAIT_MS = '50';
    const child = mockSpawnedChild();
    mockHealthDown();

    const result = await ensureOpsRecorderDaemon();
    expect(result).toBeUndefined();
    expect(process.env.OPS_RECORDER_URL).toBeUndefined();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

describe('reset + stop seams', () => {
  it('__resetOpsRecorderDaemonForTest clears the memoized seam and exported env', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_PYTHON = process.execPath;
    process.env.OPS_RECORDER_API_KEY = 'k';
    mockSpawnedChild();
    mockHealth();

    await ensureOpsRecorderDaemon();
    expect(process.env.OPS_RECORDER_URL).toBe('http://127.0.0.1:8073');

    __resetOpsRecorderDaemonForTest();
    expect(opsRecorderDaemonHandle()).toBeUndefined();
    expect(process.env.OPS_RECORDER_URL).toBeUndefined();

    // A fresh ensure() runs the resolution again (new spawn attempt).
    mockSpawnedChild();
    await ensureOpsRecorderDaemon();
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('stopOpsRecorderDaemon kills the child, clears the handle + exported env', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_PYTHON = process.execPath;
    process.env.OPS_RECORDER_API_KEY = 'k';
    const child = mockSpawnedChild();
    mockHealth();

    await ensureOpsRecorderDaemon();
    stopOpsRecorderDaemon();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(opsRecorderDaemonHandle()).toBeUndefined();
    expect(process.env.OPS_RECORDER_URL).toBeUndefined();
  });

  it('does not clobber an operator-set OPS_RECORDER_URL on reset', async () => {
    process.env.OPS_RECORDER_DAEMON_FORCE = '1';
    process.env.OPS_RECORDER_URL = 'http://10.0.0.5:9100';
    await ensureOpsRecorderDaemon();
    __resetOpsRecorderDaemonForTest();
    // External mode never exported the var, so reset must leave it alone.
    expect(process.env.OPS_RECORDER_URL).toBe('http://10.0.0.5:9100');
  });
});
