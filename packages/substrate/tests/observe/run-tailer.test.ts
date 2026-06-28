/**
 * observe/run-tailer tests (design §11) — a FAKE substrate drives the proven
 * emission sequence started → log(delta) → completed, plus the failed (non-zero
 * exit), the max-duration safety stop, idempotency, and the prefix-diff delta
 * cap. No mocks of the tailer itself: it runs its real polling loop over a
 * controllable in-memory substrate and a recording RunEventSink.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunEvent } from '@recoder/agent-os';
import type { SubstrateHandle } from '../../src/contract/index.js';
import type { ClockPort } from '../../src/ports/clock.port.js';
import type { IdPort } from '../../src/ports/id.port.js';
import type { LoggerPort } from '../../src/ports/logger.port.js';
import type { RunEventSink } from '../../src/observe/event-sink.port.js';
import {
  startRunTail,
  TailRegistry,
  type TailSubstrate,
  type RunTailerDeps,
} from '../../src/observe/index.js';

/** A controllable substrate: tests push output, set alive, and an exit code. */
class FakeTailSubstrate implements TailSubstrate {
  output = '';
  isAlive = true;
  exit: number | null | undefined = undefined;
  gone = false;

  async capture(_h: SubstrateHandle, _lines?: number): Promise<string | null> {
    return this.gone ? null : this.output;
  }
  async alive(_h: SubstrateHandle): Promise<boolean> {
    return this.isAlive;
  }
  async exitCode(_h: SubstrateHandle): Promise<number | null | undefined> {
    return this.exit;
  }
}

class RecordingSink implements RunEventSink {
  readonly events: RunEvent[] = [];
  async append(event: RunEvent): Promise<void> {
    this.events.push(event);
  }
  types(): string[] {
    return this.events.map((e) => e.type);
  }
}

/** A clock the test advances by hand (deterministic max-duration testing). */
class FakeClock implements ClockPort {
  ms = 1_000_000;
  now(): string {
    return new Date(this.ms).toISOString();
  }
  nowMs(): number {
    return this.ms;
  }
}

const noopLogger: LoggerPort = { info() {}, warn() {}, error() {} };
const fixedId: IdPort = { newId: () => 'id-fixed' };

function makeDeps(substrate: TailSubstrate, clock: ClockPort): {
  deps: RunTailerDeps;
  sink: RecordingSink;
  registry: TailRegistry;
} {
  const sink = new RecordingSink();
  const registry = new TailRegistry();
  return {
    sink,
    registry,
    deps: { substrate, sink, registry, clock, id: fixedId, logger: noopLogger },
  };
}

const baseInput = {
  workspaceId: 'ws_1',
  taskId: 'task_1',
  runId: 'run_ws_1',
  sessionName: 'recoder-ws_1',
};

/** Spin the event loop a few times so the timer-driven tick can run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

test('emits started → log(delta) → completed for a successful run', async () => {
  const sub = new FakeTailSubstrate();
  const clock = new FakeClock();
  const { deps, sink, registry } = makeDeps(sub, clock);

  // tiny interval so the test does not wait seconds.
  startRunTail({ ...baseInput, intervalMs: 5 }, deps);

  // started is emitted synchronously (fire-and-forget).
  await settle();
  assert.equal(sink.events[0]?.type, 'started');

  // First tick: new output → a log(delta).
  sub.output = 'hello world\n';
  await new Promise((r) => setTimeout(r, 12));
  await settle();
  assert.ok(sink.types().includes('log'), 'a log event was emitted');
  const log = sink.events.find((e) => e.type === 'log');
  assert.equal(log?.message, 'hello world');
  assert.equal((log?.data as { source?: string })?.source, 'tmux');

  // Agent finishes cleanly (exit 0) → completed, tail stops.
  sub.isAlive = false;
  sub.exit = 0;
  await new Promise((r) => setTimeout(r, 12));
  await settle();

  assert.equal(sink.events.at(-1)?.type, 'completed');
  assert.equal((sink.events.at(-1)?.data as { exitCode?: number })?.exitCode, 0);
  assert.equal(registry.count(), 0, 'tail removed itself on completion');
});

test('only the incremental delta is emitted across ticks (prefix-diff)', async () => {
  const sub = new FakeTailSubstrate();
  const clock = new FakeClock();
  const { deps, sink } = makeDeps(sub, clock);

  startRunTail({ ...baseInput, intervalMs: 5 }, deps);
  await settle();

  sub.output = 'line1\n';
  await new Promise((r) => setTimeout(r, 12));
  await settle();

  sub.output = 'line1\nline2\n'; // extends the previous capture
  await new Promise((r) => setTimeout(r, 12));
  await settle();

  const logs = sink.events.filter((e) => e.type === 'log').map((e) => e.message);
  assert.deepEqual(logs, ['line1', 'line2'], 'second log is just the new suffix');

  sub.isAlive = false;
  sub.exit = 0;
  await new Promise((r) => setTimeout(r, 12));
  await settle();
});

test('non-zero exit code → failed (not completed)', async () => {
  const sub = new FakeTailSubstrate();
  const clock = new FakeClock();
  const { deps, sink } = makeDeps(sub, clock);

  startRunTail({ ...baseInput, intervalMs: 5 }, deps);
  await settle();

  sub.isAlive = false;
  sub.exit = 137;
  await new Promise((r) => setTimeout(r, 12));
  await settle();

  const terminal = sink.events.at(-1);
  assert.equal(terminal?.type, 'failed');
  assert.equal((terminal?.data as { exitCode?: number })?.exitCode, 137);
});

test('session gone with no exit code → completed(0) (proven default)', async () => {
  const sub = new FakeTailSubstrate();
  const clock = new FakeClock();
  const { deps, sink } = makeDeps(sub, clock);

  startRunTail({ ...baseInput, intervalMs: 5 }, deps);
  await settle();

  sub.isAlive = false;
  sub.exit = undefined; // substrate cannot report a true exit code
  await new Promise((r) => setTimeout(r, 12));
  await settle();

  const terminal = sink.events.at(-1);
  assert.equal(terminal?.type, 'completed');
  assert.equal((terminal?.data as { exitCode?: number })?.exitCode, 0);
});

test('max-duration safety stop → failed(max_duration)', async () => {
  const sub = new FakeTailSubstrate();
  const clock = new FakeClock();
  const { deps, sink } = makeDeps(sub, clock);

  // Agent stays alive; advance the clock past maxMs so the safety stop fires.
  startRunTail({ ...baseInput, intervalMs: 5, maxMs: 1000 }, deps);
  await settle();

  clock.ms += 5000; // now well past maxMs
  await new Promise((r) => setTimeout(r, 12));
  await settle();

  const terminal = sink.events.at(-1);
  assert.equal(terminal?.type, 'failed');
  assert.equal((terminal?.data as { reason?: string })?.reason, 'max_duration');
});

test('is idempotent per workspace — a second start returns the same handle', async () => {
  const sub = new FakeTailSubstrate();
  const clock = new FakeClock();
  const { deps, registry } = makeDeps(sub, clock);

  const h1 = startRunTail({ ...baseInput, intervalMs: 5 }, deps);
  const h2 = startRunTail({ ...baseInput, intervalMs: 5 }, deps);
  assert.equal(h1, h2);
  assert.equal(registry.count(), 1);

  h1.stop();
  assert.equal(registry.count(), 0);
  sub.isAlive = false;
});
