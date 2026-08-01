/**
 * DT-7.3b — the `SyncHub` slow-consumer BACKPRESSURE BOUND on the live fan-out.
 *
 * Proves: a subscriber whose outbound buffer (`bufferedAmount`) crosses the cap is
 * dropped — closed truthfully with a slow-consumer code/reason and sent no further
 * frames — so a renderer that stopped reading can no longer grow server memory
 * without bound; a healthy consumer under the cap keeps receiving byte-intact
 * frames; and the cap boundary itself (at the cap = healthy, one byte over =
 * dropped) is respected. The dropped consumer reconnects (DT-7.2) and resumes
 * (DT-7.3 `?since=`), which those suites already cover.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect } from 'vitest';
import { SyncHub, SLOW_CONSUMER_BUFFER_LIMIT_BYTES } from './live-events.js';

/**
 * A `ws`-shaped fake whose `bufferedAmount` is caller-controlled so a test can
 * simulate a consumer that stopped draining its socket.
 */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  closed?: { code: number; reason: string };
  send(frame: string): void {
    this.sent.push(frame);
  }
  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closed = { code: code ?? 0, reason: reason ?? '' };
    this.emit('close');
  }
}

describe('SyncHub slow-consumer backpressure bound (DT-7.3b)', () => {
  it('exposes a positive multi-megabyte buffer cap', () => {
    expect(SLOW_CONSUMER_BUFFER_LIMIT_BYTES).toBeGreaterThan(1024 * 1024);
    expect(Number.isInteger(SLOW_CONSUMER_BUFFER_LIMIT_BYTES)).toBe(true);
  });

  it('closes a subscriber whose buffer exceeds the cap and sends it no further frames', () => {
    const hub = new SyncHub();
    const slow = new FakeSocket();
    hub.subscribe('ws_1', slow as never);

    // Consumer stopped reading: its outbound buffer is over the cap.
    slow.bufferedAmount = SLOW_CONSUMER_BUFFER_LIMIT_BYTES + 1;
    hub.publishRaw('ws_1', { n: 1 });

    // Dropped: no frame buffered, closed truthfully with a slow-consumer reason.
    expect(slow.sent).toHaveLength(0);
    expect(slow.closed).toBeDefined();
    expect(slow.closed!.code).toBe(1013);
    expect(slow.closed!.reason.toLowerCase()).toContain('slow consumer');

    // Even if it somehow re-opens, it stays unsubscribed — no further frames.
    slow.readyState = slow.OPEN;
    slow.bufferedAmount = 0;
    hub.publishRaw('ws_1', { n: 2 });
    expect(slow.sent).toHaveLength(0);
    expect(hub.subscriberCount()).toBe(0);
  });

  it('keeps delivering to a healthy consumer under the cap', () => {
    const hub = new SyncHub();
    const healthy = new FakeSocket();
    hub.subscribe('ws_1', healthy as never);

    healthy.bufferedAmount = 1024; // well under the cap
    hub.publishRaw('ws_1', { n: 1 });
    hub.publishRaw('ws_1', { n: 2 });

    expect(healthy.sent.map((f) => JSON.parse(f))).toEqual([{ n: 1 }, { n: 2 }]);
    expect(healthy.closed).toBeUndefined();
    expect(hub.subscriberCount()).toBe(1);
  });

  it('respects the cap boundary: at the cap is healthy, one byte over is dropped', () => {
    const hub = new SyncHub();

    const atCap = new FakeSocket();
    atCap.bufferedAmount = SLOW_CONSUMER_BUFFER_LIMIT_BYTES; // exactly at the cap
    hub.subscribe('ws_at', atCap as never);
    hub.publishRaw('ws_at', { n: 1 });
    expect(atCap.sent).toHaveLength(1);
    expect(atCap.closed).toBeUndefined();

    const overCap = new FakeSocket();
    overCap.bufferedAmount = SLOW_CONSUMER_BUFFER_LIMIT_BYTES + 1; // one byte over
    hub.subscribe('ws_over', overCap as never);
    hub.publishRaw('ws_over', { n: 1 });
    expect(overCap.sent).toHaveLength(0);
    expect(overCap.closed).toBeDefined();
  });

  it('drops only the slow socket, leaving a healthy peer on the same workspace live', () => {
    const hub = new SyncHub();
    const slow = new FakeSocket();
    const healthy = new FakeSocket();
    hub.subscribe('ws_1', slow as never);
    hub.subscribe('ws_1', healthy as never);

    slow.bufferedAmount = SLOW_CONSUMER_BUFFER_LIMIT_BYTES + 1;
    healthy.bufferedAmount = 0;
    hub.publishRaw('ws_1', { n: 1 });

    expect(slow.closed).toBeDefined();
    expect(slow.sent).toHaveLength(0);
    expect(healthy.sent.map((f) => JSON.parse(f))).toEqual([{ n: 1 }]);
    expect(hub.subscriberCount()).toBe(1);
  });

  it('does not disturb the DT-7.3a seq stamp for a healthy consumer on a history hub', () => {
    const hub = new SyncHub({ historyLimit: 100 });
    const healthy = new FakeSocket();
    hub.subscribe('ws_1', healthy as never);
    healthy.bufferedAmount = 0;
    hub.publishRaw('ws_1', { n: 1 });
    expect(healthy.sent.map((f) => JSON.parse(f))).toEqual([{ n: 1, seq: 1 }]);
  });
});
