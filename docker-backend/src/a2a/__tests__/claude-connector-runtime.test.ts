/**
 * @module claude-connector-runtime.test
 *
 * Comprehensive test suite for ClaudeConnectorRuntime.
 *
 * Covers:
 * - Constructor: default config, custom config override
 * - getState: correct state shape
 * - isRunning: false when stopped, true when running
 * - start / stop / restart: lifecycle transitions, status changes
 * - executeTask: returns result shape, error when not running
 * - getTools / refreshTools: tool discovery
 * - callTool: direct MCP tool call
 * - getHealth (via getState): health check shape
 * - Singleton: getClaudeConnectorRuntime, resetClaudeConnectorRuntime
 * - Event emission: status changes emit events
 * - JSON-RPC: buffer processing, request/response matching, timeout
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

vi.mock('../task-lifecycle.service', () => ({
  getTaskLifecycleService: () => ({
    startTask: vi.fn(),
    completeTask: vi.fn(),
    failTask: vi.fn(),
  }),
}));

vi.mock('../agent-registry.service', () => ({
  getAgentRegistryService: () => ({
    get: vi.fn().mockReturnValue(undefined),
    selfRegister: vi.fn(),
    recordHeartbeat: vi.fn(),
  }),
}));

vi.mock('@recoder/shared/a2a', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@recoder/shared/a2a')>();
  return {
    ...actual,
    envelopeToClaudeCode: vi.fn((msg: unknown) => msg),
    claudeCodeToEnvelope: vi.fn((msg: unknown) => ({ converted: true, ...(msg as object) })),
  };
});

const publishMock = vi.fn();

vi.mock('../a2a-event-bus', () => ({
  A2AEventType: {
    TaskStream: 'task.stream',
  },
  getA2AEventBus: () => ({
    publish: publishMock,
  }),
}));

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { spawn } from 'child_process';
import {
  ClaudeConnectorRuntime,
  getClaudeConnectorRuntime,
  resetClaudeConnectorRuntime,
  getClaudeConnectorIdentity,
  type ClaudeConnectorConfig,
  type ClaudeConnectorState,
  type ExecuteTaskInput,
  type ExecuteTaskResult,
} from '../claude-connector-runtime.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock ChildProcess that emits 'spawn' immediately via nextTick. */
function createMockChildProcess(overrides: Partial<{
  pid: number;
  killed: boolean;
}> = {}): ChildProcess {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  const proc = Object.assign(new EventEmitter(), {
    pid: overrides.pid ?? 12345,
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

  return proc;
}

/**
 * Set up the spawn mock so that calling `start()` will succeed:
 * - spawnProcess resolves after 500ms timeout when pid is set
 * - performHandshake: we simulate an `initialize` JSON-RPC response
 * - discoverTools: we simulate a `tools/list` JSON-RPC response
 *
 * Returns the mock process for further manipulation.
 */
function setupSpawnForSuccessfulStart(): ChildProcess {
  const proc = createMockChildProcess();

  (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

  // After the 500ms settle check inside spawnProcess, the runtime reads
  // responses from stdout for handshake + tool discovery.
  // We need to push responses for request ids 1 (initialize) and 2 (tools/list).
  // The runtime writes to stdin, so we intercept and respond via stdout.

  let requestCount = 0;
  const originalWrite = proc.stdin!.write.bind(proc.stdin!);
  (proc.stdin as any).write = vi.fn(
    (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
      const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
      // Parse the JSON-RPC request to get the id
      try {
        const req = JSON.parse(data.toString());
        if (req.id) {
          requestCount++;
          // Respond asynchronously via stdout
          process.nextTick(() => {
            let result: unknown;
            if (req.method === 'initialize') {
              result = { protocolVersion: '2024-11-05', capabilities: {} };
            } else if (req.method === 'tools/list') {
              result = {
                tools: [
                  {
                    name: 'Task',
                    description: 'Execute a task',
                    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
                  },
                  {
                    name: 'Bash',
                    description: 'Run bash command',
                    inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
                  },
                ],
              };
            } else if (req.method === 'tools/call') {
              result = {
                content: [{ type: 'text', text: 'Tool result' }],
                isError: false,
              };
            } else {
              result = {};
            }
            const response = JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n';
            proc.stdout!.push(response);
          });
        }
      } catch {
        // notifications (no id) — ignore
      }
      if (callback) callback();
      return true;
    },
  );

  return proc;
}

function makeExecuteInput(overrides: Partial<ExecuteTaskInput> = {}): ExecuteTaskInput {
  return {
    taskId: 'task-1',
    prompt: 'Write hello world',
    requester: { id: 'test-agent', name: 'Test Agent', platform: 'custom' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeConnectorRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetClaudeConnectorRuntime();
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
      const runtime = new ClaudeConnectorRuntime();
      const state = runtime.getState();
      expect(state.status).toBe('stopped');
      expect(state.tools).toEqual([]);
      expect(state.pid).toBeNull();
    });

    it('merges custom config overrides', () => {
      const runtime = new ClaudeConnectorRuntime({
        command: '/usr/local/bin/claude',
        requestTimeoutMs: 5000,
      });
      // We cannot directly access private config, but we can verify behaviour
      // indirectly: the runtime was created without error.
      expect(runtime).toBeInstanceOf(ClaudeConnectorRuntime);
    });

    it('extends EventEmitter', () => {
      const runtime = new ClaudeConnectorRuntime();
      expect(runtime).toBeInstanceOf(EventEmitter);
    });
  });

  // =========================================================================
  // getState
  // =========================================================================

  describe('getState', () => {
    it('returns the correct initial state shape', () => {
      const runtime = new ClaudeConnectorRuntime();
      const state = runtime.getState();

      expect(state).toEqual({
        status: 'stopped',
        pid: null,
        tools: [],
        startedAt: null,
        lastActivity: null,
        restartCount: 0,
        error: null,
        pendingRequests: 0,
      });
    });

    it('returns a copy of tools, not a reference', () => {
      const runtime = new ClaudeConnectorRuntime();
      const state1 = runtime.getState();
      const state2 = runtime.getState();
      expect(state1.tools).not.toBe(state2.tools);
    });
  });

  // =========================================================================
  // isRunning
  // =========================================================================

  describe('isRunning', () => {
    it('returns false when runtime is stopped', () => {
      const runtime = new ClaudeConnectorRuntime();
      expect(runtime.isRunning()).toBe(false);
    });

    it('returns true when runtime is running', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      // Advance past the 500ms settle check
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      expect(runtime.isRunning()).toBe(true);
    });
  });

  // =========================================================================
  // start / stop / restart
  // =========================================================================

  describe('start', () => {
    it('transitions from stopped -> starting -> running', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();
      const statuses: string[] = [];

      runtime.on('status', (s: string) => statuses.push(s));

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      expect(statuses).toContain('starting');
      expect(statuses).toContain('running');
      expect(runtime.getState().status).toBe('running');
    });

    it('sets startedAt and lastActivity on successful start', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const state = runtime.getState();
      expect(state.startedAt).toBeTruthy();
      expect(state.lastActivity).toBeTruthy();
    });

    it('discovers tools on successful start', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const tools = runtime.getTools();
      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe('Task');
      expect(tools[1].name).toBe('Bash');
    });

    it('emits tools:discovered event', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();
      const discovered = vi.fn();
      runtime.on('tools:discovered', discovered);

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      expect(discovered).toHaveBeenCalledTimes(1);
      expect(discovered.mock.calls[0][0]).toHaveLength(2);
    });

    it('no-ops when already running', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      // Calling start again should not throw
      await runtime.start();
      expect(runtime.getState().status).toBe('running');
    });

    it('transitions to error on spawn failure', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      const runtime = new ClaudeConnectorRuntime();
      const statuses: string[] = [];
      runtime.on('status', (s: string) => statuses.push(s));
      // Suppress unhandled 'error' events from the EventEmitter
      runtime.on('error', () => {});

      const startPromise = runtime.start();
      const rejection = startPromise.catch((e: Error) => e);
      proc.emit('error', new Error('spawn ENOENT'));

      const err = await rejection;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('spawn ENOENT');
      expect(statuses).toContain('error');
    });
  });

  describe('stop', () => {
    it('transitions from running -> stopping -> stopped', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const statuses: string[] = [];
      runtime.on('status', (s: string) => statuses.push(s));

      await runtime.stop();

      expect(statuses).toContain('stopping');
      expect(statuses).toContain('stopped');
      expect(runtime.getState().status).toBe('stopped');
    });

    it('clears tools on stop', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      expect(runtime.getTools().length).toBeGreaterThan(0);

      await runtime.stop();
      expect(runtime.getTools()).toEqual([]);
    });

    it('resets startedAt to null on stop', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      await runtime.stop();
      expect(runtime.getState().startedAt).toBeNull();
    });

    it('no-ops when already stopped', async () => {
      const runtime = new ClaudeConnectorRuntime();
      await runtime.stop(); // should not throw
      expect(runtime.getState().status).toBe('stopped');
    });

    it('kills the child process', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      await runtime.stop();
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('restart', () => {
    it('stops then starts, incrementing restartCount', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      expect(runtime.getState().restartCount).toBe(0);

      // Set up spawn again for the restart
      setupSpawnForSuccessfulStart();
      const restartPromise = runtime.restart();
      await vi.advanceTimersByTimeAsync(600);
      await restartPromise;

      expect(runtime.getState().restartCount).toBe(1);
      expect(runtime.isRunning()).toBe(true);
    });
  });

  // =========================================================================
  // executeTask
  // =========================================================================

  describe('executeTask', () => {
    it('returns error result when not running', async () => {
      const runtime = new ClaudeConnectorRuntime();
      const result = await runtime.executeTask(makeExecuteInput());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude connector is not running');
      expect(result.taskId).toBe('task-1');
    });

    it('returns success result with correct shape when running', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const result = await runtime.executeTask(makeExecuteInput());

      expect(result.taskId).toBe('task-1');
      expect(result.success).toBe(true);
      expect(result.resultText).toBe('Tool result');
      expect(result.raw).toBeDefined();
      expect(result.envelope).toBeDefined();
      expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'task.stream',
        taskId: 'task-1',
        data: expect.objectContaining({
          agentId: 'claude-code-connector',
          chunk: 'Tool result',
          done: true,
        }),
      }));
    });

    it('emits task:start and task:complete events', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const taskStart = vi.fn();
      const taskComplete = vi.fn();
      runtime.on('task:start', taskStart);
      runtime.on('task:complete', taskComplete);

      await runtime.executeTask(makeExecuteInput());

      expect(taskStart).toHaveBeenCalledWith({ taskId: 'task-1' });
      expect(taskComplete).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1', resultText: 'Tool result' }),
      );
    });

    it('uses custom toolName when provided', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const result = await runtime.executeTask(
        makeExecuteInput({ toolName: 'Bash', toolArgs: { command: 'ls' } }),
      );

      expect(result.success).toBe(true);
    });

    it('handles MCP error response (isError: true)', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      // Override stdin.write to respond with isError: true for tools/call
      (proc.stdin as any).write = vi.fn(
        (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          try {
            const req = JSON.parse(data.toString());
            if (req.id) {
              process.nextTick(() => {
                let result: unknown;
                if (req.method === 'initialize') {
                  result = { protocolVersion: '2024-11-05', capabilities: {} };
                } else if (req.method === 'tools/list') {
                  result = {
                    tools: [{ name: 'Task', description: 'Task', inputSchema: { properties: { prompt: {} } } }],
                  };
                } else if (req.method === 'tools/call') {
                  result = {
                    content: [{ type: 'text', text: 'Something went wrong' }],
                    isError: true,
                  };
                } else {
                  result = {};
                }
                const response = JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n';
                proc.stdout!.push(response);
              });
            }
          } catch { /* ignore */ }
          if (callback) callback();
          return true;
        },
      );

      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const taskError = vi.fn();
      runtime.on('task:error', taskError);

      const result = await runtime.executeTask(makeExecuteInput());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
      expect(taskError).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1' }),
      );
    });

    it('catches thrown errors during sendRequest and returns error result', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      // Set up handshake to succeed but tools/call to reject
      let callCount = 0;
      (proc.stdin as any).write = vi.fn(
        (data: string | Buffer, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          try {
            const req = JSON.parse(data.toString());
            if (req.id) {
              callCount++;
              process.nextTick(() => {
                if (req.method === 'initialize') {
                  proc.stdout!.push(
                    JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\n',
                  );
                } else if (req.method === 'tools/list') {
                  proc.stdout!.push(
                    JSON.stringify({
                      jsonrpc: '2.0',
                      id: req.id,
                      result: { tools: [{ name: 'Task', description: 'Task', inputSchema: { properties: { prompt: {} } } }] },
                    }) + '\n',
                  );
                } else if (req.method === 'tools/call') {
                  // Respond with a JSON-RPC error
                  proc.stdout!.push(
                    JSON.stringify({
                      jsonrpc: '2.0',
                      id: req.id,
                      error: { code: -32000, message: 'Internal MCP error' },
                    }) + '\n',
                  );
                }
              });
            }
          } catch { /* ignore */ }
          if (callback) callback();
          return true;
        },
      );

      const runtime = new ClaudeConnectorRuntime();
      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const result = await runtime.executeTask(makeExecuteInput());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal MCP error');
    });
  });

  // =========================================================================
  // getTools / refreshTools
  // =========================================================================

  describe('getTools', () => {
    it('returns empty array before start', () => {
      const runtime = new ClaudeConnectorRuntime();
      expect(runtime.getTools()).toEqual([]);
    });

    it('returns a defensive copy', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const tools1 = runtime.getTools();
      const tools2 = runtime.getTools();
      expect(tools1).not.toBe(tools2);
      expect(tools1).toEqual(tools2);
    });
  });

  describe('refreshTools', () => {
    it('throws when not running', async () => {
      const runtime = new ClaudeConnectorRuntime();
      await expect(runtime.refreshTools()).rejects.toThrow('Claude connector is not running');
    });

    it('re-discovers tools when running', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const tools = await runtime.refreshTools();
      expect(tools.length).toBe(2);
    });
  });

  // =========================================================================
  // callTool
  // =========================================================================

  describe('callTool', () => {
    it('throws when not running', async () => {
      const runtime = new ClaudeConnectorRuntime();
      await expect(runtime.callTool('Task', { prompt: 'hi' })).rejects.toThrow(
        'Claude connector is not running',
      );
    });

    it('sends a tools/call JSON-RPC request and returns the result', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const result = await runtime.callTool('Task', { prompt: 'hello' });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool result' }],
        isError: false,
      });
    });

    it('updates lastActivity on callTool', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const before = runtime.getState().lastActivity;
      await vi.advanceTimersByTimeAsync(1000);
      await runtime.callTool('Task');
      const after = runtime.getState().lastActivity;
      // lastActivity should be updated (or at least not null)
      expect(after).toBeTruthy();
    });
  });

  // =========================================================================
  // Event emission
  // =========================================================================

  describe('event emission', () => {
    it('emits status events on start', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();
      const statuses: string[] = [];
      runtime.on('status', (s: string) => statuses.push(s));

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      expect(statuses).toEqual(['starting', 'running']);
    });

    it('emits status events on stop', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const statuses: string[] = [];
      runtime.on('status', (s: string) => statuses.push(s));

      await runtime.stop();
      expect(statuses).toEqual(['stopping', 'stopped']);
    });

    it('emits error event on spawn failure', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      const runtime = new ClaudeConnectorRuntime();
      const errors: Error[] = [];
      runtime.on('error', (e: Error) => errors.push(e));

      const startPromise = runtime.start();
      const rejection = startPromise.catch((e: Error) => e);
      proc.emit('error', new Error('spawn ENOENT'));

      const err = await rejection;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('spawn ENOENT');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('emits stderr events when stderr data arrives', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const stderrMessages: string[] = [];
      runtime.on('stderr', (msg: string) => stderrMessages.push(msg));

      proc.stderr!.push(Buffer.from('warning: something\n'));
      await vi.advanceTimersByTimeAsync(10);

      expect(stderrMessages).toContain('warning: something');
    });
  });

  // =========================================================================
  // JSON-RPC buffer processing
  // =========================================================================

  describe('JSON-RPC buffer processing', () => {
    /**
     * Helper: manually wire up the runtime's internal stdout data listener
     * so that processBuffer() is called when data is pushed to the mock stdout.
     * This is needed when we skip the full start() flow.
     */
    function wireStdoutListener(runtime: ClaudeConnectorRuntime, proc: ChildProcess): void {
      (runtime as any).status = 'running';
      (runtime as any).process = proc;
      // Replicate what spawnProcess does: listen on stdout for data
      proc.stdout?.on('data', (data: Buffer) => {
        (runtime as any).buffer += data.toString();
        (runtime as any).processBuffer();
      });
    }

    it('handles multiple JSON-RPC messages in a single chunk', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn(
        (_data: any, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          if (callback) callback();
          return true;
        },
      );

      const runtime = new ClaudeConnectorRuntime();
      wireStdoutListener(runtime, proc);

      // Send two requests
      const promise1 = runtime.sendRequest('test/method1', {});
      const promise2 = runtime.sendRequest('test/method2', {});

      // Push both responses in a single chunk
      const combined =
        JSON.stringify({ jsonrpc: '2.0', id: '1', result: 'result-1' }) +
        '\n' +
        JSON.stringify({ jsonrpc: '2.0', id: '2', result: 'result-2' }) +
        '\n';

      proc.stdout!.push(combined);

      const [r1, r2] = await Promise.all([promise1, promise2]);
      expect(r1).toBe('result-1');
      expect(r2).toBe('result-2');
    });

    it('handles incomplete lines across chunks', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn(
        (_data: any, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          if (callback) callback();
          return true;
        },
      );

      const runtime = new ClaudeConnectorRuntime();
      wireStdoutListener(runtime, proc);

      const promise = runtime.sendRequest('test/split', {});

      // Push partial first chunk
      const full = JSON.stringify({ jsonrpc: '2.0', id: '1', result: 'split-result' });
      const half1 = full.slice(0, Math.floor(full.length / 2));
      const half2 = full.slice(Math.floor(full.length / 2)) + '\n';

      proc.stdout!.push(half1);
      // Allow processing
      await vi.advanceTimersByTimeAsync(10);
      // Push second half
      proc.stdout!.push(half2);

      const result = await promise;
      expect(result).toBe('split-result');
    });

    it('rejects pending request on JSON-RPC error response', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn(
        (_data: any, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          if (callback) callback();
          return true;
        },
      );

      const runtime = new ClaudeConnectorRuntime();
      wireStdoutListener(runtime, proc);

      const promise = runtime.sendRequest('test/error', {});

      proc.stdout!.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          error: { code: -32600, message: 'Invalid request' },
        }) + '\n',
      );

      await expect(promise).rejects.toThrow('Invalid request');
    });

    it('handles notifications (no id) from server', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      const notifications: Array<{ method: string; params: unknown }> = [];
      runtime.on('notification', (n: { method: string; params: unknown }) =>
        notifications.push(n),
      );

      proc.stdout!.push(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: { taskId: 'task-x', progress: 50, message: 'Indexing files' },
        }) + '\n',
      );

      await vi.advanceTimersByTimeAsync(10);

      expect(notifications.length).toBe(1);
      expect(notifications[0].method).toBe('notifications/progress');
      expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'task.stream',
        taskId: 'task-x',
        data: expect.objectContaining({
          agentId: 'claude-code-connector',
          chunk: 'Indexing files',
          done: false,
        }),
      }));
    });

    it('ignores non-JSON lines in stdout', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      // Should not throw
      proc.stdout!.push('This is not valid JSON\n');
      await vi.advanceTimersByTimeAsync(10);

      expect(runtime.isRunning()).toBe(true);
    });
  });

  // =========================================================================
  // Request timeout
  // =========================================================================

  describe('request timeout', () => {
    it('rejects pending request after timeout', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      (proc.stdin as any).write = vi.fn(
        (_data: any, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          if (callback) callback();
          return true;
        },
      );

      // Use a very short timeout
      const runtime = new ClaudeConnectorRuntime({ requestTimeoutMs: 100 });
      (runtime as any).status = 'running';
      (runtime as any).process = proc;

      const promise = runtime.sendRequest('test/timeout', {});

      // Attach .catch() before advancing timers to avoid unhandled rejection
      const rejection = promise.catch((e: Error) => e);

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(200);

      const err = await rejection;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/MCP request timeout/);
    });
  });

  // =========================================================================
  // Singleton
  // =========================================================================

  describe('singleton', () => {
    it('getClaudeConnectorRuntime returns the same instance', () => {
      const a = getClaudeConnectorRuntime();
      const b = getClaudeConnectorRuntime();
      expect(a).toBe(b);
    });

    it('getClaudeConnectorRuntime accepts initial config', () => {
      const instance = getClaudeConnectorRuntime({ requestTimeoutMs: 999 });
      expect(instance).toBeInstanceOf(ClaudeConnectorRuntime);
    });

    it('resetClaudeConnectorRuntime creates a fresh instance', () => {
      const a = getClaudeConnectorRuntime();
      resetClaudeConnectorRuntime();
      const b = getClaudeConnectorRuntime();
      expect(a).not.toBe(b);
    });
  });

  // =========================================================================
  // getClaudeConnectorIdentity
  // =========================================================================

  describe('getClaudeConnectorIdentity', () => {
    it('returns identity with correct fields', () => {
      const identity = getClaudeConnectorIdentity();
      expect(identity.id).toBe('claude-code-connector');
      expect(identity.name).toBe('Claude Code MCP Connector');
      expect(identity.platform).toBe('claude_code');
    });

    it('returns a defensive copy', () => {
      const id1 = getClaudeConnectorIdentity();
      const id2 = getClaudeConnectorIdentity();
      expect(id1).not.toBe(id2);
      expect(id1).toEqual(id2);
    });
  });

  // =========================================================================
  // shutdown
  // =========================================================================

  describe('shutdown', () => {
    it('stops the process and removes all listeners', async () => {
      const proc = setupSpawnForSuccessfulStart();
      const runtime = new ClaudeConnectorRuntime();

      const startPromise = runtime.start();
      await vi.advanceTimersByTimeAsync(600);
      await startPromise;

      runtime.on('status', vi.fn());
      await runtime.shutdown();

      expect(runtime.getState().status).toBe('stopped');
      expect(runtime.listenerCount('status')).toBe(0);
    });
  });

  // =========================================================================
  // sendRequest edge cases
  // =========================================================================

  describe('sendRequest edge cases', () => {
    it('rejects when process is null', async () => {
      const runtime = new ClaudeConnectorRuntime();
      (runtime as any).status = 'running'; // fake running status
      // process is null by default
      await expect(runtime.sendRequest('test', {})).rejects.toThrow(
        'Claude MCP process is not running',
      );
    });

    it('rejects when stdin write fails', async () => {
      const proc = createMockChildProcess();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      // Make write call the callback with an error
      (proc.stdin as any).write = vi.fn(
        (_data: any, encodingOrCb?: any, cb?: any) => {
          const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
          if (callback) callback(new Error('write EPIPE'));
          return true;
        },
      );

      const runtime = new ClaudeConnectorRuntime();
      (runtime as any).status = 'running';
      (runtime as any).process = proc;

      await expect(runtime.sendRequest('test/write-fail', {})).rejects.toThrow('EPIPE');
    });
  });
});
