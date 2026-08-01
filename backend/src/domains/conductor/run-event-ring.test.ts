/**
 * `RunEventRing` — the pure per-workspace bounded replay buffer (DT-7.3).
 *
 * Proves: ids are monotonic + 1-based + per-workspace-isolated; the window is
 * bounded (oldest evicted at capacity) yet ids never rewind after eviction;
 * `since` returns exactly the frames newer than a cursor (all at 0, none at
 * latest); a stale cursor below the evicted floor yields the whole retained
 * window and a truthful `oldestRetainedId` gap; and a bad capacity is rejected.
 */
import { describe, it, expect } from 'vitest';
import { RunEventRing } from './terminal/run-event-ring.js';

describe('RunEventRing', () => {
  it('stamps monotonic, 1-based ids isolated per workspace', () => {
    const ring = new RunEventRing(10);
    expect(ring.append('ws_1', { n: 1 })).toBe(1);
    expect(ring.append('ws_1', { n: 2 })).toBe(2);
    // A second workspace has its own independent sequence.
    expect(ring.append('ws_2', { n: 1 })).toBe(1);
    expect(ring.lastEventId('ws_1')).toBe(2);
    expect(ring.lastEventId('ws_2')).toBe(1);
    expect(ring.lastEventId('ws_unknown')).toBe(0);
  });

  it('returns frames strictly newer than the cursor, oldest-first', () => {
    const ring = new RunEventRing(10);
    ring.append('ws_1', { n: 1 });
    ring.append('ws_1', { n: 2 });
    ring.append('ws_1', { n: 3 });

    expect(ring.since('ws_1', 0)).toEqual([
      { eventId: 1, payload: { n: 1 } },
      { eventId: 2, payload: { n: 2 } },
      { eventId: 3, payload: { n: 3 } },
    ]);
    expect(ring.since('ws_1', 1).map((e) => e.eventId)).toEqual([2, 3]);
    expect(ring.since('ws_1', 3)).toEqual([]);
    expect(ring.since('ws_unknown', 0)).toEqual([]);
  });

  it('bounds the window to capacity, evicting oldest but never rewinding ids', () => {
    const ring = new RunEventRing(3);
    for (let n = 1; n <= 5; n++) ring.append('ws_1', { n });

    expect(ring.size('ws_1')).toBe(3);
    // Ids 1 and 2 were evicted; 3,4,5 remain — ids kept climbing past eviction.
    expect(ring.since('ws_1', 0).map((e) => e.eventId)).toEqual([3, 4, 5]);
    expect(ring.oldestRetainedId('ws_1')).toBe(3);
    expect(ring.lastEventId('ws_1')).toBe(5);
    // A new append still advances the id monotonically.
    expect(ring.append('ws_1', { n: 6 })).toBe(6);
    expect(ring.since('ws_1', 0).map((e) => e.eventId)).toEqual([4, 5, 6]);
  });

  it('a stale cursor below the evicted floor replays the whole retained window', () => {
    const ring = new RunEventRing(2);
    for (let n = 1; n <= 4; n++) ring.append('ws_1', { n });
    // Client last saw id 1, but 1 and 2 are gone; it gets what survives (3,4)
    // and can detect the gap because oldestRetainedId (3) > sinceId+1.
    expect(ring.since('ws_1', 1).map((e) => e.eventId)).toEqual([3, 4]);
    expect(ring.oldestRetainedId('ws_1')).toBe(3);
  });

  it('does not mutate returned entries or leak the internal buffer', () => {
    const ring = new RunEventRing(5);
    ring.append('ws_1', { n: 1 });
    const first = ring.since('ws_1', 0);
    ring.append('ws_1', { n: 2 });
    // The earlier snapshot is not retroactively grown.
    expect(first).toHaveLength(1);
    expect(ring.since('ws_1', 0)).toHaveLength(2);
  });

  it('rejects a non-positive or non-integer capacity', () => {
    expect(() => new RunEventRing(0)).toThrow(RangeError);
    expect(() => new RunEventRing(-1)).toThrow(RangeError);
    expect(() => new RunEventRing(1.5)).toThrow(RangeError);
  });
});
