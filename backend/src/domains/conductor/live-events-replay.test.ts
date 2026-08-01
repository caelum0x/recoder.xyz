/**
 * DT-7.3 — the `SyncHub` resume path + its `?since=` wiring on the `/sync` and
 * `/workspaces/:id/stream` backends.
 *
 * Proves: a history-less hub (the pre-DT-7.3 default ctor) exposes no cursor and
 * replays nothing — byte-for-byte backward compatible; a history-enabled hub
 * stamps monotonic ids, replays only the frames newer than a cursor, keeps the
 * LIVE wire bare, and continues live after replay with no gap and no duplicate;
 * the backends replay-then-subscribe only when `?since=` is present (a plain
 * connect is unchanged); and replay is bounded by the ring capacity.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect } from 'vitest';
import type { WsConnectionCtx } from '../edge/ports/ws-backend.port.js';
import {
  SyncHub,
  createSyncBackend,
  createWorkspaceStreamBackend,
  readSince,
} from './terminal/live-events.js';
import { makeLogger, makePrincipal } from './__fixtures__/harness.js';

/** A minimal `ws`-shaped fake socket backed by an EventEmitter. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  readonly sent: string[] = [];
  send(frame: string): void {
    this.sent.push(frame);
  }
  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
}

function ctx(query: Record<string, string> = {}): WsConnectionCtx {
  return {
    principal: makePrincipal(),
    requestId: 'req_1',
    path: '/sync',
    query,
    logger: makeLogger(),
  };
}

describe('readSince', () => {
  it('parses a valid non-negative integer cursor, else undefined', () => {
    expect(readSince(ctx({ since: '7' }))).toBe(7);
    expect(readSince(ctx({ since: '0' }))).toBe(0);
    expect(readSince(ctx())).toBeUndefined();
    expect(readSince(ctx({ since: '' }))).toBeUndefined();
    expect(readSince(ctx({ since: 'abc' }))).toBeUndefined();
    expect(readSince(ctx({ since: '-1' }))).toBeUndefined();
    expect(readSince(ctx({ since: '1.5' }))).toBeUndefined();
  });
});

describe('SyncHub history (DT-7.3)', () => {
  it('is history-less and cursor-free by default (backward compatible)', () => {
    const hub = new SyncHub();
    hub.publishRaw('ws_1', { n: 1 });
    expect(hub.historyEnabled()).toBe(false);
    expect(hub.lastEventId('ws_1')).toBe(0);
    const late = new FakeSocket();
    // No ring ⇒ nothing to replay even with a cursor of 0.
    expect(hub.replaySince('ws_1', late as never, 0)).toBe(0);
    expect(late.sent).toHaveLength(0);
  });

  it('stamps monotonic ids and replays only frames newer than the cursor', () => {
    const hub = new SyncHub({ historyLimit: 100 });
    hub.publishRaw('ws_1', { n: 1 });
    hub.publishRaw('ws_1', { n: 2 });
    hub.publishRaw('ws_1', { n: 3 });
    expect(hub.historyEnabled()).toBe(true);
    expect(hub.lastEventId('ws_1')).toBe(3);

    const resumer = new FakeSocket();
    const cursor = hub.replaySince('ws_1', resumer as never, 1);
    expect(cursor).toBe(3);
    expect(resumer.sent.map((f) => JSON.parse(f))).toEqual([{ n: 2 }, { n: 3 }]);
  });

  it('keeps the live wire bare and replays-then-continues with no gap or dup', () => {
    const hub = new SyncHub({ historyLimit: 100 });
    // A live subscriber present from the start receives bare frames only.
    const live = new FakeSocket();
    hub.subscribe('ws_1', live as never);
    hub.publishRaw('ws_1', { n: 1 });
    hub.publishRaw('ws_1', { n: 2 });
    expect(live.sent.map((f) => JSON.parse(f))).toEqual([{ n: 1 }, { n: 2 }]);

    // A reconnecting client that already saw id 1: replay id 2, then subscribe.
    const resumer = new FakeSocket();
    hub.replaySince('ws_1', resumer as never, 1);
    hub.subscribe('ws_1', resumer as never);
    hub.publishRaw('ws_1', { n: 3 });

    // Replayed [2], then live [3] — no missing frame, no duplicate of id 2.
    expect(resumer.sent.map((f) => JSON.parse(f))).toEqual([{ n: 2 }, { n: 3 }]);
  });

  it('bounds replay to the ring capacity, evicting the oldest frames', () => {
    const hub = new SyncHub({ historyLimit: 2 });
    for (let n = 1; n <= 4; n++) hub.publishRaw('ws_1', { n });
    const resumer = new FakeSocket();
    hub.replaySince('ws_1', resumer as never, 0);
    // Only the last 2 frames survive the bound.
    expect(resumer.sent.map((f) => JSON.parse(f))).toEqual([{ n: 3 }, { n: 4 }]);
  });

  it('does not replay to a socket that is no longer OPEN', () => {
    const hub = new SyncHub({ historyLimit: 10 });
    hub.publishRaw('ws_1', { n: 1 });
    const closed = new FakeSocket();
    closed.readyState = 3;
    hub.replaySince('ws_1', closed as never, 0);
    expect(closed.sent).toHaveLength(0);
  });
});

describe('backend ?since= wiring (DT-7.3)', () => {
  it('/sync replays missed frames before live only when since is present', () => {
    const hub = new SyncHub({ historyLimit: 100 });
    hub.publishRaw('ws_1', { kind: 'log', text: 'a' });
    hub.publishRaw('ws_1', { kind: 'log', text: 'b' });

    const backend = createSyncBackend(hub);
    const resumer = new FakeSocket();
    backend.onConnection(resumer as never, ctx({ workspaceId: 'ws_1', since: '1' }));
    // Replayed frame b (id 2) on attach.
    expect(resumer.sent.map((f) => JSON.parse(f).text)).toEqual(['b']);
    // Then continues live.
    hub.publishRaw('ws_1', { kind: 'log', text: 'c' });
    expect(resumer.sent.map((f) => JSON.parse(f).text)).toEqual(['b', 'c']);
  });

  it('/sync without since attaches live-only (no replay) — unchanged behavior', () => {
    const hub = new SyncHub({ historyLimit: 100 });
    hub.publishRaw('ws_1', { kind: 'log', text: 'old' });
    const backend = createSyncBackend(hub);
    const plain = new FakeSocket();
    backend.onConnection(plain as never, ctx({ workspaceId: 'ws_1' }));
    expect(plain.sent).toHaveLength(0);
    hub.publishRaw('ws_1', { kind: 'log', text: 'new' });
    expect(plain.sent.map((f) => JSON.parse(f).text)).toEqual(['new']);
  });

  it('/workspaces/:id/stream replays full RunEvents newer than since', () => {
    const runHub = new SyncHub({ historyLimit: 100 });
    const e1 = { eventId: 'e1', type: 'log', message: 'one' };
    const e2 = { eventId: 'e2', type: 'log', message: 'two' };
    runHub.publishRaw('ws_1', e1);
    runHub.publishRaw('ws_1', e2);

    const backend = createWorkspaceStreamBackend(runHub);
    const resumer = new FakeSocket();
    backend.onConnection(resumer as never, {
      ...ctx({ since: '1' }),
      path: '/api/conductor/workspaces/ws_1/stream',
    });
    // Replayed the full bare RunEvent e2 (ring id 2).
    expect(resumer.sent.map((f) => JSON.parse(f))).toEqual([e2]);
    const e3 = { eventId: 'e3', type: 'log', message: 'three' };
    runHub.publishRaw('ws_1', e3);
    expect(resumer.sent.map((f) => JSON.parse(f))).toEqual([e2, e3]);
  });
});
