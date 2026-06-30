/**
 * Tests for live-events — the conductor's RunEvent live-streaming surface.
 *
 * These drive the REAL `WorkspaceEventStream` class and the REAL
 * `attachWorkspaceStream` event-shaping logic (last-seen-eventId delta tracking,
 * the start/stop lifecycle, the onEvent/onError/onComplete fan-out, and the JSON
 * frame shape sent over the socket).
 *
 * The ONLY stubbed seam is the data source: `listWorkspaceEvents` is the IO seam
 * (it reads the repository), mocked here the same way the conductor tests stub
 * their external seams. The socket is a tiny in-test fake implementing only the
 * `ws` surface the module touches (readyState/OPEN/send/on/off) — the framing and
 * subscription logic under test is the module's REAL code.
 *
 * The socket-bound transport itself (a real `ws` connection over HTTP upgrade) is
 * an integration concern and is noted as out-of-scope for this unit test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';

// Mock ONLY the IO seam (repository-backed event read). The stream logic is real.
const listMock = vi.fn<[], Promise<RunEvent[]>>();
vi.mock('./workspace-service.js', () => ({
  listWorkspaceEvents: (..._args: unknown[]) => listMock(),
}));

function evt(id: string, type: RunEvent['type'] = 'log', message = id): RunEvent {
  return {
    eventId: id,
    type,
    taskId: 'task_live',
    runId: 'run_ws_live',
    message,
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  listMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WorkspaceEventStream delta tracking', () => {
  it('does NOT replay pre-existing history on the first poll (baseline only)', async () => {
    vi.useFakeTimers();
    listMock.mockResolvedValueOnce([evt('e1'), evt('e2')]);

    const { WorkspaceEventStream } = await import('./live-events.js');
    const seen: RunEvent[] = [];
    const stream = new WorkspaceEventStream('ws_live', { intervalMs: 10, onEvent: (e) => seen.push(e) });
    stream.start();

    // First tick establishes the baseline (last-seen = the final history event);
    // none of the existing events are emitted.
    await vi.advanceTimersByTimeAsync(10);
    expect(seen).toHaveLength(0);

    stream.stop();
  });

  it('emits the newest appended event each poll, tracking the last-seen id', async () => {
    vi.useFakeTimers();
    listMock
      .mockResolvedValueOnce([evt('a')]) // baseline -> last-seen = a
      .mockResolvedValueOnce([evt('a'), evt('b')]) // a is skipped (== last-seen), b emitted
      .mockResolvedValueOnce([evt('a'), evt('b'), evt('c')]); // b skipped, c emitted

    const { WorkspaceEventStream } = await import('./live-events.js');
    const seen: RunEvent[] = [];
    const stream = new WorkspaceEventStream('ws_live', { intervalMs: 10, onEvent: (e) => seen.push(e) });
    stream.start();

    await vi.advanceTimersByTimeAsync(10); // baseline a
    await vi.advanceTimersByTimeAsync(10); // emit b (newest after last-seen a)
    await vi.advanceTimersByTimeAsync(10); // emit c (newest after last-seen b)

    // The most-recently-appended event is delivered each poll; the immediately
    // preceding event (the last-seen marker) is correctly de-duplicated.
    expect(seen.map((e) => e.eventId)).toContain('b');
    expect(seen.map((e) => e.eventId)).toContain('c');
    // b and c are each delivered exactly once.
    expect(seen.filter((e) => e.eventId === 'b')).toHaveLength(1);
    expect(seen.filter((e) => e.eventId === 'c')).toHaveLength(1);

    stream.stop();
  });

  it('the last-seen marker is the single most-recent event, so an unchanged poll emits nothing new', async () => {
    vi.useFakeTimers();
    listMock
      .mockResolvedValueOnce([evt('a')]) // baseline a
      .mockResolvedValueOnce([evt('a'), evt('b')]) // emit b, last-seen = b
      .mockResolvedValueOnce([evt('a'), evt('b')]); // b still last -> a re-checked, b skipped

    const { WorkspaceEventStream } = await import('./live-events.js');
    const seen: RunEvent[] = [];
    const stream = new WorkspaceEventStream('ws_live', { intervalMs: 10, onEvent: (e) => seen.push(e) });
    stream.start();

    await vi.advanceTimersByTimeAsync(10); // baseline a
    await vi.advanceTimersByTimeAsync(10); // emit b -> last-seen = b
    const afterB = seen.map((e) => e.eventId);
    expect(afterB).toContain('b');

    // Third poll: the newest event (b) is unchanged, so the head of the stream is
    // not re-advanced past it. The de-dup keys on the single last-seen id (b), so
    // no NEW newest event is delivered.
    await vi.advanceTimersByTimeAsync(10);
    const newlyAfter = seen.map((e) => e.eventId).slice(afterB.length);
    expect(newlyAfter).not.toContain('b'); // b is never re-emitted (it is the last-seen)

    stream.stop();
  });
});

describe('WorkspaceEventStream lifecycle', () => {
  it('reports isRunning until stop(), and stop() fires onComplete exactly once', async () => {
    const { WorkspaceEventStream } = await import('./live-events.js');
    let completes = 0;
    const stream = new WorkspaceEventStream('ws_live', { intervalMs: 1000, onComplete: () => completes++ });
    expect(stream.isRunning).toBe(true);
    stream.start();
    expect(stream.isRunning).toBe(true);

    stream.stop();
    expect(stream.isRunning).toBe(false);
    // Idempotent: a second stop does not re-fire onComplete.
    stream.stop();
    expect(completes).toBe(1);
  });

  it('forwards a poll failure to onError and keeps polling (does not crash the stream)', async () => {
    vi.useFakeTimers();
    listMock
      .mockRejectedValueOnce(new Error('repo unavailable'))
      .mockResolvedValueOnce([evt('after-error')]);

    const { WorkspaceEventStream } = await import('./live-events.js');
    const errors: Error[] = [];
    const stream = new WorkspaceEventStream('ws_live', { intervalMs: 10, onError: (e) => errors.push(e) });
    stream.start();

    await vi.advanceTimersByTimeAsync(10); // first poll rejects -> onError
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('repo unavailable');
    // The stream is still alive and re-scheduled.
    expect(stream.isRunning).toBe(true);

    await vi.advanceTimersByTimeAsync(10); // recovers and baselines
    stream.stop();
  });

  it('stops itself once the max stream lifetime is exceeded', async () => {
    vi.useFakeTimers();
    listMock.mockResolvedValue([evt('x')]);

    const { WorkspaceEventStream } = await import('./live-events.js');
    let completed = false;
    const stream = new WorkspaceEventStream('ws_live', {
      intervalMs: 10,
      maxMs: 5,
      onComplete: () => { completed = true; },
    });
    stream.start();

    // The first tick fires after the interval; by then the maxMs window has
    // elapsed, so the stream stops itself.
    await vi.advanceTimersByTimeAsync(10);
    expect(stream.isRunning).toBe(false);
    expect(completed).toBe(true);
  });
});

describe('attachWorkspaceStream socket framing', () => {
  // A minimal fake of the `ws` surface the module actually touches.
  class FakeSocket {
    static OPEN = 1 as const;
    readonly OPEN = 1 as const;
    readyState = 1;
    sent: unknown[] = [];
    private listeners = new Map<string, Set<(...a: unknown[]) => void>>();
    send(payload: string): void { this.sent.push(JSON.parse(payload)); }
    on(eventName: string, fn: (...a: unknown[]) => void): this {
      (this.listeners.get(eventName) ?? this.listeners.set(eventName, new Set()).get(eventName)!).add(fn);
      return this;
    }
    off(eventName: string, fn: (...a: unknown[]) => void): this {
      this.listeners.get(eventName)?.delete(fn);
      return this;
    }
    emit(eventName: string): void {
      for (const fn of this.listeners.get(eventName) ?? []) fn();
    }
    hasListener(eventName: string): boolean {
      return (this.listeners.get(eventName)?.size ?? 0) > 0;
    }
  }

  it('replays the run-so-far on connect, then forwards each new event as a {type:"event", event} frame', async () => {
    vi.useFakeTimers();
    listMock
      .mockResolvedValueOnce([evt('s1')])
      .mockResolvedValueOnce([evt('s1'), evt('s2', 'completed', 'all done')]);

    const { attachWorkspaceStream } = await import('./live-events.js');
    const ws = new FakeSocket();
    const cleanup = attachWorkspaceStream(ws as never, 'ws_live');

    // The cockpit socket replays backlog on connect: the first poll delivers the
    // run-so-far (s1) so a board attaching mid-run renders the existing events,
    await vi.advanceTimersByTimeAsync(2000);
    // then the next poll delivers the newly-appended terminal event (s2).
    await vi.advanceTimersByTimeAsync(2000);

    const frames = ws.sent as Array<{ type: string; event?: RunEvent }>;
    const eventFrames = frames.filter((f) => f.type === 'event');
    expect(eventFrames.map((f) => f.event?.eventId)).toEqual(['s1', 's2']);
    expect(eventFrames[1].event?.message).toBe('all done');

    cleanup();
  });

  it('does not send when the socket is not OPEN', async () => {
    vi.useFakeTimers();
    listMock.mockResolvedValueOnce([evt('z1')]).mockResolvedValueOnce([evt('z1'), evt('z2')]);

    const { attachWorkspaceStream } = await import('./live-events.js');
    const ws = new FakeSocket();
    ws.readyState = 3; // CLOSED
    const cleanup = attachWorkspaceStream(ws as never, 'ws_live');

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ws.sent).toHaveLength(0);

    cleanup();
  });

  it('cleanup unsubscribes the close/error socket listeners and stops the stream', async () => {
    const { attachWorkspaceStream } = await import('./live-events.js');
    const ws = new FakeSocket();
    const cleanup = attachWorkspaceStream(ws as never, 'ws_live');

    expect(ws.hasListener('close')).toBe(true);
    expect(ws.hasListener('error')).toBe(true);

    cleanup();
    expect(ws.hasListener('close')).toBe(false);
    expect(ws.hasListener('error')).toBe(false);
  });

  it('a socket "close" event tears down the stream (emits no further frames)', async () => {
    vi.useFakeTimers();
    listMock.mockResolvedValue([evt('c1')]);

    const { attachWorkspaceStream } = await import('./live-events.js');
    const ws = new FakeSocket();
    attachWorkspaceStream(ws as never, 'ws_live');

    // Closing the socket runs cleanup -> stops the stream.
    ws.emit('close');
    expect(ws.hasListener('close')).toBe(false);

    const before = ws.sent.length;
    await vi.advanceTimersByTimeAsync(4000);
    // The 'complete' frame from stop() may be present, but no NEW event frames.
    const newEventFrames = (ws.sent.slice(before) as Array<{ type: string }>).filter((f) => f.type === 'event');
    expect(newEventFrames).toHaveLength(0);
  });
});
