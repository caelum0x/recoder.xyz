/**
 * tmux control-mode adapter tests — config-injected, fake-spawn driven.
 *
 * Proves (no real tmux needed): the FULL selection gate (flag off / non-tmux
 * substrate / unsupported or missing binary → undefined = poll tailer stays);
 * the read-only `-CC` client is spawned with the INJECTED binary; `%output`
 * streams decode into `log` RunEvents through the SAME sink the poll tailer
 * feeds; capture() is suppressed (null) while healthy; ANY failure (garbage on
 * the wire, unexpected client exit) degrades truthfully back to the inner
 * substrate; `%exit` and inner-alive-false self-clean the client.
 *
 * The pure parser (%output unescaping, %exit) is covered in
 * `packages/substrate/tests/observe/control-mode.test.ts`.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { ExecOptions, ExecResult, SubstrateHandle, TailSubstrate } from '@recoder/substrate';
import {
  attachControlMode,
  probeControlModeSupport,
  selectControlModeTail,
  startControlModeTail,
  TMUX_SUBSTRATE_ID,
  type ControlModeChild,
  type SpawnFn,
} from './tmux-control-mode.adapter.js';
import type { ExecFn } from './tmux-substrate.adapter.js';

// === fakes ===

class FakeChild extends EventEmitter implements ControlModeChild {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  killed: string | undefined;

  kill(signal?: string): void {
    this.killed = signal ?? 'SIGTERM';
  }

  unref(): void {}

  /** Push raw control-mode stdout into the pump. */
  feed(text: string): void {
    this.stdout.emit('data', Buffer.from(text, 'utf8'));
  }
}

function makeSpawn(): { spawn: SpawnFn; children: FakeChild[]; calls: { bin: string; args: string[] }[] } {
  const children: FakeChild[] = [];
  const calls: { bin: string; args: string[] }[] = [];
  const spawn: SpawnFn = (bin, args) => {
    calls.push({ bin, args: [...args] });
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  return { spawn, children, calls };
}

function makeExec(version: string | Error): ExecFn {
  return async (_bin: string, _args: readonly string[], _o?: ExecOptions): Promise<ExecResult> => {
    if (version instanceof Error) throw version;
    return { stdout: `${version}\n`, stderr: '', code: 0 };
  };
}

function makeSink(): { sink: { append(e: RunEvent): Promise<void> }; events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { sink: { append: async (e) => void events.push(e) }, events };
}

function makeInner(opts: { alive?: boolean } = {}): {
  inner: TailSubstrate;
  captureCalls: number[];
} {
  const captureCalls: number[] = [];
  const inner: TailSubstrate = {
    capture: async (_h: SubstrateHandle, lines?: number) => {
      captureCalls.push(lines ?? 0);
      return 'inner-pane\n';
    },
    alive: async () => opts.alive ?? true,
    exitCode: async () => undefined,
  };
  return { inner, captureCalls };
}

const HANDLE: SubstrateHandle = { ref: 'ws_1', sessionName: 'recoder-ws_1' };

function tailInput(overrides: Partial<Parameters<typeof startControlModeTail>[0]> = {}) {
  const { sink, events } = makeSink();
  const { inner, captureCalls } = makeInner();
  return {
    events,
    captureCalls,
    input: {
      workspaceId: 'ws_1',
      taskId: 'task_1',
      runId: 'run_1',
      substrateId: TMUX_SUBSTRATE_ID,
      sessionName: 'recoder-ws_1',
      inner,
      sink,
      ...overrides,
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// === selection gate — fallback to the poll tailer is the truthful default ===

describe('selectControlModeTail (fallback selection)', () => {
  it('flag off → undefined and NOTHING is spawned (poll tailer stays)', async () => {
    const { spawn, calls } = makeSpawn();
    const { input } = tailInput();
    const tail = await selectControlModeTail(input, {
      config: { tmuxBin: null, tmuxControlMode: false },
      spawn,
      exec: makeExec('tmux 3.7b'),
    });
    expect(tail).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('non-tmux substrate → undefined (control mode only applies to tmux_worktree)', async () => {
    const { spawn, calls } = makeSpawn();
    const { input } = tailInput({ substrateId: 'daytona' });
    const tail = await selectControlModeTail(input, {
      config: { tmuxBin: null, tmuxControlMode: true },
      spawn,
      exec: makeExec('tmux 3.7b'),
    });
    expect(tail).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('a pre-control-mode tmux → undefined (truthful degrade, no spawn)', async () => {
    const { spawn, calls } = makeSpawn();
    const { input } = tailInput();
    const tail = await selectControlModeTail(input, {
      config: { tmuxBin: null, tmuxControlMode: true },
      spawn,
      exec: makeExec('tmux 1.7'),
    });
    expect(tail).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('a missing tmux binary → undefined (probe fails truthfully)', async () => {
    const { spawn, calls } = makeSpawn();
    const { input } = tailInput();
    const tail = await selectControlModeTail(input, {
      config: { tmuxBin: '/nonexistent/tmux', tmuxControlMode: true },
      spawn,
      exec: makeExec(new Error('ENOENT')),
    });
    expect(tail).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('flag on + tmux substrate + capable binary → attaches the INJECTED binary read-only', async () => {
    const { spawn, calls } = makeSpawn();
    const { input } = tailInput();
    const tail = await selectControlModeTail(input, {
      config: { tmuxBin: '/opt/recoder/tmux', tmuxControlMode: true },
      spawn,
      exec: makeExec('tmux 3.7b'),
    });
    expect(tail).toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.bin).toBe('/opt/recoder/tmux');
    // -C single control mode: works over pipes; -CC needs a tty on tmux>=3.4.
    expect(calls[0]?.args).toEqual(['-C', 'attach-session', '-r', '-t', 'recoder-ws_1']);
    tail?.stop();
  });
});

describe('probeControlModeSupport', () => {
  it('reports true only for a provably capable binary', async () => {
    await expect(
      probeControlModeSupport({ tmuxBin: null }, makeExec('tmux next-3.7')),
    ).resolves.toBe(true);
    await expect(probeControlModeSupport({ tmuxBin: null }, makeExec('tmux 1.7'))).resolves.toBe(
      false,
    );
    await expect(
      probeControlModeSupport({ tmuxBin: null }, makeExec(new Error('spawn tmux ENOENT'))),
    ).resolves.toBe(false);
  });
});

// === streaming — %output feeds the same sink the poll tailer feeds ===

describe('startControlModeTail (streaming)', () => {
  const DEPS = (spawn: SpawnFn) => ({
    config: { tmuxBin: null, tmuxControlMode: true },
    spawn,
    flushMs: 1,
  });

  it('decoded %output is flushed as a log RunEvent with source tmux-control-mode', async () => {
    const { spawn, children } = makeSpawn();
    const { input, events } = tailInput();
    const tail = startControlModeTail(input, DEPS(spawn));
    expect(tail).toBeDefined();

    children[0]!.feed('%output %1 hello\\012world\n');
    await sleep(20);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('log');
    expect(events[0]?.message).toBe('hello\nworld');
    expect(events[0]?.taskId).toBe('task_1');
    expect(events[0]?.runId).toBe('run_1');
    expect(events[0]?.data).toEqual({ source: 'tmux-control-mode' });
    tail?.stop();
  });

  it('several %output bursts within one flush window coalesce into ONE event with unique ids', async () => {
    const { spawn, children } = makeSpawn();
    const { input, events } = tailInput();
    const tail = startControlModeTail(input, { ...DEPS(spawn), flushMs: 10 });

    children[0]!.feed('%output %1 chunk-a \n%output %1 chunk-b\n');
    await sleep(40);
    children[0]!.feed('%output %1 chunk-c\n');
    await sleep(40);

    expect(events).toHaveLength(2);
    expect(events[0]?.message).toBe('chunk-a chunk-b');
    expect(events[1]?.message).toBe('chunk-c');
    expect(events[0]?.eventId).not.toBe(events[1]?.eventId);
    tail?.stop();
  });

  it('capture() is suppressed (null) while the client is healthy — inner never polled', async () => {
    const { spawn } = makeSpawn();
    const { input, captureCalls } = tailInput();
    const tail = startControlModeTail(input, DEPS(spawn));

    await expect(tail!.substrate.capture(HANDLE, 2000)).resolves.toBeNull();
    expect(captureCalls).toHaveLength(0);
    tail?.stop();
  });

  it('reply blocks (%begin … %end) carry arbitrary text without degrading', async () => {
    const { spawn, children } = makeSpawn();
    const { input } = tailInput();
    const tail = startControlModeTail(input, DEPS(spawn));

    children[0]!.feed('%begin 1717 0 0\narbitrary command output\n%end 1717 0 0\n');
    await sleep(10);

    // Still healthy: capture stays suppressed.
    await expect(tail!.substrate.capture(HANDLE)).resolves.toBeNull();
    tail?.stop();
  });

  it('garbage on the wire degrades: pending output flushes and capture() delegates to the inner substrate', async () => {
    const { spawn, children } = makeSpawn();
    const { input, events, captureCalls } = tailInput();
    const tail = startControlModeTail(input, { ...DEPS(spawn), flushMs: 60_000 });

    children[0]!.feed('%output %1 before-degrade\n');
    children[0]!.feed('not protocol output\n');
    await sleep(10);

    expect(events.map((e) => e.message)).toEqual(['before-degrade']);
    await expect(tail!.substrate.capture(HANDLE, 42)).resolves.toBe('inner-pane\n');
    expect(captureCalls).toEqual([42]);
    tail?.stop();
  });

  it('an unexpected control-client exit degrades back to polling', async () => {
    const { spawn, children } = makeSpawn();
    const { input } = tailInput();
    const tail = startControlModeTail(input, DEPS(spawn));

    children[0]!.emit('exit', 1, null);
    await sleep(5);

    await expect(tail!.substrate.capture(HANDLE)).resolves.toBe('inner-pane\n');
    tail?.stop();
  });

  it('%exit flushes the remaining output and deactivates the client', async () => {
    const { spawn, children } = makeSpawn();
    const { input, events } = tailInput();
    const tail = startControlModeTail(input, { ...DEPS(spawn), flushMs: 60_000 });

    children[0]!.feed('%output %1 final words\n%exit\n');
    await sleep(10);

    expect(events.map((e) => e.message)).toEqual(['final words']);
    // Client gone → the poller's capture path is back in charge.
    await expect(tail!.substrate.capture(HANDLE)).resolves.toBe('inner-pane\n');
    expect(children[0]?.killed).toBe('SIGTERM');
    tail?.stop();
  });

  it('inner alive:false self-cleans the control client (no lingering tmux clients)', async () => {
    const { spawn, children } = makeSpawn();
    const { sink } = makeSink();
    const { inner } = makeInner({ alive: false });
    const { input } = tailInput({ inner, sink });
    const tail = startControlModeTail(input, DEPS(spawn));

    await expect(tail!.substrate.alive(HANDLE)).resolves.toBe(false);
    expect(children[0]?.killed).toBe('SIGTERM');
  });

  it('max attach duration reclaims the client even when the session stays alive (poller max-duration stop)', async () => {
    // The poll tailer stops itself on max-duration WITHOUT the session dying
    // (alive stays true), so the wrapped alive() self-clean never fires. The
    // bounded maxAttachMs ceiling must reclaim the control client anyway and
    // stop emitting post-terminal log events.
    const { spawn, children } = makeSpawn();
    const { input, events, captureCalls } = tailInput(); // inner stays alive:true
    const tail = startControlModeTail(input, { ...DEPS(spawn), maxAttachMs: 15 });
    expect(tail).toBeDefined();
    expect(children[0]?.killed).toBeUndefined();

    // Cross the max-attach ceiling — the client self-stops on its own timer.
    await sleep(40);
    expect(children[0]?.killed).toBe('SIGTERM');

    // Post-terminal: any further pane output must NOT produce a log event, and
    // capture() delegates to the inner substrate again (control client gone).
    children[0]!.feed('%output %1 after-max\n');
    await sleep(20);
    expect(events).toHaveLength(0);
    await expect(tail!.substrate.capture(HANDLE, 7)).resolves.toBe('inner-pane\n');
    expect(captureCalls).toEqual([7]);
    tail?.stop();
  });

  it('a clean %exit before the ceiling drops the max-attach timer (no dangling stop)', async () => {
    const { spawn, children } = makeSpawn();
    const { input, events } = tailInput();
    const tail = startControlModeTail(input, { ...DEPS(spawn), maxAttachMs: 15, flushMs: 60_000 });

    children[0]!.feed('%output %1 last\n%exit\n');
    await sleep(5);
    expect(events.map((e) => e.message)).toEqual(['last']);
    // Let the (now-cleared) ceiling window elapse; capture stays delegated and
    // no additional events are emitted by a lingering timer.
    await sleep(30);
    expect(events).toHaveLength(1);
    await expect(tail!.substrate.capture(HANDLE)).resolves.toBe('inner-pane\n');
    tail?.stop();
  });

  it('exitCode stays delegated to the inner substrate (poller keeps terminal-event authority)', async () => {
    const { spawn } = makeSpawn();
    const { input } = tailInput();
    const tail = startControlModeTail(input, DEPS(spawn));

    await expect(tail!.substrate.exitCode!(HANDLE)).resolves.toBeUndefined();
    tail?.stop();
  });

  it('a spawn that throws returns undefined — the poll tailer stays untouched', () => {
    const throwingSpawn: SpawnFn = () => {
      throw new Error('spawn EPERM');
    };
    const { input } = tailInput();
    const tail = startControlModeTail(input, {
      config: { tmuxBin: null, tmuxControlMode: true },
      spawn: throwingSpawn,
    });
    expect(tail).toBeUndefined();
  });
});

describe('attachControlMode', () => {
  it('strips the -CC DCS envelope before parsing', async () => {
    const { spawn, children } = makeSpawn();
    const outputs: string[] = [];
    const attachment = attachControlMode(
      'recoder-ws_1',
      { onOutput: (t) => void outputs.push(t), onExit: () => {}, onDegrade: () => {} },
      { tmuxBin: 'tmux', spawn },
    );
    expect(attachment).toBeDefined();

    children[0]!.feed('\x1bP1000p%output %1 wrapped\n');
    expect(outputs).toEqual(['wrapped']);
    expect(attachment?.active).toBe(true);
    attachment?.stop();
    expect(attachment?.active).toBe(false);
  });
});
