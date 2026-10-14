/**
 * `NeedsYouQueueService` — proves the PUSH-driven Needs-You queue is truthful + resilient
 * (LOOM-ROADMAP.md build-now #4). Drives the service with a scripted fake push stream + a
 * fake scheduler (no real Loom, no wall clock):
 *
 *  - an `awaiting_approval` (blocked) pane OUTRANKS a `working` pane in the ranked queue;
 *  - a `done` pane becomes `review_ready` and ranks accordingly (below awaiting_approval,
 *    above working) and counts as needing you;
 *  - an `unknown` (no-signal) pane is NOT ranked as actionable and NOT counted;
 *  - a second event for the SAME pane UPDATES its entry (never duplicates);
 *  - a stream error ⇒ `degraded:true` + a reason with the last-known entries PRESERVED
 *    (never a fabricated all-clear), and a scheduled bounded re-subscribe recovers;
 *  - scope narrows by owner + task group; teardown closes the stream + cancels reconnect.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { AgentStatus } from '@recoder/agent-runtimes/loom-client';
import {
  NeedsYouQueueService,
  type NeedsYouEvent,
  type NeedsYouScheduler,
  type NeedsYouStreamHandlers,
  type NeedsYouStreamSource,
  type NeedsYouSubscription,
} from './needs-you-queue.service.js';

/** A controllable in-memory push source — the composition edge's Loom bridge, faked. */
class FakeSource implements NeedsYouStreamSource {
  handlers: NeedsYouStreamHandlers | null = null;
  subscribeCount = 0;
  closeCount = 0;

  subscribe(handlers: NeedsYouStreamHandlers): NeedsYouSubscription {
    this.subscribeCount += 1;
    this.handlers = handlers;
    return {
      close: () => {
        this.closeCount += 1;
      },
    };
  }

  emit(event: NeedsYouEvent): void {
    this.handlers?.onEvent(event);
  }
  fail(err: unknown): void {
    this.handlers?.onError(err);
  }
  end(): void {
    this.handlers?.onClose();
  }
}

/** A deterministic scheduler: captures pending callbacks so tests fire reconnects by hand. */
class FakeScheduler implements NeedsYouScheduler {
  pending: Array<{ fn: () => void; ms: number }> = [];

  schedule(fn: () => void, ms: number): () => void {
    const entry = { fn, ms };
    this.pending.push(entry);
    return () => {
      this.pending = this.pending.filter(p => p !== entry);
    };
  }

  runAll(): void {
    const batch = this.pending;
    this.pending = [];
    for (const e of batch) e.fn();
  }
}

function ev(over: Partial<NeedsYouEvent> & { nativeStatus: AgentStatus }): NeedsYouEvent {
  return {
    workspaceId: 'ws1',
    agentKind: 'claude',
    owner: 'user-1',
    ...over,
  };
}

let source: FakeSource;
let scheduler: FakeScheduler;
let queue: NeedsYouQueueService;

beforeEach(() => {
  source = new FakeSource();
  scheduler = new FakeScheduler();
  queue = new NeedsYouQueueService({ source, scheduler });
});

describe('NeedsYouQueueService — ranking + truthful counting', () => {
  it('is degraded (not started) before start(), never a fabricated empty all-clear', () => {
    const snap = queue.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.reason).toMatch(/not started/i);
    expect(snap.entries).toEqual([]);
    expect(snap.count).toBe(0);
    expect(source.subscribeCount).toBe(0);
  });

  it('subscribes exactly once on start() and goes live', () => {
    queue.start();
    queue.start(); // idempotent
    expect(source.subscribeCount).toBe(1);
    expect(queue.snapshot().degraded).toBe(false);
  });

  it('ranks an awaiting_approval (blocked) pane ABOVE a working pane', () => {
    queue.start();
    source.emit(ev({ workspaceId: 'ws_work', nativeStatus: 'working' }));
    source.emit(ev({ workspaceId: 'ws_block', nativeStatus: 'blocked' }));

    const snap = queue.snapshot();
    expect(snap.entries.map(e => e.workspaceId)).toEqual(['ws_block', 'ws_work']);
    expect(snap.entries[0].state).toBe('awaiting_approval');
    expect(snap.entries[1].state).toBe('working');
    expect(snap.entries[0].rank).toBeGreaterThan(snap.entries[1].rank);
    // Only the blocked pane NEEDS the human; a working pane is progressing (not counted).
    expect(snap.entries[0].needsYou).toBe(true);
    expect(snap.entries[1].needsYou).toBe(false);
    expect(snap.count).toBe(1);
    expect(snap.total).toBe(2);
  });

  it('maps a done pane to review_ready and ranks it between approval and working', () => {
    queue.start();
    source.emit(ev({ workspaceId: 'ws_block', nativeStatus: 'blocked' }));
    source.emit(ev({ workspaceId: 'ws_done', nativeStatus: 'done' }));
    source.emit(ev({ workspaceId: 'ws_work', nativeStatus: 'working' }));

    const snap = queue.snapshot();
    expect(snap.entries.map(e => e.state)).toEqual([
      'awaiting_approval',
      'review_ready',
      'working',
    ]);
    expect(snap.entries[1].workspaceId).toBe('ws_done');
    expect(snap.entries[1].nativeStatus).toBe('done');
    expect(snap.entries[1].needsYou).toBe(true);
    // approval + review_ready need you; working does not.
    expect(snap.count).toBe(2);
  });

  it('tracks an unknown/no-signal pane but NEVER ranks or counts it as actionable', () => {
    queue.start();
    source.emit(ev({ workspaceId: 'ws_block', nativeStatus: 'blocked' }));
    source.emit(ev({ workspaceId: 'ws_unknown', nativeStatus: 'unknown' }));

    const snap = queue.snapshot();
    // The unknown pane is tracked (total) but absent from the ranked/actionable set.
    expect(snap.total).toBe(2);
    expect(snap.entries.map(e => e.workspaceId)).toEqual(['ws_block']);
    expect(snap.count).toBe(1);
    expect(snap.entries.some(e => e.state === 'unknown')).toBe(false);
  });

  it('UPDATES a pane in place on a second event (never duplicates the entry)', () => {
    queue.start();
    source.emit(ev({ workspaceId: 'ws1', nativeStatus: 'working' }));
    expect(queue.snapshot().entries).toHaveLength(1);
    expect(queue.snapshot().entries[0].state).toBe('working');

    source.emit(ev({ workspaceId: 'ws1', nativeStatus: 'blocked' }));
    const snap = queue.snapshot();
    expect(snap.entries).toHaveLength(1);
    expect(snap.total).toBe(1);
    expect(snap.entries[0].state).toBe('awaiting_approval');
  });

  it('breaks a rank tie by unseen-first, then workspaceId', () => {
    queue.start();
    source.emit(ev({ workspaceId: 'ws_b', nativeStatus: 'blocked', seen: true }));
    source.emit(ev({ workspaceId: 'ws_a', nativeStatus: 'blocked', seen: false }));

    // Same base state (awaiting_approval); the UNSEEN one edges ahead.
    expect(queue.snapshot().entries.map(e => e.workspaceId)).toEqual([
      'ws_a',
      'ws_b',
    ]);
  });
});

describe('NeedsYouQueueService — scope narrowing', () => {
  it('narrows by owner and by task group', () => {
    queue.start();
    source.emit(
      ev({ workspaceId: 'w1', owner: 'user-1', taskGroup: 'g1', nativeStatus: 'blocked' })
    );
    source.emit(
      ev({ workspaceId: 'w2', owner: 'user-2', taskGroup: 'g1', nativeStatus: 'blocked' })
    );
    source.emit(
      ev({ workspaceId: 'w3', owner: 'user-1', taskGroup: 'g2', nativeStatus: 'done' })
    );

    expect(queue.snapshot({ owner: 'user-1' }).entries.map(e => e.workspaceId)).toEqual([
      'w1',
      'w3',
    ]);
    expect(queue.snapshot({ owner: 'user-2' }).entries.map(e => e.workspaceId)).toEqual([
      'w2',
    ]);
    expect(
      queue.snapshot({ owner: 'user-1', taskGroup: 'g1' }).entries.map(e => e.workspaceId)
    ).toEqual(['w1']);
  });
});

describe('NeedsYouQueueService — resilient lifecycle (degrade + re-subscribe)', () => {
  it('degrades truthfully on a stream error, PRESERVING last-known entries (no fake all-clear)', () => {
    queue.start();
    source.emit(ev({ workspaceId: 'ws_block', nativeStatus: 'blocked' }));
    expect(queue.snapshot().degraded).toBe(false);

    source.fail(new Error('socket boom'));
    const snap = queue.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.reason).toMatch(/stream error/i);
    expect(snap.reason).toMatch(/reconnect/i);
    // The last-known blocked pane is PRESERVED (stale + flagged), never silently cleared.
    expect(snap.entries.map(e => e.workspaceId)).toEqual(['ws_block']);
    expect(snap.count).toBe(1);
  });

  it('degrades on a clean stream close too (never read as nothing-needs-you)', () => {
    queue.start();
    source.emit(ev({ workspaceId: 'ws_block', nativeStatus: 'blocked' }));
    source.end();
    const snap = queue.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.reason).toMatch(/stream closed/i);
  });

  it('schedules a bounded re-subscribe that re-establishes the stream and repopulates', () => {
    queue.start();
    source.fail(new Error('down'));
    expect(scheduler.pending).toHaveLength(1);
    expect(queue.snapshot().degraded).toBe(true);

    scheduler.runAll(); // fire the reconnect timer → a fresh subscription is opened
    expect(source.subscribeCount).toBe(2);
    // The re-established subscription is live again (no fabricated state in between).
    expect(queue.snapshot().degraded).toBe(false);

    source.emit(ev({ workspaceId: 'ws_block', nativeStatus: 'blocked' }));
    const snap = queue.snapshot();
    expect(snap.degraded).toBe(false);
    expect(snap.reason).toBeUndefined();
    expect(snap.entries.map(e => e.workspaceId)).toEqual(['ws_block']);
  });

  it('backs off exponentially and gives up (staying degraded) after the bounded attempts', () => {
    queue.start();
    // Force repeated failures: each scheduled reconnect immediately fails again.
    for (let i = 0; i < 12; i += 1) {
      source.fail(new Error(`down-${i}`));
      scheduler.runAll();
    }
    const snap = queue.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.reason).toMatch(/exhausted/i);
    // Once exhausted, no further reconnect is scheduled.
    source.fail(new Error('final'));
    expect(scheduler.pending).toHaveLength(0);
  });

  it('resets the backoff after a healthy event so a later disconnect retries fresh', () => {
    queue.start();
    source.fail(new Error('a'));
    scheduler.runAll();
    source.emit(ev({ workspaceId: 'ws1', nativeStatus: 'idle' })); // healthy ⇒ reset
    expect(queue.snapshot().degraded).toBe(false);

    source.fail(new Error('b'));
    // Fresh attempt counter ⇒ a reconnect is scheduled again (not treated as exhausted).
    expect(scheduler.pending).toHaveLength(1);
    expect(queue.snapshot().reason).toMatch(/attempt 1\//);
  });

  it('teardown closes the subscription, cancels a pending reconnect, and stays truthful', () => {
    queue.start();
    source.emit(ev({ workspaceId: 'ws_block', nativeStatus: 'blocked' }));
    source.fail(new Error('down'));
    expect(scheduler.pending).toHaveLength(1);

    queue.stop();
    expect(source.closeCount).toBe(0); // subscription was already dropped on error
    expect(scheduler.pending).toHaveLength(0); // pending reconnect cancelled
    expect(queue.snapshot().reason).toMatch(/stopped/i);

    // A late scheduler fire after stop() must not resurrect the subscription.
    scheduler.runAll();
    expect(source.subscribeCount).toBe(1);
  });

  it('stop() closes an active subscription', () => {
    queue.start();
    queue.stop();
    expect(source.closeCount).toBe(1);
    // A late event after stop is ignored (no resurrection).
    source.emit(ev({ workspaceId: 'ws1', nativeStatus: 'blocked' }));
    expect(queue.snapshot().entries).toEqual([]);
  });
});
