/**
 * Tests for the opt-in tmux control-mode listener (TMUX_CONTROL_MODE=1).
 *
 * These drive the REAL parser + attachment + tail integration against a mocked
 * spawn (no tmux needed), asserting the degrade-safe contract:
 *  - protocol parsing: %output (incl. octal-escape/UTF-8 decoding),
 *    %session-changed, %exit/%exited, %begin/%end reply blocks,
 *  - garbage on the wire degrades to the poller (never throws, never fakes),
 *  - flag off (default) = NOTHING spawned, poller path untouched,
 *  - test-mode guard: NODE_ENV=test never spawns without an injected spawn,
 *  - tail integration: %output feeds the SAME RunEventSink the poller feeds,
 *    the wrapped substrate suppresses capture() while healthy and delegates
 *    again after degrade, and a dead session self-cleans the client.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { RunEventSink, TailSubstrate } from '@recoder/substrate';
import {
  decodeControlModeData,
  stripAnsi,
  parseControlModeLine,
  attachControlMode,
  startControlModeTail,
  controlModeEnabled,
  TMUX_CONTROL_MODE_ENV,
  type ControlModeCallbacks,
} from './tmux-control-mode.js';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: vi.fn(), end: vi.fn() };
  exitCode: number | null = null;
  pid = 4242;
  kill = vi.fn(() => true);
  unref = vi.fn();
}

type SpawnLike = Parameters<typeof attachControlMode>[2] extends
  | { spawn?: infer S }
  | undefined
  ? NonNullable<S>
  : never;

function fakeSpawn(): { spawn: SpawnLike; child: FakeChild; calls: unknown[][] } {
  const child = new FakeChild();
  const calls: unknown[][] = [];
  const spawn = ((...args: unknown[]) => {
    calls.push(args);
    return child as never;
  }) as SpawnLike;
  return { spawn, child, calls };
}

function callbacks(): ControlModeCallbacks & {
  outputs: string[];
  exits: (string | undefined)[];
  degrades: string[];
} {
  const outputs: string[] = [];
  const exits: (string | undefined)[] = [];
  const degrades: string[] = [];
  return {
    outputs,
    exits,
    degrades,
    onOutput: (text) => outputs.push(text),
    onExit: (reason) => exits.push(reason),
    onDegrade: (reason) => degrades.push(reason),
  };
}

const TEST_ENV_ON: NodeJS.ProcessEnv = { NODE_ENV: 'test', [TMUX_CONTROL_MODE_ENV]: '1' };
const TEST_ENV_OFF: NodeJS.ProcessEnv = { NODE_ENV: 'test' };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('controlModeEnabled', () => {
  it('is OFF by default and ON only for the exact value "1"', () => {
    expect(controlModeEnabled({})).toBe(false);
    expect(controlModeEnabled({ [TMUX_CONTROL_MODE_ENV]: '' })).toBe(false);
    expect(controlModeEnabled({ [TMUX_CONTROL_MODE_ENV]: 'true' })).toBe(false);
    expect(controlModeEnabled({ [TMUX_CONTROL_MODE_ENV]: '1' })).toBe(true);
  });
});

describe('decodeControlModeData', () => {
  it('decodes octal escapes to bytes', () => {
    expect(decodeControlModeData('hello\\040world\\012')).toBe('hello world\n');
    expect(decodeControlModeData('\\033[1m')).toBe('\x1b[1m');
  });

  it('decodes escaped backslashes', () => {
    expect(decodeControlModeData('a\\\\b')).toBe('a\\b');
  });

  it('reassembles multi-byte UTF-8 from octal bytes', () => {
    // é = 0xC3 0xA9 = \303\251
    expect(decodeControlModeData('caf\\303\\251')).toBe('café');
  });

  it('passes plain text through unchanged', () => {
    expect(decodeControlModeData('plain text 123')).toBe('plain text 123');
  });
});

describe('stripAnsi', () => {
  it('removes CSI color/cursor sequences and normalizes CR', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m\r\nnext\r')).toBe('greennext'.replace('next', '\nnext'));
    expect(stripAnsi('\x1b[2J\x1b[Hcleared')).toBe('cleared');
  });

  it('removes OSC title sequences', () => {
    expect(stripAnsi('\x1b]0;title\x07body')).toBe('body');
  });
});

describe('parseControlModeLine', () => {
  it('parses %output with pane id and decoded data', () => {
    const parsed = parseControlModeLine('%output %1 build\\040ok\\012');
    expect(parsed).toEqual({ kind: 'output', paneId: '%1', text: 'build ok\n' });
  });

  it('parses %session-changed', () => {
    const parsed = parseControlModeLine('%session-changed $3 recoder-ws1');
    expect(parsed).toEqual({ kind: 'session-changed', sessionId: '$3', name: 'recoder-ws1' });
  });

  it('parses %exit and %exited with optional reason', () => {
    expect(parseControlModeLine('%exit')).toEqual({ kind: 'exited', reason: undefined });
    expect(parseControlModeLine('%exit detached')).toEqual({ kind: 'exited', reason: 'detached' });
    expect(parseControlModeLine('%exited')).toEqual({ kind: 'exited', reason: undefined });
  });

  it('classifies reply-block delimiters', () => {
    expect(parseControlModeLine('%begin 123 0 1').kind).toBe('block-begin');
    expect(parseControlModeLine('%end 123 0 1').kind).toBe('block-end');
    expect(parseControlModeLine('%error 123 0 1').kind).toBe('block-end');
  });

  it('ignores other notifications and empty lines', () => {
    expect(parseControlModeLine('%window-add @1').kind).toBe('ignored');
    expect(parseControlModeLine('%layout-change @1 abc').kind).toBe('ignored');
    expect(parseControlModeLine('').kind).toBe('ignored');
  });

  it('flags garbage: non-notification lines and malformed %output', () => {
    expect(parseControlModeLine('not a notification').kind).toBe('garbage');
    expect(parseControlModeLine('%output missing-pane-id').kind).toBe('garbage');
    expect(parseControlModeLine('%session-changed nope').kind).toBe('garbage');
  });
});

describe('attachControlMode', () => {
  it('NEVER spawns under NODE_ENV=test without an injected spawn', () => {
    const attachment = attachControlMode('recoder-x', callbacks(), { env: TEST_ENV_ON });
    expect(attachment).toBeUndefined();
  });

  it('spawns tmux -CC attach -r -t <session> (read-only)', () => {
    const { spawn, calls } = fakeSpawn();
    const attachment = attachControlMode('recoder-x', callbacks(), { spawn, env: TEST_ENV_ON });
    expect(attachment?.active).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(['-CC', 'attach-session', '-r', '-t', 'recoder-x']);
  });

  it('emits decoded, ANSI-stripped %output — including lines split across chunks', () => {
    const { spawn, child } = fakeSpawn();
    const cb = callbacks();
    attachControlMode('recoder-x', cb, { spawn, env: TEST_ENV_ON });
    child.stdout.emit('data', Buffer.from('%output %1 \\033[32mgre'));
    child.stdout.emit('data', Buffer.from('en\\033[0m\\012\n'));
    expect(cb.outputs).toEqual(['green\n']);
    expect(cb.degrades).toEqual([]);
  });

  it('ignores non-notification lines inside %begin/%end reply blocks', () => {
    const { spawn, child } = fakeSpawn();
    const cb = callbacks();
    attachControlMode('recoder-x', cb, { spawn, env: TEST_ENV_ON });
    child.stdout.emit(
      'data',
      Buffer.from('%begin 1 0 1\narbitrary command output\n%end 1 0 1\n%output %1 ok\n'),
    );
    expect(cb.degrades).toEqual([]);
    expect(cb.outputs).toEqual(['ok']);
  });

  it('degrades ONCE on garbage and kills the client', () => {
    const { spawn, child } = fakeSpawn();
    const cb = callbacks();
    const attachment = attachControlMode('recoder-x', cb, { spawn, env: TEST_ENV_ON });
    child.stdout.emit('data', Buffer.from('total garbage\nmore garbage\n'));
    expect(cb.degrades).toHaveLength(1);
    expect(cb.outputs).toEqual([]);
    expect(attachment?.active).toBe(false);
    expect(child.kill).toHaveBeenCalled();
  });

  it('reports %exit as a clean exit (not a degrade)', () => {
    const { spawn, child } = fakeSpawn();
    const cb = callbacks();
    const attachment = attachControlMode('recoder-x', cb, { spawn, env: TEST_ENV_ON });
    child.stdout.emit('data', Buffer.from('%exit\n'));
    child.emit('exit', 0, null); // the real client exits after %exit
    expect(cb.exits).toEqual([undefined]);
    expect(cb.degrades).toEqual([]);
    expect(attachment?.active).toBe(false);
  });

  it('degrades on spawn error and on unexpected client exit', () => {
    const a = fakeSpawn();
    const cbA = callbacks();
    attachControlMode('recoder-x', cbA, { spawn: a.spawn, env: TEST_ENV_ON });
    a.child.emit('error', new Error('ENOENT'));
    expect(cbA.degrades).toHaveLength(1);

    const b = fakeSpawn();
    const cbB = callbacks();
    attachControlMode('recoder-x', cbB, { spawn: b.spawn, env: TEST_ENV_ON });
    b.child.emit('exit', 1, null);
    expect(cbB.degrades).toHaveLength(1);
    expect(cbB.exits).toEqual([]);
  });

  it('degrades when spawn itself throws (tmux missing)', () => {
    const throwingSpawn = (() => {
      throw new Error('spawn tmux ENOENT');
    }) as unknown as SpawnLike;
    const attachment = attachControlMode('recoder-x', callbacks(), {
      spawn: throwingSpawn,
      env: TEST_ENV_ON,
    });
    expect(attachment).toBeUndefined();
  });

  it('stop() detaches silently — no callbacks after stop', () => {
    const { spawn, child } = fakeSpawn();
    const cb = callbacks();
    const attachment = attachControlMode('recoder-x', cb, { spawn, env: TEST_ENV_ON });
    attachment!.stop();
    child.stdout.emit('data', Buffer.from('%output %1 late\n'));
    child.emit('exit', 0, null);
    expect(cb.outputs).toEqual([]);
    expect(cb.exits).toEqual([]);
    expect(cb.degrades).toEqual([]);
    expect(child.kill).toHaveBeenCalled();
  });
});

describe('startControlModeTail', () => {
  const baseInput = {
    workspaceId: 'ws1',
    taskId: 'task1',
    runId: 'run1',
    sessionName: 'recoder-ws1',
    substrateId: 'tmux_worktree',
  };

  function sinkSpy(): { sink: RunEventSink; events: RunEvent[] } {
    const events: RunEvent[] = [];
    return {
      events,
      sink: {
        append: async (event: RunEvent) => {
          events.push(event);
        },
      },
    };
  }

  function innerSubstrate(overrides: Partial<TailSubstrate> = {}): TailSubstrate {
    return {
      capture: vi.fn(async () => 'polled output\n'),
      alive: vi.fn(async () => true),
      exitCode: vi.fn(async () => 0),
      ...overrides,
    };
  }

  it('flag OFF (default) returns undefined and spawns NOTHING', () => {
    const { spawn, calls } = fakeSpawn();
    const { sink } = sinkSpy();
    const tail = startControlModeTail(
      { ...baseInput, inner: innerSubstrate(), sink },
      { spawn, env: TEST_ENV_OFF },
    );
    expect(tail).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('non-tmux substrates return undefined and spawn NOTHING', () => {
    const { spawn, calls } = fakeSpawn();
    const { sink } = sinkSpy();
    const tail = startControlModeTail(
      { ...baseInput, substrateId: 'daytona', inner: innerSubstrate(), sink },
      { spawn, env: TEST_ENV_ON },
    );
    expect(tail).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('feeds %output to the sink as log RunEvents with unique eventIds', async () => {
    vi.useFakeTimers();
    const { spawn, child } = fakeSpawn();
    const { sink, events } = sinkSpy();
    const tail = startControlModeTail(
      { ...baseInput, agentId: 'agent1', inner: innerSubstrate(), sink },
      { spawn, env: TEST_ENV_ON },
    );
    expect(tail).toBeDefined();

    child.stdout.emit('data', Buffer.from('%output %1 first\\012\n'));
    await vi.advanceTimersByTimeAsync(300);
    child.stdout.emit('data', Buffer.from('%output %1 second\\012\n'));
    await vi.advanceTimersByTimeAsync(300);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'log',
      taskId: 'task1',
      runId: 'run1',
      agentId: 'agent1',
      message: 'first',
      data: { source: 'tmux-control-mode' },
    });
    expect(events[1].message).toBe('second');
    expect(new Set(events.map((e) => e.eventId)).size).toBe(2);
  });

  it('coalesces rapid %output bursts into one flush', async () => {
    vi.useFakeTimers();
    const { spawn, child } = fakeSpawn();
    const { sink, events } = sinkSpy();
    startControlModeTail({ ...baseInput, inner: innerSubstrate(), sink }, { spawn, env: TEST_ENV_ON });

    child.stdout.emit('data', Buffer.from('%output %1 a\n%output %1 b\n%output %1 c\n'));
    await vi.advanceTimersByTimeAsync(300);

    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('abc');
  });

  it('suppresses capture() while healthy; delegates after degrade', async () => {
    vi.useFakeTimers();
    const { spawn, child } = fakeSpawn();
    const { sink } = sinkSpy();
    const inner = innerSubstrate();
    const tail = startControlModeTail({ ...baseInput, inner, sink }, { spawn, env: TEST_ENV_ON });

    const handle = { ref: 'ws1', sessionName: 'recoder-ws1' };
    expect(await tail!.substrate.capture(handle, 100)).toBeNull();
    expect(inner.capture).not.toHaveBeenCalled();

    // Garbage on the wire → degrade → capture transparently delegates again.
    child.stdout.emit('data', Buffer.from('garbage\n'));
    expect(await tail!.substrate.capture(handle, 100)).toBe('polled output\n');
    expect(inner.capture).toHaveBeenCalledWith(handle, 100);
  });

  it('always delegates alive()/exitCode() and self-cleans on a dead session', async () => {
    const { spawn, child } = fakeSpawn();
    const { sink } = sinkSpy();
    const inner = innerSubstrate({ alive: vi.fn(async () => false) });
    const tail = startControlModeTail({ ...baseInput, inner, sink }, { spawn, env: TEST_ENV_ON });

    const handle = { ref: 'ws1', sessionName: 'recoder-ws1' };
    expect(await tail!.substrate.exitCode!(handle)).toBe(0);
    expect(await tail!.substrate.alive(handle)).toBe(false);
    // Dead session → the control-mode client is stopped (no lingering clients).
    expect(child.kill).toHaveBeenCalled();
  });

  it('flushes pending output on %exit so nothing is lost', async () => {
    vi.useFakeTimers();
    const { spawn, child } = fakeSpawn();
    const { sink, events } = sinkSpy();
    startControlModeTail({ ...baseInput, inner: innerSubstrate(), sink }, { spawn, env: TEST_ENV_ON });

    child.stdout.emit('data', Buffer.from('%output %1 tail-end\n%exit\n'));
    // No timer advance needed — exit flushes synchronously.
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('tail-end');
  });
});
