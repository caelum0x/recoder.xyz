/**
 * @module codex-connector-runtime.test
 *
 * Comprehensive test suite for CodexConnectorRuntime.
 *
 * Covers:
 * - Constructor: default config, custom config override, env var parsing
 * - getState: returns correct state shape
 * - isRunning: false when stopped
 * - start / stop / restart: lifecycle transitions
 * - executeTask: returns CodexExecuteResult shape, error when not running
 * - getTaskStatus: delegates to JSON-RPC
 * - cancelTask: removes from activeTasks
 * - respondToApproval: approval response handling
 * - getHealth: health check shape
 * - Singleton: getCodexConnectorRuntime, resetCodexConnectorRuntime
 * - JSON-RPC: request ID management, pending request handling, timeout
 * - Event emission: status, stderr, approval-request, task-update
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter, Readable, Writable } from 'stream';
import type { ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

vi.mock('../agent-registry.service', () => ({
  getAgentRegistryService: () => ({
    get: vi.fn().mockReturnValue(undefined),
    selfRegister: vi.fn(),
    recordHeartbeat: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { spawn } from 'child_process';
import {
  CodexConnectorRuntime,
  getCodexConnectorRuntime,
  resetCodexConnectorRuntime,
  getCodexConnectorIdentity,
  type CodexConnectorConfig,
  type CodexConnectorState,
  type CodexExecuteInput,
  type CodexExecuteResult,
} from '../codex-connector-runtime.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock ChildProcess that emits 'spawn' immediately via nextTick. */
function createMockChildProcess(overrides: Partial<{
  pid: number;
  killed: boolean;
  emitSpawn: boolean;
}> = {}): ChildProcess {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  // Mark as writable
  Object.defineProperty(stdin, 'writable', { get: () => true });

  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  const proc = Object.assign(new EventEmitter(), {
    pid: overrides.pid ?? 99999,
    killed: overrides.killed ?? false,
    stdin,
    stdout,
    stderr,
    stdio: [stdin, stdout, stderr, null, null] as ChildProcess['stdio'],
    kill: vi.fn(() => {
      (proc as any).killed = true;
      return true;
    }),
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    spawnargs: [] as string[],
    spawnfile: '',
    connected: false,
    channel: undefined,
    [Symbol.dispose]: vi.fn(),
  }) as unknown as ChildProcess;

  // Emit 'spawn' on nextTick (unless disabled) — CodexConnectorRuntime
  // resolves spawnProcess() on the 'spawn' event.
  if (overrides.emitSpawn !== false) {
    process.nextTick(() => proc.emit('spawn'));
  }

  return proc;
}

/**
 * Set up the spawn mock to return a child process that emits 'spawn'
 * and whose stdin.write forwards JSON-RPC responses through stdout.
 */
function setupSpawnForSuccessfulStart(): ChildProcess {
  const proc = createMockChildProcess();
  (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

  // Intercept stdin writes and respond through stdout
  const originalWrite = proc.stdin!.write.bind(proc.stdin!);
  (proc.stdin as any).write = vi.fn(
    (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
      const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
      try {
        const req = JSON.parse(data.toString().replace(/\n$/, ''));
        if (req.id) {
          process.nextTick(() => {
            let result: unknown;
            if (req.method === 'tasks/send') {
              result = { result: 'Task completed successfully' };
            } else if (req.method === 'tasks/get') {
              result = { status: 'completed', taskId: req.params?.id };
            } else if (req.method === 'tasks/cancel') {
              result = { cancelled: true, taskId: req.params?.id };
            } else if (req.method === 'approvals/respond') {
              result = { acknowledged: true, id: req.params?.id };
            } else {
              result = {};
            }
            const response = JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n';
            proc.stdout!.push(response);
          });
        }
      } catch {
        // Not valid JSON (or notification), ignore
      }
      if (callback) callback();
      return true;
    },
  );

  return proc;
}

function makeCodexExecuteInput(overrides: Partial<CodexExecuteInput> = {}): CodexExecuteInput {
  return {
    taskId: 'codex-task-1',
    prompt: 'Implement the Fibonacci function',
    requester: { id: 'orchestrator', name: 'Orchestrator', platform: 'custom' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexConnectorRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetCodexConnectorRuntime();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe('constructor', () => {
    it('creates an instance with default config', () => {
      const runtime = new CodexConnectorRuntime();
      const state = runtime.getState();
      expect(state.status).toBe('stopped');
      expect(state.pid).toBeNull();
      expect(state.activeTasks).toBe(0);
    });

    it('merges custom config overrides', () => {
      const runtime = new CodexConnectorRuntime({
        command: '/opt/codex/bin/codex',
        requestTimeoutMs: 10_000,
        maxRestartAttempts: 5,
      });
      expect(runtime).toBeInstanceOf(CodexConnectorRuntime);
    });

    it('extends EventEmitter', () => {
      const runtime = new CodexConnectorRuntime();
      expect(runtime).toBeInstanceOf(EventEmitter);
    });

    it('accepts env-based defaults (string parsing)', () => {
      // The DEFAULT_CONFIG is set at module load time from process.env,
      // so we can verify the runtime can be constructed with defaults.
      const runtime = new CodexConnectorRuntime();
      expect(runtime.getState().status).toBe('stopped');
    });
  });

  // =========================================================================
  // getState
  // =========================================================================

  describe('getState', () => {
    it('returns the correct initial state shape', () => {
      const runtime = new CodexConnectorRuntime();
      const state = runtime.getState();

      expect(state).toEqual({
        status: 'stopped',
        pid: null,
        startedAt: null,
        lastActivity: null,
        restartCount: 0,
        error: null,
        pendingRequests: 0,
        activeTasks: 0,
      });
    });

    it('reflects running state after start', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();

      await runtime.start();

      const state = runtime.getState();
      expect(state.status).toBe('running');
      expect(state.pid).toBe(99999);
      expect(state.startedAt).toBeTruthy();
      expect(state.lastActivity).toBeTruthy();
    });
  });

  // =========================================================================
  // isRunning
  // =========================================================================

  describe('isRunning', () => {
    it('returns false when stopped', () => {
      const runtime = new CodexConnectorRuntime();
      expect(runtime.isRunning()).toBe(false);
    });

    it('returns true when running', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();
      expect(runtime.isRunning()).toBe(true);
    });

    it('returns false after stop', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();
      await runtime.stop();
      expect(runtime.isRunning()).toBe(false);
    });
  });

  // =========================================================================
  // start / stop / restart
  // =========================================================================

  describe('start', () => {
    it('transitions from stopped -> starting -> running', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      const statuses: string[] = [];
      runtime.on('status', (s: string) => statuses.push(s));

      await runtime.start();

      expect(statuses).toContain('starting');
      expect(statuses).toContain('running');
      expect(runtime.getState().status).toBe('running');
    });

    it('sets startedAt and lastActivity', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const state = runtime.getState();
      expect(state.startedAt).toBeTruthy();
      expect(state.lastActivity).toBeTruthy();
    });

    it('no-ops when already running', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      // Should not throw
      await runtime.start();
      expect(runtime.getState().status).toBe('running');
    });

    it('no-ops when already starting', async () => {
      // Use a process that emits spawn slowly
      const proc = createMockChildProcess({ emitSpawn: false });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      const runtime = new CodexConnectorRuntime();
      const startPromise = runtime.start();

      // Second call should return immediately because status is 'starting'
      const secondStart = runtime.start();

      // Now emit spawn to resolve the first call
      proc.emit('spawn');
      await startPromise;
      await secondStart;

      expect(runtime.getState().status).toBe('running');
    });

    it('transitions to error on spawn failure', async () => {
      const proc = createMockChildProcess({ emitSpawn: false });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      const runtime = new CodexConnectorRuntime();
      const errorEvents: Error[] = [];
      runtime.on('error', (e: Error) => errorEvents.push(e));

      const startPromise = runtime.start();

      // Emit error instead of spawn
      process.nextTick(() => proc.emit('error', new Error('spawn ENOENT')));

      await expect(startPromise).rejects.toThrow('spawn ENOENT');
      expect(runtime.getState().status).toBe('error');
    });

    it('times out if process never spawns', async () => {
      const proc = createMockChildProcess({ emitSpawn: false });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      const runtime = new CodexConnectorRuntime({ startupTimeoutMs: 200 });
      // Suppress unhandled error events
      runtime.on('error', () => {});

      const startPromise = runtime.start();

      // Attach .catch before advancing timers to avoid unhandled rejection
      const rejection = startPromise.catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(300);

      const err = await rejection;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/timed out/);
    });
  });

  describe('stop', () => {
    it('transitions from running -> stopping -> stopped', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const statuses: string[] = [];
      runtime.on('status', (s: string) => statuses.push(s));

      await runtime.stop();

      expect(statuses).toContain('stopping');
      expect(statuses).toContain('stopped');
      expect(runtime.getState().status).toBe('stopped');
    });

    it('resets startedAt on stop', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();
      expect(runtime.getState().startedAt).toBeTruthy();

      await runtime.stop();
      expect(runtime.getState().startedAt).toBeNull();
    });

    it('clears active tasks on stop', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      // Manually add an active task
      (runtime as any).activeTasks.add('task-x');
      expect(runtime.getState().activeTasks).toBe(1);

      await runtime.stop();
      expect(runtime.getState().activeTasks).toBe(0);
    });

    it('no-ops when already stopped', async () => {
      const runtime = new CodexConnectorRuntime();
      await runtime.stop(); // should not throw
      expect(runtime.getState().status).toBe('stopped');
    });

    it('kills the child process', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      await runtime.stop();
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('rejects all pending requests on stop', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      // Don't respond to stdin writes
      (proc.stdin as any).write = vi.fn((_data: any, encodingOrCb?: any, cb?: any) => {
        const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
        if (callback) callback();
        return true;
      });

      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      // Send a request that won't get answered
      const promise = (runtime as any).sendJsonRpc('tasks/send', { id: 'dangling' });

      // Stop should reject the pending request
      await runtime.stop();

      await expect(promise).rejects.toThrow('Codex connector is stopping');
    });
  });

  describe('restart', () => {
    it('stops then starts, incrementing restartCount', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      expect(runtime.getState().restartCount).toBe(0);

      // Re-setup spawn for restart
      setupSpawnForSuccessfulStart();
      await runtime.restart();

      expect(runtime.getState().restartCount).toBe(1);
      expect(runtime.isRunning()).toBe(true);
    });

    it('can restart multiple times', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      setupSpawnForSuccessfulStart();
      await runtime.restart();

      setupSpawnForSuccessfulStart();
      await runtime.restart();

      expect(runtime.getState().restartCount).toBe(2);
    });
  });

  // =========================================================================
  // getHealth
  // =========================================================================

  describe('getHealth', () => {
    it('returns unhealthy state when stopped', () => {
      const runtime = new CodexConnectorRuntime();
      const health = runtime.getHealth();

      expect(health.healthy).toBe(false);
      expect(health.status).toBe('stopped');
      expect(health.pid).toBeNull();
      expect(health.uptime).toBeNull();
    });

    it('returns healthy state when running', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const health = runtime.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.status).toBe('running');
      expect(health.pid).toBe(99999);
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('returns uptime as null when startedAt is null', () => {
      const runtime = new CodexConnectorRuntime();
      const health = runtime.getHealth();
      expect(health.uptime).toBeNull();
    });
  });

  // =========================================================================
  // executeTask
  // =========================================================================

  describe('executeTask', () => {
    it('returns error when not running', async () => {
      const runtime = new CodexConnectorRuntime();
      const result = await runtime.executeTask(makeCodexExecuteInput());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Codex connector is not running');
      expect(result.taskId).toBe('codex-task-1');
    });

    it('returns success result with correct shape', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const result = await runtime.executeTask(makeCodexExecuteInput());

      expect(result.taskId).toBe('codex-task-1');
      expect(result.success).toBe(true);
      expect(result.resultText).toBeDefined();
      expect(result.raw).toBeDefined();
    });

    it('tracks task in activeTasks during execution', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      // Delay the response so we can check activeTasks mid-flight
      let respondFn: (() => void) | null = null;
      (proc.stdin as any).write = vi.fn(
        (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          try {
            const req = JSON.parse(data.toString().replace(/\n$/, ''));
            if (req.id && req.method === 'tasks/send') {
              respondFn = () => {
                const response = JSON.stringify({
                  jsonrpc: '2.0',
                  id: req.id,
                  result: { result: 'Done' },
                }) + '\n';
                proc.stdout!.push(response);
              };
            }
          } catch { /* ignore */ }
          if (callback) callback();
          return true;
        },
      );

      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const executePromise = runtime.executeTask(makeCodexExecuteInput());

      // Before response, task should be active
      expect(runtime.getState().activeTasks).toBe(1);

      // Now respond
      respondFn!();
      const result = await executePromise;

      // After response, task should be removed from active
      expect(runtime.getState().activeTasks).toBe(0);
      expect(result.success).toBe(true);
    });

    it('handles sendJsonRpc rejection gracefully', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn(
        (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          try {
            const req = JSON.parse(data.toString().replace(/\n$/, ''));
            if (req.id && req.method === 'tasks/send') {
              process.nextTick(() => {
                proc.stdout!.push(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: req.id,
                    error: { code: -32000, message: 'Codex internal error' },
                  }) + '\n',
                );
              });
            }
          } catch { /* ignore */ }
          if (callback) callback();
          return true;
        },
      );

      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const result = await runtime.executeTask(makeCodexExecuteInput());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Codex internal error');
      // Task should be removed from activeTasks even on failure
      expect(runtime.getState().activeTasks).toBe(0);
    });

    it('passes artifacts to Codex', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const writtenData: string[] = [];
      const original = (proc.stdin as any).write;
      (proc.stdin as any).write = vi.fn(
        (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
          writtenData.push(data.toString());
          return original(data, encodingOrCb, cb);
        },
      );

      const result = await runtime.executeTask(
        makeCodexExecuteInput({
          artifacts: [{ filename: 'main.py', content: 'print("hello")' }],
        }),
      );

      // Verify the artifact was included in the JSON-RPC message
      const taskSendMsg = writtenData.find((d) => d.includes('tasks/send'));
      expect(taskSendMsg).toBeDefined();
      if (taskSendMsg) {
        const parsed = JSON.parse(taskSendMsg.replace(/\n$/, ''));
        expect(parsed.params.artifacts).toEqual([
          { filename: 'main.py', content: 'print("hello")' },
        ]);
      }
    });

    it('extracts resultText from string result field', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const result = await runtime.executeTask(makeCodexExecuteInput());
      expect(result.resultText).toBe('Task completed successfully');
    });
  });

  // =========================================================================
  // getTaskStatus
  // =========================================================================

  describe('getTaskStatus', () => {
    it('sends tasks/get JSON-RPC request', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const result = await runtime.getTaskStatus('task-42') as Record<string, unknown>;
      expect(result.status).toBe('completed');
      expect(result.taskId).toBe('task-42');
    });

    it('rejects when not running', async () => {
      const runtime = new CodexConnectorRuntime();
      // sendJsonRpc checks for writable stdin
      await expect(runtime.getTaskStatus('task-1')).rejects.toThrow();
    });
  });

  // =========================================================================
  // cancelTask
  // =========================================================================

  describe('cancelTask', () => {
    it('removes task from activeTasks and sends tasks/cancel', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      // Manually add the task to activeTasks
      (runtime as any).activeTasks.add('cancel-me');
      expect(runtime.getState().activeTasks).toBe(1);

      const result = await runtime.cancelTask('cancel-me') as Record<string, unknown>;
      expect(result.cancelled).toBe(true);
      expect(runtime.getState().activeTasks).toBe(0);
    });

    it('sends cancel even if task is not in activeTasks', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const result = await runtime.cancelTask('nonexistent') as Record<string, unknown>;
      expect(result.cancelled).toBe(true);
    });
  });

  // =========================================================================
  // respondToApproval
  // =========================================================================

  describe('respondToApproval', () => {
    it('sends approvals/respond with approved: true', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const result = await runtime.respondToApproval('approval-1', true, 'Looks good') as Record<string, unknown>;
      expect(result.acknowledged).toBe(true);
      expect(result.id).toBe('approval-1');
    });

    it('sends approvals/respond with approved: false', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const result = await runtime.respondToApproval('approval-2', false, 'Rejected') as Record<string, unknown>;
      expect(result.acknowledged).toBe(true);
    });

    it('sends without reason when omitted', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const writtenData: string[] = [];
      const original = (proc.stdin as any).write;
      (proc.stdin as any).write = vi.fn(
        (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
          writtenData.push(data.toString());
          return original(data, encodingOrCb, cb);
        },
      );

      await runtime.respondToApproval('approval-3', true);

      const approvalMsg = writtenData.find((d) => d.includes('approvals/respond'));
      expect(approvalMsg).toBeDefined();
      if (approvalMsg) {
        const parsed = JSON.parse(approvalMsg.replace(/\n$/, ''));
        expect(parsed.params.approved).toBe(true);
        expect(parsed.params.reason).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // JSON-RPC communication
  // =========================================================================

  describe('JSON-RPC communication', () => {
    it('increments request IDs', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const writtenData: string[] = [];
      const original = (proc.stdin as any).write;
      (proc.stdin as any).write = vi.fn(
        (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
          writtenData.push(data.toString());
          return original(data, encodingOrCb, cb);
        },
      );

      await runtime.getTaskStatus('t1');
      await runtime.getTaskStatus('t2');

      const ids = writtenData
        .filter((d) => d.includes('tasks/get'))
        .map((d) => {
          const parsed = JSON.parse(d.replace(/\n$/, ''));
          return Number(parsed.id);
        });

      // IDs should be sequential
      expect(ids[1]).toBeGreaterThan(ids[0]);
    });

    it('rejects on request timeout', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      // Don't respond to any requests
      (proc.stdin as any).write = vi.fn((_data: any, encodingOrCb?: any, cb?: any) => {
        const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
        if (callback) callback();
        return true;
      });

      const runtime = new CodexConnectorRuntime({ requestTimeoutMs: 100 });
      await runtime.start();

      const promise = runtime.getTaskStatus('slow-task');

      // Attach .catch before advancing timers to avoid unhandled rejection
      const rejection = promise.catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(200);

      const err = await rejection;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/timed out/);
    });

    it('handles JSON-RPC error responses', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn(
        (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          try {
            const req = JSON.parse(data.toString().replace(/\n$/, ''));
            if (req.id) {
              process.nextTick(() => {
                proc.stdout!.push(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: req.id,
                    error: { code: -32601, message: 'Method not found' },
                  }) + '\n',
                );
              });
            }
          } catch { /* ignore */ }
          if (callback) callback();
          return true;
        },
      );

      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      await expect(runtime.getTaskStatus('task-1')).rejects.toThrow('Method not found');
    });

    it('handles multiple responses in a single chunk', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn((_data: any, encodingOrCb?: any, cb?: any) => {
        const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
        if (callback) callback();
        return true;
      });

      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const p1 = (runtime as any).sendJsonRpc('m1', {});
      const p2 = (runtime as any).sendJsonRpc('m2', {});

      // Push both responses in one chunk
      proc.stdout!.push(
        JSON.stringify({ jsonrpc: '2.0', id: '1', result: 'r1' }) +
        '\n' +
        JSON.stringify({ jsonrpc: '2.0', id: '2', result: 'r2' }) +
        '\n',
      );

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('r1');
      expect(r2).toBe('r2');
    });

    it('handles partial lines across chunks', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn((_data: any, encodingOrCb?: any, cb?: any) => {
        const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
        if (callback) callback();
        return true;
      });

      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const p = (runtime as any).sendJsonRpc('split', {});

      const full = JSON.stringify({ jsonrpc: '2.0', id: '1', result: 'split-ok' });
      const half1 = full.slice(0, Math.floor(full.length / 2));
      const half2 = full.slice(Math.floor(full.length / 2)) + '\n';

      proc.stdout!.push(half1);
      await vi.advanceTimersByTimeAsync(10);
      proc.stdout!.push(half2);

      expect(await p).toBe('split-ok');
    });

    it('rejects when stdin is not writable', async () => {
      const runtime = new CodexConnectorRuntime();
      // process is null -> stdin not writable
      await expect(
        (runtime as any).sendJsonRpc('test', {}),
      ).rejects.toThrow('stdin is not writable');
    });

    it('rejects when stdin.write calls back with error', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn(
        (_data: any, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          if (callback) callback(new Error('broken pipe'));
          return true;
        },
      );

      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      await expect(
        (runtime as any).sendJsonRpc('test', {}),
      ).rejects.toThrow('broken pipe');
    });
  });

  // =========================================================================
  // Event emission
  // =========================================================================

  describe('event emission', () => {
    it('emits status events during start', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      const statuses: string[] = [];
      runtime.on('status', (s: string) => statuses.push(s));

      await runtime.start();
      expect(statuses).toEqual(['starting', 'running']);
    });

    it('emits status events during stop', async () => {
      setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const statuses: string[] = [];
      runtime.on('status', (s: string) => statuses.push(s));
      await runtime.stop();

      expect(statuses).toEqual(['stopping', 'stopped']);
    });

    it('emits stderr events', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const stderrMsgs: string[] = [];
      runtime.on('stderr', (m: string) => stderrMsgs.push(m));

      proc.stderr!.push(Buffer.from('codex warning\n'));
      await vi.advanceTimersByTimeAsync(10);

      expect(stderrMsgs).toContain('codex warning');
    });

    it('emits approval-request for incoming approval notifications', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const approvals: unknown[] = [];
      runtime.on('approval-request', (a: unknown) => approvals.push(a));

      // Push an approval request notification from Codex
      proc.stdout!.push(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'approvals/request',
          params: {
            taskId: 'task-99',
            id: 'approval-xyz',
            action: 'file-write',
            description: 'Write to /etc/hosts',
          },
        }) + '\n',
      );

      await vi.advanceTimersByTimeAsync(10);

      expect(approvals).toHaveLength(1);
      const a = approvals[0] as Record<string, unknown>;
      expect(a.taskId).toBe('task-99');
      expect(a.approvalId).toBe('approval-xyz');
      expect(a.action).toBe('file-write');
    });

    it('emits task-update for tasks/update notifications', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      const updates: unknown[] = [];
      runtime.on('task-update', (u: unknown) => updates.push(u));

      proc.stdout!.push(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'tasks/update',
          params: { taskId: 'task-99', status: 'working', progress: 50 },
        }) + '\n',
      );

      await vi.advanceTimersByTimeAsync(10);

      expect(updates).toHaveLength(1);
      expect((updates[0] as Record<string, unknown>).progress).toBe(50);
    });

    it('emits exit event on process exit', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime({ autoRestart: false });
      await runtime.start();

      const exits: unknown[] = [];
      runtime.on('exit', (e: unknown) => exits.push(e));

      proc.emit('exit', 0, null);
      await vi.advanceTimersByTimeAsync(10);

      expect(exits).toHaveLength(1);
      expect((exits[0] as Record<string, unknown>).code).toBe(0);
    });
  });

  // =========================================================================
  // Process exit handling
  // =========================================================================

  describe('process exit handling', () => {
    it('rejects all pending requests on exit', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn((_data: any, encodingOrCb?: any, cb?: any) => {
        const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
        if (callback) callback();
        return true;
      });

      const runtime = new CodexConnectorRuntime({ autoRestart: false });
      await runtime.start();

      const pending = (runtime as any).sendJsonRpc('tasks/get', { id: 't1' });

      proc.emit('exit', 1, 'SIGKILL');

      await expect(pending).rejects.toThrow('Codex process exited');
    });

    it('stderr buffer is bounded to 100 entries', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      // Push 120 stderr lines
      for (let i = 0; i < 120; i++) {
        proc.stderr!.push(Buffer.from(`error line ${i}\n`));
      }

      await vi.advanceTimersByTimeAsync(50);

      // Buffer should be bounded
      expect((runtime as any).stderrBuffer.length).toBeLessThanOrEqual(100);
    });
  });

  // =========================================================================
  // Singleton
  // =========================================================================

  describe('singleton', () => {
    it('getCodexConnectorRuntime returns the same instance', () => {
      const a = getCodexConnectorRuntime();
      const b = getCodexConnectorRuntime();
      expect(a).toBe(b);
    });

    it('getCodexConnectorRuntime accepts config on first call', () => {
      const instance = getCodexConnectorRuntime({ requestTimeoutMs: 5_000 });
      expect(instance).toBeInstanceOf(CodexConnectorRuntime);
    });

    it('resetCodexConnectorRuntime creates a fresh instance', () => {
      const a = getCodexConnectorRuntime();
      resetCodexConnectorRuntime();
      const b = getCodexConnectorRuntime();
      expect(a).not.toBe(b);
    });

    it('resetCodexConnectorRuntime removes listeners', () => {
      const instance = getCodexConnectorRuntime();
      const listener = vi.fn();
      instance.on('status', listener);

      resetCodexConnectorRuntime();

      // Old instance should have no listeners
      expect(instance.listenerCount('status')).toBe(0);
    });
  });

  // =========================================================================
  // getCodexConnectorIdentity
  // =========================================================================

  describe('getCodexConnectorIdentity', () => {
    it('returns identity with correct fields', () => {
      const identity = getCodexConnectorIdentity();
      expect(identity.id).toBe('codex-connector');
      expect(identity.name).toBe('OpenAI Codex CLI Connector');
      expect(identity.platform).toBe('codex');
    });

    it('returns a defensive copy', () => {
      const id1 = getCodexConnectorIdentity();
      const id2 = getCodexConnectorIdentity();
      expect(id1).not.toBe(id2);
      expect(id1).toEqual(id2);
    });
  });

  // =========================================================================
  // stdout non-JSON handling
  // =========================================================================

  describe('stdout non-JSON handling', () => {
    it('ignores non-JSON lines without crashing', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      // Push non-JSON content
      proc.stdout!.push('this is not json at all\n');
      proc.stdout!.push('another non-json line\n');
      await vi.advanceTimersByTimeAsync(10);

      expect(runtime.isRunning()).toBe(true);
    });

    it('ignores empty lines', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new CodexConnectorRuntime();
      await runtime.start();

      proc.stdout!.push('\n\n\n');
      await vi.advanceTimersByTimeAsync(10);

      expect(runtime.isRunning()).toBe(true);
    });
  });
});
