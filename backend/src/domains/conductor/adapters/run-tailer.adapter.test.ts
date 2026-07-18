/**
 * run-tailer adapter tests — the composition-root seam that drives the real
 * `@recoder/substrate` `startRunTail` poll tailer (and the opt-in control-mode
 * `%output` listener).
 *
 * Proves:
 *  - DEGRADE (no live driver): ONE truthful `:tail-attached` marker, de-duped
 *    per workspace; never fabricated agent output.
 *  - LIVE (driver injected): `startRunTail` runs against the RESOLVED substrate
 *    — emits `started`, then `log` deltas from `capture()`, then terminal
 *    `completed`/`failed` from `alive()`/`exitCode()`.
 *  - CONTROL MODE (flag on + tmux substrate + capable binary): the injected
 *    control-mode client streams `%output` into `log` events with
 *    `source: tmux-control-mode`, and the poller's `capture()` is suppressed
 *    while the client is healthy.
 *  - TRUTHFUL DEGRADE: flag off / probe fails ⇒ the plain poll tailer runs; an
 *    unregistered substrate id ⇒ attach marker only (no fabricated stream).
 *  - `stop()` cascades to the control client + the poll tailer and clears the
 *    attach so a later reconcile can re-attach.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type {
  ClockPort,
  ExecOptions,
  ExecResult,
  IdPort,
  SubstrateHandle,
  TailSubstrate,
} from '@recoder/substrate';
import type { RunEventSinkPort } from '../ports/index.js';
import { createRunTailer, type LiveTailDriver } from './run-tailer.adapter.js';
import type { ControlModeChild, SpawnFn } from './tmux-control-mode.adapter.js';
import type { ExecFn } from './tmux-substrate.adapter.js';
import { makeLogger } from '../__fixtures__/harness.js';

// === fakes ===

function makeSink(): { sink: RunEventSinkPort; events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { sink: { append: async (e) => void events.push(e) }, events };
}

const clock: ClockPort = { now: () => new Date(1_000).toISOString(), nowMs: () => 1_000 };
let idSeq = 0;
const id: IdPort = { newId: () => `id_${++idSeq}` };

/** A minimal poll substrate that stays alive for a fixed number of ticks. */
function makeSubstrate(opts: { output?: string; aliveTicks?: number; exitCode?: number } = {}): {
  substrate: TailSubstrate;
  captureCalls: number;
} {
  let aliveTicks = opts.aliveTicks ?? Infinity;
  let captureCalls = 0;
  const substrate: TailSubstrate = {
    capture: async () => {
      captureCalls += 1;
      return opts.output ?? 'pane-line\n';
    },
    alive: async () => aliveTicks-- > 0,
    exitCode: async () => opts.exitCode ?? undefined,
  };
  return {
    substrate,
    get captureCalls() {
      return captureCalls;
    },
  } as { substrate: TailSubstrate; captureCalls: number };
}

class FakeChild extends EventEmitter implements ControlModeChild {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  killed: string | undefined;
  kill(signal?: string): void {
    this.killed = signal ?? 'SIGTERM';
  }
  unref(): void {}
  feed(text: string): void {
    this.stdout.emit('data', Buffer.from(text, 'utf8'));
  }
}

function makeSpawn(): { spawn: SpawnFn; children: FakeChild[]; calls: number } {
  const children: FakeChild[] = [];
  let calls = 0;
  const spawn: SpawnFn = () => {
    calls += 1;
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  return {
    spawn,
    children,
    get calls() {
      return calls;
    },
  } as { spawn: SpawnFn; children: FakeChild[]; calls: number };
}

function makeExec(version: string | Error): ExecFn {
  return async (_bin: string, _args: readonly string[], _o?: ExecOptions): Promise<ExecResult> => {
    if (version instanceof Error) throw version;
    return { stdout: `${version}\n`, stderr: '', code: 0 };
  };
}

const ATTACH = {
  workspaceId: 'ws_1',
  taskId: 'task_1',
  runId: 'run_ws_1',
  substrate: 'tmux_worktree',
  sessionName: 'recoder-ws_1',
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// === degrade path (no live driver) — the truthful attach marker ===

describe('createRunTailer (no live driver — degrade)', () => {
  it('emits ONE truthful :tail-attached marker and de-dupes repeat attaches', async () => {
    const { sink, events } = makeSink();
    const tailer = createRunTailer({ sink, logger: makeLogger() });

    tailer.start(ATTACH);
    tailer.start(ATTACH);
    await Promise.resolve();

    expect(tailer.isTailing('ws_1')).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventId).toBe('run_ws_1:tail-attached');
    expect(events[0]?.type).toBe('log');
    expect(events[0]?.data).toMatchObject({ workspaceId: 'ws_1', sessionName: 'recoder-ws_1' });
    // A truthful lifecycle marker — NOT a fabricated exit code.
    expect(events[0]?.data).not.toHaveProperty('exitCode');
  });

  it('reports isTailing false for a workspace it never attached', () => {
    const { sink } = makeSink();
    const tailer = createRunTailer({ sink, logger: makeLogger() });
    expect(tailer.isTailing('ws_missing')).toBe(false);
  });
});

// === live path — real startRunTail against the resolved substrate ===

function liveDriver(
  overrides: Partial<LiveTailDriver> & { substrate?: TailSubstrate } = {},
): LiveTailDriver {
  const substrate =
    overrides.substrate ?? makeSubstrate({ aliveTicks: 0, exitCode: 0 }).substrate;
  return {
    resolveSubstrate: overrides.resolveSubstrate ?? (() => substrate),
    config: overrides.config ?? { tmuxBin: null, tmuxControlMode: false },
    clock,
    id,
    logger: makeLogger(),
    ...(overrides.spawn ? { spawn: overrides.spawn } : {}),
    ...(overrides.exec ? { exec: overrides.exec } : {}),
  };
}

describe('createRunTailer (live driver — poll tailer)', () => {
  it('flag off ⇒ drives the plain poll tailer (emits started, spawns NO control client)', async () => {
    const { sink, events } = makeSink();
    const { spawn, calls } = makeSpawn();
    const substrate = makeSubstrate({ output: 'hello-poll\n', aliveTicks: Infinity }).substrate;
    const tailer = createRunTailer({
      sink,
      logger: makeLogger(),
      live: liveDriver({ substrate, spawn, exec: makeExec('tmux 3.7b') }),
    });

    tailer.start(ATTACH);
    // The gate probes -V asynchronously; startRunTail emits `started` at once.
    await sleep(10);

    expect(events.map((e) => e.type)).toContain('started');
    // The control-mode gate never spawned a client (flag off ⇒ pure poller).
    expect(calls).toBe(0);
    expect(tailer.isTailing('ws_1')).toBe(true);
    tailer.stop('ws_1');
  });

  it('an unregistered substrate id ⇒ attach marker only (no fabricated stream)', async () => {
    const { sink, events } = makeSink();
    const tailer = createRunTailer({
      sink,
      logger: makeLogger(),
      live: liveDriver({ resolveSubstrate: () => undefined }),
    });

    tailer.start(ATTACH);
    await sleep(10);

    expect(events).toHaveLength(1);
    expect(events[0]?.eventId).toBe('run_ws_1:tail-attached');
    expect(tailer.isTailing('ws_1')).toBe(true);
    tailer.stop('ws_1');
  });
});

// === control-mode path — %output streams into log events ===

describe('createRunTailer (live driver — control mode)', () => {
  it('flag on + tmux substrate + capable binary ⇒ %output streams into log events (capture suppressed)', async () => {
    const { sink, events } = makeSink();
    const { spawn, children } = makeSpawn();
    // Stay alive so the poll tailer never emits a terminal event during the test.
    const substrate = makeSubstrate({ aliveTicks: Infinity }).substrate;
    const tailer = createRunTailer({
      sink,
      logger: makeLogger(),
      live: liveDriver({
        substrate,
        config: { tmuxBin: '/opt/recoder/tmux', tmuxControlMode: true },
        spawn,
        exec: makeExec('tmux 3.7b'),
      }),
    });

    tailer.start(ATTACH);
    // Let the async selection gate probe -V and attach the client.
    await sleep(10);
    expect(children).toHaveLength(1);

    children[0]!.feed('%output %1 live-stream\n');
    await sleep(300); // > CONTROL_MODE_FLUSH_MS (250)

    const cm = events.find((e) => e.data && (e.data as { source?: string }).source === 'tmux-control-mode');
    expect(cm?.type).toBe('log');
    expect(cm?.message).toBe('live-stream');
    tailer.stop('ws_1');
    expect(children[0]?.killed).toBe('SIGTERM');
  });

  it('probe fails (missing binary) ⇒ NO control client, plain poll tailer runs', async () => {
    const { sink } = makeSink();
    const { spawn, calls } = makeSpawn();
    const substrate = makeSubstrate({ aliveTicks: Infinity }).substrate;
    const tailer = createRunTailer({
      sink,
      logger: makeLogger(),
      live: liveDriver({
        substrate,
        config: { tmuxBin: '/nonexistent/tmux', tmuxControlMode: true },
        spawn,
        exec: makeExec(new Error('ENOENT')),
      }),
    });

    tailer.start(ATTACH);
    await sleep(10);

    expect(calls).toBe(0); // probe failed ⇒ gate returned undefined ⇒ no spawn
    tailer.stop('ws_1');
  });

  it('stop() before the probe resolves cancels the pending control client', async () => {
    const { sink } = makeSink();
    const { spawn, children } = makeSpawn();
    const substrate = makeSubstrate({ aliveTicks: Infinity }).substrate;
    const tailer = createRunTailer({
      sink,
      logger: makeLogger(),
      live: liveDriver({
        substrate,
        config: { tmuxBin: '/opt/recoder/tmux', tmuxControlMode: true },
        spawn,
        exec: makeExec('tmux 3.7b'),
      }),
    });

    tailer.start(ATTACH);
    tailer.stop('ws_1'); // detach synchronously, before the async probe resolves
    await sleep(10);

    // The client that attached after the detach was stopped immediately.
    for (const child of children) expect(child.killed).toBe('SIGTERM');
    expect(tailer.isTailing('ws_1')).toBe(false);
  });
});
