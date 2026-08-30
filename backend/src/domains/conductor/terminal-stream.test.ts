/**
 * Terminal stream surface — the `/terminal` + `/sync` WsBackends the edge
 * registers, and the shared SyncHub the run-tailer publishes through.
 *
 * Proves: both backends require session auth; a socket missing `workspaceId` is
 * closed truthfully (never a silent no-op subscription); `publishSync` fans an
 * event out to every OPEN subscriber and to no one after unsubscribe; a
 * `/terminal` steer with no handler wired replies "steering unavailable" rather
 * than dropping keystrokes, and with a handler routes through it.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import type { WsConnectionCtx } from '../edge/ports/ws-backend.port.js';
import type {
  InteractiveTerminalEvent,
  InteractiveTerminalSession,
} from './ports/interactive-terminal.port.js';
import { TerminalStreamService } from './terminal/terminal-stream.js';
import { SyncHub } from './terminal/live-events.js';
import { makeLogger, makePrincipal } from './__fixtures__/harness.js';

/** A minimal `ws`-shaped fake socket backed by an EventEmitter. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  readonly sent: string[] = [];
  closed?: { code: number; reason: string };
  send(frame: string): void {
    this.sent.push(frame);
  }
  close(code: number, reason: string): void {
    this.readyState = 3;
    this.closed = { code, reason };
    this.emit('close');
  }
}

/** A controllable Loom-shaped renderer that keeps the websocket attach alive. */
class FakeTerminal implements InteractiveTerminalSession {
  readonly resize = vi.fn();
  readonly scroll = vi.fn();
  readonly close = vi.fn(() => this.finish());
  private readonly queued: InteractiveTerminalEvent[] = [];
  private nextFrame?: (
    result: IteratorResult<InteractiveTerminalEvent>
  ) => void;
  private finished = false;

  emit(event: InteractiveTerminalEvent): void {
    if (this.finished) return;
    if (this.nextFrame) {
      const resolve = this.nextFrame;
      this.nextFrame = undefined;
      resolve({ value: event, done: false });
      return;
    }
    this.queued.push(event);
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.nextFrame) {
      const resolve = this.nextFrame;
      this.nextFrame = undefined;
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<InteractiveTerminalEvent> {
    return {
      next: () => {
        const queued = this.queued.shift();
        if (queued) return Promise.resolve({ value: queued, done: false });
        if (this.finished)
          return Promise.resolve({ value: undefined, done: true });
        return new Promise(resolve => {
          this.nextFrame = resolve;
        });
      },
    };
  }
}

function ctx(workspaceId?: string): WsConnectionCtx {
  return {
    principal: makePrincipal(),
    requestId: 'req_1',
    path: '/terminal',
    query: workspaceId ? { workspaceId } : {},
    logger: makeLogger(),
  };
}

describe('SyncHub', () => {
  it('fans a published event out to every OPEN subscriber of that workspace', () => {
    const hub = new SyncHub();
    const a = new FakeSocket();
    const b = new FakeSocket();
    hub.subscribe('ws_1', a as never);
    hub.subscribe('ws_1', b as never);
    hub.subscribe('ws_2', new FakeSocket() as never);

    hub.publish({ workspaceId: 'ws_1', kind: 'log', text: 'hello', at: 'now' });

    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
    expect(JSON.parse(a.sent[0]!).text).toBe('hello');
    expect(hub.subscriberCount()).toBe(3);
  });

  it('stops delivering after unsubscribe and prunes empty workspace sets', () => {
    const hub = new SyncHub();
    const s = new FakeSocket();
    const unsubscribe = hub.subscribe('ws_1', s as never);
    unsubscribe();

    hub.publish({ workspaceId: 'ws_1', kind: 'log', text: 'gone', at: 'now' });

    expect(s.sent).toHaveLength(0);
    expect(hub.subscriberCount()).toBe(0);
  });

  it('does not send to a non-OPEN socket', () => {
    const hub = new SyncHub();
    const s = new FakeSocket();
    s.readyState = 3;
    hub.subscribe('ws_1', s as never);
    hub.publish({ workspaceId: 'ws_1', kind: 'state', at: 'now' });
    expect(s.sent).toHaveLength(0);
  });
});

describe('TerminalStreamService', () => {
  it('serves the /terminal, /sync, and workspace-stream backends, all session-scoped', () => {
    const service = new TerminalStreamService({ logger: makeLogger() });
    const backends = service.terminalBackends();
    expect(backends.map(b => b.path).sort()).toEqual([
      '/api/conductor/workspaces',
      '/sync',
      '/terminal',
    ]);
    for (const backend of backends) expect(backend.authScope).toBe('session');
  });

  it('streams FULL RunEvents to a /workspaces/:id/stream subscriber', () => {
    const service = new TerminalStreamService({ logger: makeLogger() });
    const stream = service
      .terminalBackends()
      .find(b => b.path === '/api/conductor/workspaces')!;
    const socket = new FakeSocket();
    stream.onConnection(socket as never, {
      ...ctx('ws_1'),
      path: '/api/conductor/workspaces/ws_1/stream',
    });

    const event = {
      eventId: 'e1',
      type: 'log',
      taskId: 't1',
      message: 'tick',
      createdAt: 'now',
    };
    service.publishRunEvent('ws_1', event);
    service.publishRunEvent('ws_other', { ...event, eventId: 'e2' });

    expect(socket.sent).toHaveLength(1);
    // Every RunEvent field is byte-intact; the ring's numeric id rides as `seq` (DT-7.3a).
    expect(JSON.parse(socket.sent[0])).toEqual({ ...event, seq: 1 });
  });

  it('closes a stream upgrade whose path is not /workspaces/:id/stream', () => {
    const service = new TerminalStreamService({ logger: makeLogger() });
    const stream = service
      .terminalBackends()
      .find(b => b.path === '/api/conductor/workspaces')!;
    const socket = new FakeSocket();
    stream.onConnection(socket as never, {
      ...ctx('ws_1'),
      path: '/api/conductor/workspaces/ws_1/diff',
    });
    expect(socket.closed?.code).toBe(1008);
  });

  it('closes a /sync socket that omitted workspaceId (truthful, not a silent no-op)', () => {
    const service = new TerminalStreamService({ logger: makeLogger() });
    const sync = service.terminalBackends().find(b => b.path === '/sync')!;
    const socket = new FakeSocket();

    sync.onConnection(socket as never, ctx(undefined));

    expect(socket.closed?.code).toBe(1008);
  });

  it('streams rendered Loom frames to an attached /terminal client', async () => {
    const renderer = new FakeTerminal();
    const attach = vi.fn().mockResolvedValue(renderer);
    const service = new TerminalStreamService({ logger: makeLogger(), attach });
    const terminal = service
      .terminalBackends()
      .find(b => b.path === '/terminal')!;
    const socket = new FakeSocket();
    const connected = terminal.onConnection(socket as never, ctx('ws_1'));
    await vi.waitFor(() => expect(attach).toHaveBeenCalledOnce());

    renderer.emit({
      type: 'terminal.frame',
      seq: 7,
      encoding: 'ansi',
      width: 120,
      height: 36,
      full: true,
      bytes: 'G1sySg==',
    });

    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({
      type: 'terminal.frame',
      seq: 7,
    });
    expect(attach).toHaveBeenCalledWith('ws_1', 120, 36, expect.any(Object));
    expect(service.liveConnections()).toBe(1);

    socket.close(1000, 'test complete');
    await connected;
  });

  it('replies "steering unavailable" when no steer handler is wired', async () => {
    const renderer = new FakeTerminal();
    const service = new TerminalStreamService({
      logger: makeLogger(),
      attach: vi.fn().mockResolvedValue(renderer),
    });
    const terminal = service
      .terminalBackends()
      .find(b => b.path === '/terminal')!;
    const socket = new FakeSocket();
    const connected = terminal.onConnection(socket as never, ctx('ws_1'));
    await vi.waitFor(() => expect(service.liveConnections()).toBe(1));

    socket.emit('message', JSON.stringify({ keys: 'ls\n' }));

    expect(
      socket.sent.some(f => JSON.parse(f).message === 'steering unavailable')
    ).toBe(true);
    socket.close(1000, 'test complete');
    await connected;
  });

  it('routes an inbound /terminal frame through the injected steer handler', async () => {
    const renderer = new FakeTerminal();
    const steer = vi.fn().mockResolvedValue(undefined);
    const service = new TerminalStreamService({
      logger: makeLogger(),
      steer,
      attach: vi.fn().mockResolvedValue(renderer),
    });
    const terminal = service
      .terminalBackends()
      .find(b => b.path === '/terminal')!;
    const socket = new FakeSocket();
    const connected = terminal.onConnection(socket as never, ctx('ws_1'));
    await vi.waitFor(() => expect(service.liveConnections()).toBe(1));

    socket.emit('message', JSON.stringify({ keys: 'echo hi' }));
    await vi.waitFor(() => expect(steer).toHaveBeenCalledOnce());

    expect(steer.mock.calls[0]![0]).toMatchObject({
      workspaceId: 'ws_1',
      keys: 'echo hi',
    });
    socket.close(1000, 'test complete');
    await connected;
  });

  it('routes resize and scroll controls to the Loom renderer, not the steer path', async () => {
    const renderer = new FakeTerminal();
    const steer = vi.fn().mockResolvedValue(undefined);
    const service = new TerminalStreamService({
      logger: makeLogger(),
      steer,
      attach: vi.fn().mockResolvedValue(renderer),
    });
    const terminal = service
      .terminalBackends()
      .find(b => b.path === '/terminal')!;
    const socket = new FakeSocket();
    const connected = terminal.onConnection(socket as never, ctx('ws_1'));
    await vi.waitFor(() => expect(service.liveConnections()).toBe(1));

    socket.emit(
      'message',
      JSON.stringify({ type: 'terminal.resize', cols: 144, rows: 42 })
    );
    socket.emit(
      'message',
      JSON.stringify({ type: 'terminal.scroll', direction: 'up', lines: 3 })
    );

    expect(renderer.resize).toHaveBeenCalledWith(144, 42);
    expect(renderer.scroll).toHaveBeenCalledWith('up', 3);
    expect(steer).not.toHaveBeenCalled();
    socket.close(1000, 'test complete');
    await connected;
  });
});
