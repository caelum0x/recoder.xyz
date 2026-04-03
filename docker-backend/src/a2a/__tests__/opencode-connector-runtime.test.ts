import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import type { ChildProcess } from 'child_process';

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
    selfRegister: vi.fn(),
  }),
}));

const publishMock = vi.fn();

vi.mock('../a2a-event-bus', () => ({
  A2AEventType: {
    TaskStream: 'task.stream',
  },
  getA2AEventBus: () => ({
    publish: publishMock,
  }),
}));

import { spawn } from 'child_process';
import {
  OpencodeConnectorRuntime,
  getOpencodeConnectorRuntime,
  resetOpencodeConnectorRuntime,
} from '../opencode-connector-runtime.service';

function createMockChildProcess(
  overrides: Partial<{
    pid: number;
    onSpawn: (proc: ChildProcess) => void;
    killReturns: boolean;
  }> = {},
): ChildProcess {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  const proc = Object.assign(new EventEmitter(), {
    pid: overrides.pid ?? 4242,
    stdout,
    stderr,
    stdio: [null, stdout, stderr, null, null] as ChildProcess['stdio'],
    kill: vi.fn(() => overrides.killReturns ?? true),
    stdin: null,
    connected: false,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    spawnargs: [] as string[],
    spawnfile: '',
    disconnect: vi.fn(),
    send: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    [Symbol.dispose]: vi.fn(),
  }) as unknown as ChildProcess;

  process.nextTick(() => {
    overrides.onSpawn?.(proc);
  });

  return proc;
}

function queueVersionAndRunProcesses(runProc: ChildProcess) {
  const versionProc = createMockChildProcess({
    pid: 1111,
    onSpawn(proc) {
      proc.emit('exit', 0, null);
    },
  });

  (spawn as unknown as ReturnType<typeof vi.fn>)
    .mockReturnValueOnce(versionProc)
    .mockReturnValueOnce(runProc);
}

describe('OpencodeConnectorRuntime', () => {
  beforeEach(() => {
    resetOpencodeConnectorRuntime();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    resetOpencodeConnectorRuntime();
  });

  it('starts by verifying the opencode command', async () => {
    const versionProc = createMockChildProcess({
      onSpawn(proc) {
        proc.emit('exit', 0, null);
      },
    });
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(versionProc);

    const runtime = new OpencodeConnectorRuntime({ command: 'opencode', startupTimeoutMs: 2_000 });
    await runtime.start();

    expect(runtime.isRunning()).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      'opencode',
      ['--version'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });

  it('executes a task via opencode run --format json and streams task output', async () => {
    const runProc = createMockChildProcess({ pid: 2222 });

    queueVersionAndRunProcesses(runProc);

    const runtime = new OpencodeConnectorRuntime({
      command: 'opencode',
      requestTimeoutMs: 5_000,
      startupTimeoutMs: 2_000,
    });
    await runtime.start();

    const pendingResult = runtime.executeTask({
      taskId: 'task-1',
      prompt: 'Fix the failing test',
      cwd: '/workspace/project',
      model: 'openrouter/anthropic/claude-sonnet-4',
      requester: { id: 'recoder-web', name: 'Recoder Web', platform: 'custom' },
      providerKeys: { openrouter: 'or-key' },
    });
    await Promise.resolve();
    runProc.stdout?.emit('data', Buffer.from(`${JSON.stringify({
      type: 'tool_use',
      sessionID: 'sess_123',
      part: { tool: 'bash', state: { status: 'completed' } },
    })}\n`));
    runProc.stdout?.emit('data', Buffer.from(`${JSON.stringify({
      type: 'text',
      sessionID: 'sess_123',
      part: { text: 'Applied the fix' },
    })}\n`));
    runProc.emit('exit', 0, null);
    const result = await pendingResult;

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('sess_123');
    expect(result.resultText).toBe('Applied the fix');
    expect(spawn).toHaveBeenLastCalledWith(
      'opencode',
      expect.arrayContaining([
        'run',
        '--format',
        'json',
        '--model',
        'openrouter/anthropic/claude-sonnet-4',
        '--dir',
        '/workspace/project',
        'Fix the failing test',
      ]),
      expect.objectContaining({
        cwd: '/workspace/project',
        env: expect.objectContaining({ OPENROUTER_API_KEY: 'or-key' }),
      }),
    );
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'task.stream',
      taskId: 'task-1',
      data: expect.objectContaining({ chunk: '[tool:bash] completed', done: false }),
    }));
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'task.stream',
      taskId: 'task-1',
      data: expect.objectContaining({ chunk: 'Applied the fix', done: false }),
    }));
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'task.stream',
      taskId: 'task-1',
      data: expect.objectContaining({ chunk: '', done: true }),
    }));
  });

  it('cancels a running task by killing the active child process', async () => {
    const runProc = createMockChildProcess({ pid: 3333 });

    queueVersionAndRunProcesses(runProc);

    const runtime = new OpencodeConnectorRuntime({
      command: 'opencode',
      requestTimeoutMs: 5_000,
      startupTimeoutMs: 2_000,
    });
    await runtime.start();

    const pendingResult = runtime.executeTask({
      taskId: 'task-2',
      prompt: 'Keep working',
      requester: { id: 'recoder-web', name: 'Recoder Web', platform: 'custom' },
    });
    await Promise.resolve();

    const cancel = await runtime.cancelTask('task-2', 'manual cancel');
    expect(cancel).toEqual({
      taskId: 'task-2',
      cancelled: true,
      reason: 'manual cancel',
    });

    runProc.emit('exit', null, 'SIGTERM');
    const result = await pendingResult;

    expect(runProc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result.success).toBe(false);
    expect(result.error).toBe('manual cancel');
  });

  it('exposes a singleton runtime', () => {
    const first = getOpencodeConnectorRuntime();
    const second = getOpencodeConnectorRuntime();
    expect(first).toBe(second);
  });
});
