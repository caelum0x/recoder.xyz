/**
 * @module windsurf-connector-runtime.test
 *
 * Tests for the Windsurf IDE connector runtime (Tier-2 scaffold).
 * Follows the same test patterns as claude-connector-runtime.test.ts
 * and codex-connector-runtime.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// Mock child_process.spawn
// ---------------------------------------------------------------------------

let mockProc: EventEmitter & {
  stdin: { writable: boolean; write: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

function createMockProc(): typeof mockProc {
  const proc = new EventEmitter() as typeof mockProc;
  proc.stdin = {
    writable: true,
    write: vi.fn((_data: string, cb?: (err?: Error) => void) => {
      if (cb) cb();
      return true;
    }),
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;
  proc.killed = false;
  proc.kill = vi.fn();
  return proc;
}

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockProc),
}));

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('./task-lifecycle.service', () => ({
  getTaskLifecycleService: () => ({
    createTask: vi.fn(() => ({ ok: true, data: { id: 'task-123' } })),
    transitionTask: vi.fn(() => ({ ok: true })),
  }),
  generateId: vi.fn((prefix: string) => `${prefix}-test-id`),
}));

vi.mock('./agent-registry.service', () => ({
  getAgentRegistryService: () => ({
    registerAgent: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  WindsurfConnectorRuntime,
  getWindsurfConnectorRuntime,
  resetWindsurfConnectorRuntime,
  getWindsurfConnectorIdentity,
} from '../windsurf-connector-runtime.service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WindsurfConnectorRuntime', () => {
  let runtime: WindsurfConnectorRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    mockProc = createMockProc();
    resetWindsurfConnectorRuntime();
    runtime = new WindsurfConnectorRuntime({
      command: 'windsurf',
      args: ['--bridge'],
      startupTimeoutMs: 5_000,
      requestTimeoutMs: 10_000,
      maxRestartAttempts: 2,
      restartDelayMs: 1_000,
      autoRestart: false,
    });
  });

  afterEach(async () => {
    if (runtime.isRunning()) {
      // Trigger exit event so stop() resolves under fake timers
      const stopPromise = runtime.stop();
      mockProc.emit('exit', 0, null);
      await stopPromise;
    }
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  it('starts and transitions to running', async () => {
    const startPromise = runtime.start();
    // checkReady fires at 500ms
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    expect(runtime.isRunning()).toBe(true);
    const state = runtime.getState();
    expect(state.status).toBe('running');
    expect(state.pid).toBe(12345);
    expect(state.startedAt).toBeTruthy();
  });

  it('stops a running connector', async () => {
    const startPromise = runtime.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    expect(runtime.isRunning()).toBe(true);

    const stopPromise = runtime.stop();
    // Trigger the exit event from the mock process
    mockProc.emit('exit', 0, null);
    await stopPromise;

    expect(runtime.isRunning()).toBe(false);
    expect(runtime.getState().status).toBe('stopped');
  });

  it('transitions to error on spawn failure', async () => {
    mockProc.pid = 0 as any;

    const startPromise = runtime.start();
    runtime.on('error', () => {}); // suppress unhandled error
    const rejection = startPromise.catch((e: Error) => e);

    // Trigger error from process
    mockProc.emit('error', new Error('spawn ENOENT'));
    await vi.advanceTimersByTimeAsync(600);

    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(runtime.getState().status).toBe('error');
  });

  it('rejects pending request after timeout', async () => {
    const startPromise = runtime.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    // Send a request that will never get a response
    const reqPromise = (runtime as any).sendJsonRpc('windsurf/execute', { prompt: 'test' });
    const rejection = reqPromise.catch((e: Error) => e);

    // Advance past requestTimeoutMs (10s)
    await vi.advanceTimersByTimeAsync(11_000);

    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('timed out');
  });

  // -----------------------------------------------------------------------
  // State and health
  // -----------------------------------------------------------------------

  it('returns stopped state before start', () => {
    const state = runtime.getState();
    expect(state.status).toBe('stopped');
    expect(state.pid).toBeNull();
    expect(state.pendingRequests).toBe(0);
  });

  it('reports healthy when running', async () => {
    const startPromise = runtime.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    const health = runtime.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.pid).toBe(12345);
  });

  it('reports unhealthy when in error state', () => {
    // Manually set error state
    (runtime as any).status = 'error';
    (runtime as any).lastError = 'something went wrong';

    const health = runtime.getHealth();
    expect(health.status).toBe('unhealthy');
    expect(health.message).toBe('something went wrong');
  });

  // -----------------------------------------------------------------------
  // JSON-RPC communication
  // -----------------------------------------------------------------------

  it('sends JSON-RPC request and resolves with response', async () => {
    const startPromise = runtime.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    const reqPromise = (runtime as any).sendJsonRpc('windsurf/execute', { prompt: 'hello' });

    // Verify the request was written to stdin
    expect(mockProc.stdin.write).toHaveBeenCalled();
    const writtenData = mockProc.stdin.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(writtenData.trim());
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.method).toBe('windsurf/execute');
    expect(parsed.params).toEqual({ prompt: 'hello' });

    // Simulate response from the process
    const responseId = parsed.id;
    mockProc.stdout.emit('data', Buffer.from(
      JSON.stringify({ jsonrpc: '2.0', id: responseId, result: { text: 'world' } }) + '\n',
    ));

    const result = await reqPromise;
    expect(result).toEqual({ text: 'world' });
  });

  it('rejects on JSON-RPC error response', async () => {
    const startPromise = runtime.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    const reqPromise = (runtime as any).sendJsonRpc('windsurf/bad', {});
    const rejection = reqPromise.catch((e: Error) => e);

    const writtenData = mockProc.stdin.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(writtenData.trim());
    const responseId = parsed.id;

    mockProc.stdout.emit('data', Buffer.from(
      JSON.stringify({
        jsonrpc: '2.0',
        id: responseId,
        error: { code: -32601, message: 'Method not found' },
      }) + '\n',
    ));

    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('Method not found');
  });

  // -----------------------------------------------------------------------
  // Task execution
  // -----------------------------------------------------------------------

  it('executes a task and returns result', async () => {
    const startPromise = runtime.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    const execPromise = runtime.executeTask({
      taskId: 'task-001',
      prompt: 'fix the bug',
      requester: { id: 'test-user', name: 'Tester', platform: 'recoder_web' },
    });

    // Get the written request and respond
    const writtenData = mockProc.stdin.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(writtenData.trim());

    mockProc.stdout.emit('data', Buffer.from(
      JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: 'Bug fixed!' }) + '\n',
    ));

    const result = await execPromise;
    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-001');
    expect(result.resultText).toBe('Bug fixed!');
  });

  it('returns failure when connector is not running', async () => {
    const result = await runtime.executeTask({
      taskId: 'task-002',
      prompt: 'do something',
      requester: { id: 'test', name: 'Test', platform: 'recoder_web' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not running');
  });

  // -----------------------------------------------------------------------
  // Identity and singleton
  // -----------------------------------------------------------------------

  it('returns connector identity', () => {
    const identity = getWindsurfConnectorIdentity();
    expect(identity.id).toBe('windsurf-connector');
    expect(identity.platform).toBe('windsurf');
  });

  it('singleton returns same instance', () => {
    const a = getWindsurfConnectorRuntime();
    const b = getWindsurfConnectorRuntime();
    expect(a).toBe(b);

    resetWindsurfConnectorRuntime();
    const c = getWindsurfConnectorRuntime();
    expect(c).not.toBe(a);
  });

  // -----------------------------------------------------------------------
  // Agent registry integration
  // -----------------------------------------------------------------------

  it('registers with agent registry', async () => {
    const startPromise = runtime.start();
    await vi.advanceTimersByTimeAsync(600);
    await startPromise;

    // Should not throw
    runtime.registerWithAgentRegistry();
  });

  // -----------------------------------------------------------------------
  // ConnectorProcess interface compliance
  // -----------------------------------------------------------------------

  it('implements ConnectorProcess properties', () => {
    expect(runtime.connectorId).toBe('windsurf');
    expect(runtime.platform).toBe('windsurf');
    expect(runtime.processRef).toBeNull();
    expect(runtime.getPid()).toBeNull();
  });
});
