/**
 * Tests for omo-connector-runtime.service — OMO (oh-my-openagent) CLI
 * subprocess adapter.
 *
 * Tests pure functions (buildOmoArgs, buildOmoEnv, extractOmoSessionId)
 * and mocked subprocess execution for the runtime class.
 */

import { EventEmitter } from 'events';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// Mock child_process.spawn before importing the module under test
const mockChildren: Array<EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn>; pid: number }> = [];

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    child.pid = 12345;
    mockChildren.push(child);
    return child;
  }),
}));

import {
  buildOmoArgs,
  buildOmoEnv,
  extractOmoSessionId,
  OmoConnectorRuntime,
  getOmoConnectorRuntime,
  resetOmoConnectorRuntime,
} from '../omo-connector-runtime.service';

describe('buildOmoArgs', () => {
  it('includes the prompt as the last argument', () => {
    const args = buildOmoArgs({ taskId: 't1', prompt: 'Fix the bug' });
    expect(args[args.length - 1]).toBe('Fix the bug');
  });

  it('includes --model flag when provided', () => {
    const args = buildOmoArgs({
      taskId: 't1',
      prompt: 'test',
      model: 'openrouter/anthropic/claude-sonnet-4.5',
    });
    expect(args).toContain('--model');
    expect(args).toContain('openrouter/anthropic/claude-sonnet-4.5');
  });

  it('includes --session flag when sessionId provided', () => {
    const args = buildOmoArgs({
      taskId: 't1',
      prompt: 'test',
      sessionId: 'sess_abc123',
    });
    expect(args).toContain('--session');
    expect(args).toContain('sess_abc123');
  });

  it('includes --continue flag when continueSession is true', () => {
    const args = buildOmoArgs({
      taskId: 't1',
      prompt: 'test',
      continueSession: true,
    });
    expect(args).toContain('--continue');
  });

  it('prefers sessionId over continueSession', () => {
    const args = buildOmoArgs({
      taskId: 't1',
      prompt: 'test',
      sessionId: 'sess_1',
      continueSession: true,
    });
    expect(args).toContain('--session');
    expect(args).toContain('sess_1');
    expect(args).not.toContain('--continue');
  });

  it('uses OMO_MODEL env default when no model provided', () => {
    const original = process.env.OMO_MODEL;
    process.env.OMO_MODEL = 'custom/default-model';
    try {
      const args = buildOmoArgs({ taskId: 't1', prompt: 'test' });
      expect(args).toContain('custom/default-model');
    } finally {
      if (original === undefined) delete process.env.OMO_MODEL;
      else process.env.OMO_MODEL = original;
    }
  });
});

describe('buildOmoEnv', () => {
  it('forwards OpenRouter key', () => {
    const env = buildOmoEnv({
      taskId: 't1',
      prompt: 'test',
      providerKeys: { openrouter: 'sk-or-test' },
    });
    expect(env.OPENROUTER_API_KEY).toBe('sk-or-test');
  });

  it('forwards OpenAI key', () => {
    const env = buildOmoEnv({
      taskId: 't1',
      prompt: 'test',
      providerKeys: { openai: 'sk-openai-test' },
    });
    expect(env.OPENAI_API_KEY).toBe('sk-openai-test');
  });

  it('forwards Anthropic key', () => {
    const env = buildOmoEnv({
      taskId: 't1',
      prompt: 'test',
      providerKeys: { anthropic: 'sk-ant-test' },
    });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
  });

  it('forwards Google key (prefers google over gemini)', () => {
    const env = buildOmoEnv({
      taskId: 't1',
      prompt: 'test',
      providerKeys: { google: 'sk-google', gemini: 'sk-gemini' },
    });
    expect(env.GEMINI_API_KEY).toBe('sk-google');
  });

  it('falls back to gemini when google not provided', () => {
    const env = buildOmoEnv({
      taskId: 't1',
      prompt: 'test',
      providerKeys: { gemini: 'sk-gemini' },
    });
    expect(env.GEMINI_API_KEY).toBe('sk-gemini');
  });

  it('preserves process.env', () => {
    const env = buildOmoEnv({ taskId: 't1', prompt: 'test' });
    // process.env always has PATH
    expect(env.PATH).toBeTruthy();
  });

  it('merges custom env after process.env', () => {
    const env = buildOmoEnv({
      taskId: 't1',
      prompt: 'test',
      env: { CUSTOM_VAR: 'custom-value' },
    });
    expect(env.CUSTOM_VAR).toBe('custom-value');
  });

  it('forwards multiple keys together', () => {
    const env = buildOmoEnv({
      taskId: 't1',
      prompt: 'test',
      providerKeys: {
        openrouter: 'sk-or',
        openai: 'sk-openai',
        anthropic: 'sk-ant',
      },
    });
    expect(env.OPENROUTER_API_KEY).toBe('sk-or');
    expect(env.OPENAI_API_KEY).toBe('sk-openai');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant');
  });
});

describe('extractOmoSessionId', () => {
  it('extracts session ID from standard output', () => {
    const output = 'Starting OMO...\nSession: sess_abc123\nRunning tool...';
    expect(extractOmoSessionId(output)).toBe('sess_abc123');
  });

  it('handles whitespace variations', () => {
    expect(extractOmoSessionId('Session:    sess_xyz')).toBe('sess_xyz');
    expect(extractOmoSessionId('Session:sess_tight')).toBe('sess_tight');
  });

  it('returns undefined when no session ID in output', () => {
    expect(extractOmoSessionId('No session info here')).toBeUndefined();
    expect(extractOmoSessionId('')).toBeUndefined();
  });

  it('extracts first match when multiple present', () => {
    const output = 'Session: sess_first\nSession: sess_second';
    expect(extractOmoSessionId(output)).toBe('sess_first');
  });

  it('handles alphanumeric and underscores/hyphens in session IDs', () => {
    expect(extractOmoSessionId('Session: abc_123-XYZ')).toBe('abc_123-XYZ');
  });
});

describe('OmoConnectorRuntime', () => {
  beforeEach(() => {
    mockChildren.length = 0;
    resetOmoConnectorRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts in stopped state', () => {
    const runtime = new OmoConnectorRuntime();
    const state = runtime.getState();
    expect(state.status).toBe('stopped');
    expect(state.activeTasks).toBe(0);
    expect(runtime.isRunning()).toBe(false);
  });

  it('executeTask spawns a subprocess and resolves on exit 0', async () => {
    const runtime = new OmoConnectorRuntime();
    const resultPromise = runtime.executeTask({
      taskId: 'test_task',
      prompt: 'hello',
    });

    // Wait for spawn
    await new Promise((r) => setTimeout(r, 10));
    const child = mockChildren[mockChildren.length - 1];
    expect(child).toBeDefined();

    // Simulate output and successful exit
    child.stdout.emit('data', 'Session: sess_123\nDone\n');
    child.emit('exit', 0, null);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.sessionId).toBe('sess_123');
    expect(result.resultText).toContain('Session: sess_123');
    expect(result.error).toBeUndefined();
  });

  it('executeTask reports failure on non-zero exit', async () => {
    const runtime = new OmoConnectorRuntime();
    const resultPromise = runtime.executeTask({
      taskId: 'fail_task',
      prompt: 'will fail',
    });

    await new Promise((r) => setTimeout(r, 10));
    const child = mockChildren[mockChildren.length - 1];

    child.stderr.emit('data', 'Error: something broke\n');
    child.emit('exit', 1, null);

    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('exited with code 1');
    expect(result.stderr).toContain('something broke');
  });

  it('executeTask reports spawn error', async () => {
    const runtime = new OmoConnectorRuntime();
    const resultPromise = runtime.executeTask({
      taskId: 'spawn_error',
      prompt: 'test',
    });

    await new Promise((r) => setTimeout(r, 10));
    const child = mockChildren[mockChildren.length - 1];

    child.emit('error', new Error('ENOENT: omo not found'));

    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('omo not found');
    expect(result.exitCode).toBeNull();
  });

  it('tracks active tasks during execution', async () => {
    const runtime = new OmoConnectorRuntime();
    const resultPromise = runtime.executeTask({
      taskId: 'active_check',
      prompt: 'test',
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(runtime.listActiveTasks()).toContain('active_check');
    expect(runtime.isRunning()).toBe(true);

    const child = mockChildren[mockChildren.length - 1];
    child.emit('exit', 0, null);
    await resultPromise;

    expect(runtime.listActiveTasks()).not.toContain('active_check');
  });

  it('cancelTask kills a running task', async () => {
    const runtime = new OmoConnectorRuntime();
    const resultPromise = runtime.executeTask({
      taskId: 'cancel_me',
      prompt: 'test',
    });

    await new Promise((r) => setTimeout(r, 10));
    const child = mockChildren[mockChildren.length - 1];

    const cancelled = await runtime.cancelTask('cancel_me');
    expect(cancelled).toBe(true);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    // Simulate the process actually exiting after SIGTERM
    child.emit('exit', null, 'SIGTERM');
    await resultPromise;
  });

  it('cancelTask returns false for unknown task', async () => {
    const runtime = new OmoConnectorRuntime();
    expect(await runtime.cancelTask('unknown_task')).toBe(false);
  });

  it('records durationMs in result', async () => {
    const runtime = new OmoConnectorRuntime();
    const resultPromise = runtime.executeTask({
      taskId: 'timing',
      prompt: 'test',
    });

    await new Promise((r) => setTimeout(r, 20));
    const child = mockChildren[mockChildren.length - 1];
    child.emit('exit', 0, null);

    const result = await resultPromise;
    expect(result.durationMs).toBeGreaterThanOrEqual(10);
  });
});

describe('getOmoConnectorRuntime singleton', () => {
  it('returns the same instance across calls', () => {
    resetOmoConnectorRuntime();
    const a = getOmoConnectorRuntime();
    const b = getOmoConnectorRuntime();
    expect(a).toBe(b);
  });

  it('resetOmoConnectorRuntime creates a fresh instance', () => {
    const a = getOmoConnectorRuntime();
    resetOmoConnectorRuntime();
    const b = getOmoConnectorRuntime();
    expect(a).not.toBe(b);
  });
});
