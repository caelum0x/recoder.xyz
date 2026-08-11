/**
 * `WaitService` — proves the agent-invokable wait-until-settled primitive with a
 * scripted async event source + a manually-fired timer (no real hub/timer):
 *
 *  - settles on EACH settle-set state (agent_idle_prompt / review_ready /
 *    awaiting_approval / error), and NOT on `working`/`unknown`;
 *  - keeps waiting through working/unknown frames, then settles when a settle
 *    state finally arrives;
 *  - IDENTITY GUARD: a superseding run resolves `run-superseded` and NEVER settles,
 *    even on a settle-looking frame;
 *  - timeout resolves `{ settled:false, reason:'timeout', lastState }` truthfully;
 *  - replay-then-live has no gap and no duplicate (a seq at/below the cursor is
 *    dropped, so a stale replayed settle cannot fire).
 *
 * Clean-room note: behaviour absorbed from herdr (Apache-2.0, src/api/wait.rs) by
 * design only — no code was copied.
 */
import { describe, it, expect } from 'vitest';
import type { AttentionSignals } from '../attention/attention-classifier.js';
import type { AttentionState } from '../types.js';
import {
  WaitService,
  DEFAULT_SETTLE_SET,
  type WaitEventSource,
  type WaitFrame,
  type WaitFrameData,
  type WaitTimer,
} from './wait.service.js';

const WS = 'ws_1';

// --- signal fixtures (classify to a known attention state) -------------------

/** No events, no tail on a live state ⇒ `unknown` (keep waiting). */
const UNKNOWN: AttentionSignals = { state: 'running' };
/** A spinner tail on a live state ⇒ `working` (keep waiting). */
const WORKING: AttentionSignals = { state: 'running', tail: '⠹ Thinking...' };
/** Durable `awaiting_review` ⇒ `review_ready` (settles). */
const REVIEW_READY: AttentionSignals = { state: 'awaiting_review' };
/** Durable `awaiting_approval` ⇒ `awaiting_approval` (settles). */
const AWAITING_APPROVAL: AttentionSignals = { state: 'awaiting_approval' };
/** Durable `failed` ⇒ `error` (settles). */
const ERROR: AttentionSignals = { state: 'failed' };
/** A `needs_input` run event on a live state ⇒ `agent_idle_prompt` (settles). */
const IDLE_PROMPT: AttentionSignals = {
  state: 'running',
  events: [
    {
      eventId: 'ev_1',
      type: 'needs_input',
      taskId: 'task_1',
      runId: 'run_1',
      createdAt: new Date().toISOString(),
    },
  ],
};

// --- a scripted async event source (a pushable pull-queue) -------------------

/**
 * A manually-driven {@link WaitEventSource}: the test `push()`es frames (or
 * `end()`s the stream) and the service's `iterator.next()` resolves them in
 * order. A `next()` with an empty queue parks until the next push — which is how
 * the timeout test leaves the loop waiting so the timer can fire.
 */
class ScriptedSource implements WaitEventSource {
  private readonly queue: WaitFrame[] = [];
  private readonly waiters: Array<(r: IteratorResult<WaitFrame>) => void> = [];
  private closed = false;
  /** How many times the service closed the iterator (leak/cleanup assertion). */
  returned = 0;

  push(frame: WaitFrame): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: frame, done: false });
    } else {
      this.queue.push(frame);
    }
  }

  end(): void {
    this.closed = true;
    let waiter = this.waiters.shift();
    while (waiter) {
      waiter({ value: undefined, done: true });
      waiter = this.waiters.shift();
    }
  }

  watch(): AsyncIterable<WaitFrame> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<WaitFrame>> => {
          const frame = this.queue.shift();
          if (frame) return Promise.resolve({ value: frame, done: false });
          if (this.closed)
            return Promise.resolve({ value: undefined, done: true });
          return new Promise(resolve => this.waiters.push(resolve));
        },
        return: (): Promise<IteratorResult<WaitFrame>> => {
          this.returned += 1;
          this.closed = true;
          return Promise.resolve({ value: undefined, done: true });
        },
      }),
    };
  }
}

/** A manually-fired one-shot timer: `trigger()` fires the armed wait's timeout. */
class FakeTimer implements WaitTimer {
  private onFire?: () => void;
  armedMs?: number;

  arm(ms: number, onFire: () => void): () => void {
    this.armedMs = ms;
    this.onFire = onFire;
    return () => {
      this.onFire = undefined;
    };
  }

  trigger(): void {
    this.onFire?.();
  }

  get armed(): boolean {
    return this.onFire !== undefined;
  }
}

/** Flush the microtask + macrotask queue so scripted frames drain deterministically. */
const flush = (): Promise<void> =>
  new Promise(resolve => setImmediate(resolve));

/** Build a frame from an attention-signals fixture + seq (+ optional run identity). */
function frame(
  seq: number,
  signals: AttentionSignals,
  identity: Pick<WaitFrameData, 'runId' | 'runtimeId'> = {}
): WaitFrame {
  return { seq, signals, ...identity };
}

function build(): {
  service: WaitService;
  source: ScriptedSource;
  timer: FakeTimer;
} {
  const source = new ScriptedSource();
  const timer = new FakeTimer();
  return { service: new WaitService({ source, timer }), source, timer };
}

describe('WaitService — settles on each settle-set state', () => {
  const cases: ReadonlyArray<[string, AttentionSignals, AttentionState]> = [
    ['agent_idle_prompt', IDLE_PROMPT, 'agent_idle_prompt'],
    ['review_ready', REVIEW_READY, 'review_ready'],
    ['awaiting_approval', AWAITING_APPROVAL, 'awaiting_approval'],
    ['error', ERROR, 'error'],
  ];

  it.each(cases)('settles on %s', async (_label, signals, expected) => {
    const { service, source, timer } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      timeoutMs: 1000,
    });
    source.push(frame(1, signals));
    const result = await outcome;

    expect(result.settled).toBe(true);
    if (result.settled) {
      expect(result.state).toBe(expected);
      expect(result.seq).toBe(1);
    }
    // The wait cleaned up: timer disarmed, source iterator closed.
    expect(timer.armed).toBe(false);
    expect(source.returned).toBe(1);
  });

  it('the DEFAULT settle set is exactly the four terminal attention states', () => {
    expect([...DEFAULT_SETTLE_SET].sort()).toEqual(
      ['agent_idle_prompt', 'awaiting_approval', 'error', 'review_ready'].sort()
    );
  });

  it('does NOT settle on a `working` or `unknown` frame (they are non-terminal)', async () => {
    const { service, source, timer } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      timeoutMs: 1000,
    });
    source.push(frame(1, WORKING));
    source.push(frame(2, UNKNOWN));
    await flush();
    // Still parked — no settle, no timeout yet.
    let resolved = false;
    void outcome.then(() => {
      resolved = true;
    });
    await flush();
    expect(resolved).toBe(false);
    // Now let it settle so the pending promise resolves and cleans up.
    source.push(frame(3, REVIEW_READY));
    const result = await outcome;
    expect(result.settled).toBe(true);
    expect(timer.armed).toBe(false);
  });
});

describe('WaitService — keeps waiting through working/unknown, then settles', () => {
  it('ignores working/unknown frames and settles on the later settle state', async () => {
    const { service, source } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      timeoutMs: 1000,
    });
    source.push(frame(1, WORKING));
    source.push(frame(2, UNKNOWN));
    source.push(frame(3, WORKING));
    await flush();
    source.push(frame(4, IDLE_PROMPT));
    const result = await outcome;

    expect(result.settled).toBe(true);
    if (result.settled) {
      expect(result.state).toBe('agent_idle_prompt');
      expect(result.seq).toBe(4);
    }
  });
});

describe('WaitService — identity guard (never settle on a stale/replaced run)', () => {
  it('resolves run-superseded when the current runId no longer matches the pin', async () => {
    const { service, source } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      identity: { runId: 'run_A' },
      timeoutMs: 1000,
    });
    // A settle-LOOKING frame, but from a superseding run (run_B) ⇒ must NOT settle.
    source.push(frame(1, REVIEW_READY, { runId: 'run_B' }));
    const result = await outcome;

    expect(result.settled).toBe(false);
    if (!result.settled) expect(result.reason).toBe('run-superseded');
  });

  it('resolves run-superseded when the pinned runtimeId no longer matches', async () => {
    const { service, source } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      identity: { runtimeId: 'claude_code' },
      timeoutMs: 1000,
    });
    source.push(frame(1, ERROR, { runtimeId: 'codex' }));
    const result = await outcome;

    expect(result.settled).toBe(false);
    if (!result.settled) expect(result.reason).toBe('run-superseded');
  });

  it('settles normally when the pinned run STILL matches', async () => {
    const { service, source } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      identity: { runId: 'run_A', runtimeId: 'claude_code' },
      timeoutMs: 1000,
    });
    source.push(
      frame(1, WORKING, { runId: 'run_A', runtimeId: 'claude_code' })
    );
    await flush();
    source.push(
      frame(2, REVIEW_READY, { runId: 'run_A', runtimeId: 'claude_code' })
    );
    const result = await outcome;

    expect(result.settled).toBe(true);
    if (result.settled) expect(result.state).toBe('review_ready');
  });
});

describe('WaitService — timeout (truthful, never a faked idle)', () => {
  it('resolves settled:false + reason:timeout carrying the last classified state', async () => {
    const { service, source, timer } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      timeoutMs: 1000,
    });
    // Some non-terminal progress, then the deadline fires while still parked.
    source.push(frame(1, UNKNOWN));
    source.push(frame(2, WORKING));
    await flush();
    expect(timer.armedMs).toBe(1000);
    timer.trigger();
    const result = await outcome;

    expect(result.settled).toBe(false);
    if (!result.settled) {
      expect(result.reason).toBe('timeout');
      // `working` was the last thing actually classified — not a fabricated idle.
      expect(result.lastState).toBe('working');
    }
    expect(source.returned).toBe(1);
  });

  it('reports lastState `unknown` when it timed out before any frame arrived', async () => {
    const { service, timer } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      timeoutMs: 500,
    });
    await flush();
    timer.trigger();
    const result = await outcome;

    expect(result.settled).toBe(false);
    if (!result.settled) {
      expect(result.reason).toBe('timeout');
      expect(result.lastState).toBe('unknown');
    }
  });
});

describe('WaitService — replay-then-live: no gap, no duplicate', () => {
  it('processes replayed then live frames in order and settles on the live settle frame', async () => {
    const { service, source } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      timeoutMs: 1000,
    });
    // Replay window (retained frames), oldest-first.
    source.push(frame(1, WORKING));
    source.push(frame(2, UNKNOWN));
    await flush();
    // Live continuation — no gap between replay (…2) and live (3…).
    source.push(frame(3, WORKING));
    source.push(frame(4, REVIEW_READY));
    const result = await outcome;

    expect(result.settled).toBe(true);
    if (result.settled) expect(result.seq).toBe(4);
  });

  it('drops a duplicate seq at the replay/live boundary — a stale replayed settle cannot fire', async () => {
    const { service, source } = build();
    // Resume from cursor 2: frames at/below seq 2 are already-seen duplicates.
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      timeoutMs: 1000,
      sinceSeq: 2,
    });
    // A duplicate replay of seq 2 that LOOKS like a settle must be ignored…
    source.push(frame(2, REVIEW_READY));
    // …as must a re-delivery of seq 1.
    source.push(frame(1, AWAITING_APPROVAL));
    await flush();
    // Only a strictly-newer frame is acted on.
    source.push(frame(3, WORKING));
    source.push(frame(4, ERROR));
    const result = await outcome;

    expect(result.settled).toBe(true);
    if (result.settled) {
      expect(result.state).toBe('error');
      expect(result.seq).toBe(4);
    }
  });

  it('resolves stream-ended (not a faked settle) when the source closes with no settle', async () => {
    const { service, source } = build();
    const outcome = service.waitUntilSettled({
      workspaceId: WS,
      timeoutMs: 1000,
    });
    source.push(frame(1, WORKING));
    await flush();
    source.end();
    const result = await outcome;

    expect(result.settled).toBe(false);
    if (!result.settled) {
      expect(result.reason).toBe('stream-ended');
      expect(result.lastState).toBe('working');
    }
  });
});
