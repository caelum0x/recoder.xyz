/**
 * Tests for the conductor colbert-daemon spawn seam.
 *
 * These drive the REAL `ensureColbertDaemon` against a mocked
 * `node:child_process.spawn` and a stubbed `globalThis.fetch` (the ONLY
 * external IO — no real python needed), asserting the degrade-safe contract:
 *  - test-mode guard: never spawns under vitest without COLBERT_DAEMON_FORCE=1,
 *  - resolution precedence: external COLBERT_RERANK_URL beats spawning,
 *  - spawned mode: health-checked boot exports COLBERT_RERANK_URL for the
 *    existing `colbertRerank` consumer,
 *  - truthful health: a booted shell WITHOUT rerank deps (rerank_available:false)
 *    is torn down and the URL is NOT exported (never fake health),
 *  - missing python / health timeout resolve undefined without throwing,
 *  - `__resetColbertDaemonForTest` clears the memoized seam + exported env.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import {
  ensureColbertDaemon,
  colbertDaemonHandle,
  resolveColbertPython,
  stopColbertDaemon,
  __resetColbertDaemonForTest,
} from './colbert-daemon.js';

const spawnMock = vi.mocked(spawn);

const ENV_KEYS = [
  'COLBERT_RERANK_URL',
  'COLBERT_PYTHON',
  'COLBERT_DAEMON_FORCE',
  'COLBERT_DAEMON_WAIT_MS',
  'COLBERT_RERANK_LISTEN',
  'NODE_ENV',
] as const;
const savedEnv: Record<string, string | undefined> = {};

class FakeChild extends EventEmitter {
  stderr = new EventEmitter();
  exitCode: number | null = null;
  pid = 4242;
  kill = vi.fn(() => true);
  unref = vi.fn();
}

function mockSpawnedChild(): FakeChild {
  const child = new FakeChild();
  spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}

function mockHealth(body: unknown, status = 200): void {
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
  delete process.env.COLBERT_RERANK_URL;
  delete process.env.COLBERT_PYTHON;
  delete process.env.COLBERT_DAEMON_FORCE;
  delete process.env.COLBERT_RERANK_LISTEN;
  // Keep health-wait short so failure-path tests do not stall the suite.
  process.env.COLBERT_DAEMON_WAIT_MS = '200';
  __resetColbertDaemonForTest();
  spawnMock.mockReset();
});

afterEach(() => {
  __resetColbertDaemonForTest();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

describe('test-mode guard', () => {
  it('never spawns under the test runner without COLBERT_DAEMON_FORCE=1', async () => {
    const result = await ensureColbertDaemon();
    expect(result).toBeUndefined();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(colbertDaemonHandle()).toBeUndefined();
  });
});

describe('resolution precedence', () => {
  it('external COLBERT_RERANK_URL → reports external mode, does not spawn', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_RERANK_URL = 'http://10.0.0.5:9000/';
    const result = await ensureColbertDaemon();
    expect(result).toEqual({ mode: 'external', url: 'http://10.0.0.5:9000' });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(colbertDaemonHandle()).toEqual(result);
  });

  it('external URL wins even when a python interpreter is resolvable', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_RERANK_URL = 'http://10.0.0.5:9000';
    process.env.COLBERT_PYTHON = process.execPath; // exists on disk
    const result = await ensureColbertDaemon();
    expect(result?.mode).toBe('external');
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('degrade-safe: missing python', () => {
  it('resolves undefined without spawning when the interpreter is absent', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_PYTHON = '/nonexistent/definitely-not-a-python3';
    const result = await ensureColbertDaemon();
    expect(result).toBeUndefined();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(process.env.COLBERT_RERANK_URL).toBeUndefined();
  });

  it('resolveColbertPython returns undefined for a bad explicit COLBERT_PYTHON', () => {
    expect(
      resolveColbertPython({ COLBERT_PYTHON: '/nonexistent/python3', PATH: '' }),
    ).toBeUndefined();
  });
});

describe('spawned mode', () => {
  it('spawns rerank_server.py, waits for health, exports COLBERT_RERANK_URL', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_PYTHON = process.execPath;
    const child = mockSpawnedChild();
    mockHealth({ rerank_available: true });

    const result = await ensureColbertDaemon();
    expect(result?.mode).toBe('spawned');
    expect(result?.url).toBe('http://127.0.0.1:8893');
    expect(result?.pythonBin).toBe(process.execPath);
    expect(result?.entrypoint).toMatch(/py\/colbert\/rerank_server\.py$/);
    expect(result?.child).toBe(child);

    // The existing consumer reads this env per-call — it must now be set.
    expect(process.env.COLBERT_RERANK_URL).toBe('http://127.0.0.1:8893');
    expect(colbertDaemonHandle()).toBe(result);

    // Spawn contract: python <entrypoint>, loopback bind via RERANK_HOST/PORT.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = spawnMock.mock.calls[0] as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv; cwd: string },
    ];
    expect(bin).toBe(process.execPath);
    expect(args[0]).toMatch(/rerank_server\.py$/);
    expect(opts.env.RERANK_HOST).toBe('127.0.0.1');
    expect(opts.env.PORT).toBe('8893');
    expect(opts.cwd).toMatch(/py\/colbert$/);
  });

  it('is idempotent — a second ensure() reuses the memoized boot', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_PYTHON = process.execPath;
    mockSpawnedChild();
    mockHealth({ rerank_available: true });

    const first = await ensureColbertDaemon();
    const second = await ensureColbertDaemon();
    expect(second).toBe(first);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('honors COLBERT_RERANK_LISTEN for the bind address and exported URL', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_PYTHON = process.execPath;
    process.env.COLBERT_RERANK_LISTEN = '127.0.0.1:8894';
    mockSpawnedChild();
    mockHealth({ rerank_available: true });

    const result = await ensureColbertDaemon();
    expect(result?.url).toBe('http://127.0.0.1:8894');
    expect(process.env.COLBERT_RERANK_URL).toBe('http://127.0.0.1:8894');
    const [, , opts] = spawnMock.mock.calls[0] as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(opts.env.PORT).toBe('8894');
  });
});

describe('truthful health — never fake success', () => {
  it('tears down a booted shell without rerank deps and does NOT export the URL', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_PYTHON = process.execPath;
    const child = mockSpawnedChild();
    mockHealth({ rerank_available: false });

    const result = await ensureColbertDaemon();
    expect(result).toBeUndefined();
    expect(process.env.COLBERT_RERANK_URL).toBeUndefined();
    expect(colbertDaemonHandle()).toBeUndefined();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('kills the child and resolves undefined when health never comes up', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_PYTHON = process.execPath;
    process.env.COLBERT_DAEMON_WAIT_MS = '50';
    const child = mockSpawnedChild();
    mockHealthDown();

    const result = await ensureColbertDaemon();
    expect(result).toBeUndefined();
    expect(process.env.COLBERT_RERANK_URL).toBeUndefined();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

describe('reset + stop seams', () => {
  it('__resetColbertDaemonForTest clears the memoized seam and exported env', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_PYTHON = process.execPath;
    mockSpawnedChild();
    mockHealth({ rerank_available: true });

    await ensureColbertDaemon();
    expect(process.env.COLBERT_RERANK_URL).toBe('http://127.0.0.1:8893');

    __resetColbertDaemonForTest();
    expect(colbertDaemonHandle()).toBeUndefined();
    expect(process.env.COLBERT_RERANK_URL).toBeUndefined();

    // A fresh ensure() runs the resolution again (new spawn attempt).
    mockSpawnedChild();
    await ensureColbertDaemon();
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('stopColbertDaemon kills the child, clears the handle + exported env', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_PYTHON = process.execPath;
    const child = mockSpawnedChild();
    mockHealth({ rerank_available: true });

    await ensureColbertDaemon();
    stopColbertDaemon();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(colbertDaemonHandle()).toBeUndefined();
    expect(process.env.COLBERT_RERANK_URL).toBeUndefined();
  });

  it('does not clobber an operator-set COLBERT_RERANK_URL on reset', async () => {
    process.env.COLBERT_DAEMON_FORCE = '1';
    process.env.COLBERT_RERANK_URL = 'http://10.0.0.5:9000';
    await ensureColbertDaemon();
    __resetColbertDaemonForTest();
    // External mode never exported the var, so reset must leave it alone.
    expect(process.env.COLBERT_RERANK_URL).toBe('http://10.0.0.5:9000');
  });
});
