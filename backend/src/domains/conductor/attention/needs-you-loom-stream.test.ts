/**
 * `createNeedsYouLoomStreamSource` — proves the composition-edge bridge translates the
 * shipped Loom `events.subscribe` stream into truthful push callbacks: a status edge is
 * attributed + emitted; an unattributable / malformed edge is dropped; a missing
 * `agent_status` is surfaced as `unknown`; the stream's own end/error drive onClose/onError;
 * and close() tears down the underlying stream.
 */
import { describe, it, expect } from 'vitest';
import type {
  AgentStatus,
  LoomEventStream,
  LoomSubscriptionEvent,
} from '@recoder/agent-runtimes/loom-client';
import type {
  NeedsYouEvent,
  NeedsYouStreamHandlers,
} from './needs-you-queue.service.js';
import {
  createNeedsYouLoomStreamSource,
  type LoomStatusResolver,
} from './needs-you-loom-stream.js';

/** A hand-driven LoomEventStream — push events, end, fail, or observe close. */
class FakeLoomStream implements LoomEventStream {
  private queue: LoomSubscriptionEvent[] = [];
  private resolveNext:
    | ((r: IteratorResult<LoomSubscriptionEvent>) => void)
    | null = null;
  private rejectNext: ((e: unknown) => void) | null = null;
  private ended = false;
  private failure: unknown = null;
  closed = 0;

  push(event: LoomSubscriptionEvent): void {
    if (this.resolveNext) {
      const r = this.resolveNext;
      this.resolveNext = null;
      this.rejectNext = null;
      r({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }
  end(): void {
    this.ended = true;
    if (this.resolveNext) {
      const r = this.resolveNext;
      this.resolveNext = null;
      this.rejectNext = null;
      r({ value: undefined as never, done: true });
    }
  }
  fail(err: unknown): void {
    this.failure = err;
    if (this.rejectNext) {
      const j = this.rejectNext;
      this.resolveNext = null;
      this.rejectNext = null;
      j(err);
    }
  }
  close(): void {
    this.closed += 1;
    this.end();
  }
  [Symbol.asyncIterator](): AsyncIterator<LoomSubscriptionEvent> {
    return {
      next: () => {
        if (this.queue.length > 0) {
          return Promise.resolve({
            value: this.queue.shift() as LoomSubscriptionEvent,
            done: false,
          });
        }
        if (this.failure != null) return Promise.reject(this.failure);
        if (this.ended) {
          return Promise.resolve({ value: undefined as never, done: true });
        }
        return new Promise<IteratorResult<LoomSubscriptionEvent>>(
          (resolve, reject) => {
            this.resolveNext = resolve;
            this.rejectNext = reject;
          }
        );
      },
      return: () => {
        this.ended = true;
        return Promise.resolve({ value: undefined as never, done: true });
      },
    };
  }
}

function statusEvent(paneId: string, status?: AgentStatus): LoomSubscriptionEvent {
  return {
    event: 'pane.agent_status_changed',
    data: status ? { pane_id: paneId, agent_status: status } : { pane_id: paneId },
  };
}

/** Attribute panes p<id> → workspace ws<id>; anything else is unattributable (null). */
const mapResolver: LoomStatusResolver = {
  resolve(paneId: string, status: AgentStatus): NeedsYouEvent | null {
    if (!paneId.startsWith('p')) return null;
    return {
      workspaceId: `ws${paneId.slice(1)}`,
      agentKind: 'claude',
      owner: 'user-1',
      nativeStatus: status,
    };
  },
};

function collector() {
  const events: NeedsYouEvent[] = [];
  let closes = 0;
  const errors: unknown[] = [];
  const handlers: NeedsYouStreamHandlers = {
    onEvent: e => events.push(e),
    onClose: () => {
      closes += 1;
    },
    onError: e => errors.push(e),
  };
  return { handlers, events, errors, get closes() { return closes; } };
}

const flush = () => new Promise<void>(r => setTimeout(r, 0));

describe('createNeedsYouLoomStreamSource', () => {
  it('attributes and emits a pane status edge', async () => {
    const stream = new FakeLoomStream();
    const source = createNeedsYouLoomStreamSource({
      openStream: () => stream,
      resolver: mapResolver,
    });
    const c = collector();
    source.subscribe(c.handlers);

    stream.push(statusEvent('p1', 'blocked'));
    await flush();

    expect(c.events).toHaveLength(1);
    expect(c.events[0]).toMatchObject({
      workspaceId: 'ws1',
      nativeStatus: 'blocked',
      owner: 'user-1',
    });
  });

  it('drops an unattributable pane (resolver returns null) — never guesses ownership', async () => {
    const stream = new FakeLoomStream();
    const source = createNeedsYouLoomStreamSource({
      openStream: () => stream,
      resolver: mapResolver,
    });
    const c = collector();
    source.subscribe(c.handlers);

    stream.push(statusEvent('xyz', 'blocked')); // does not start with 'p' → null
    stream.push(statusEvent('p2', 'done'));
    await flush();

    expect(c.events.map(e => e.workspaceId)).toEqual(['ws2']);
  });

  it('treats a missing agent_status as a truthful unknown', async () => {
    const stream = new FakeLoomStream();
    const source = createNeedsYouLoomStreamSource({
      openStream: () => stream,
      resolver: mapResolver,
    });
    const c = collector();
    source.subscribe(c.handlers);

    stream.push(statusEvent('p3')); // no agent_status
    await flush();

    expect(c.events[0].nativeStatus).toBe('unknown');
  });

  it('skips a malformed / non-status line without tearing the stream down', async () => {
    const stream = new FakeLoomStream();
    const source = createNeedsYouLoomStreamSource({
      openStream: () => stream,
      resolver: mapResolver,
    });
    const c = collector();
    source.subscribe(c.handlers);

    stream.push({ event: 'pane.scroll_changed', data: { foo: 'bar' } });
    stream.push({ event: 'pane.agent_status_changed', data: null });
    stream.push(statusEvent('p4', 'idle'));
    await flush();

    expect(c.events.map(e => e.workspaceId)).toEqual(['ws4']);
    expect(c.errors).toHaveLength(0);
  });

  it('drives onClose when the stream ends normally', async () => {
    const stream = new FakeLoomStream();
    const source = createNeedsYouLoomStreamSource({
      openStream: () => stream,
      resolver: mapResolver,
    });
    const c = collector();
    source.subscribe(c.handlers);

    stream.end();
    await flush();

    expect(c.closes).toBe(1);
    expect(c.errors).toHaveLength(0);
  });

  it('drives onError when the stream faults', async () => {
    const stream = new FakeLoomStream();
    const source = createNeedsYouLoomStreamSource({
      openStream: () => stream,
      resolver: mapResolver,
    });
    const c = collector();
    source.subscribe(c.handlers);

    stream.fail(new Error('socket closed'));
    await flush();

    expect(c.errors).toHaveLength(1);
    expect((c.errors[0] as Error).message).toMatch(/socket closed/);
  });

  it('surfaces a synchronous openStream failure as onError', async () => {
    const source = createNeedsYouLoomStreamSource({
      openStream: () => {
        throw new Error('no daemon');
      },
      resolver: mapResolver,
    });
    const c = collector();
    source.subscribe(c.handlers);
    await flush();

    expect(c.errors).toHaveLength(1);
    expect((c.errors[0] as Error).message).toMatch(/no daemon/);
  });

  it('close() tears down the underlying stream and stops emitting', async () => {
    const stream = new FakeLoomStream();
    const source = createNeedsYouLoomStreamSource({
      openStream: () => stream,
      resolver: mapResolver,
    });
    const c = collector();
    const sub = source.subscribe(c.handlers);

    sub.close();
    expect(stream.closed).toBe(1);
    stream.push(statusEvent('p9', 'blocked'));
    await flush();
    expect(c.events).toHaveLength(0);
  });
});
