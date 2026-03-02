import express from 'express';
import http, { type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A2AEventType, getA2AEventBus, resetA2AEventBus, type A2AEvent } from '../a2a-event-bus';
import { sseStreamRouter } from '../sse-stream.router';

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

type ParsedSseEvent = {
  id?: string;
  event?: string;
  data?: unknown;
};

function createSseClient(url: string) {
  let req: http.ClientRequest | null = null;
  let res: IncomingMessage | null = null;
  let buffer = '';
  let current: { id?: string; event?: string; data?: string } = {};
  const queue: ParsedSseEvent[] = [];
  const waiters: Array<(evt: ParsedSseEvent) => void> = [];

  const pushEvent = (evt: ParsedSseEvent) => {
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter?.(evt);
      return;
    }
    queue.push(evt);
  };

  const parseChunk = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('id: ')) {
        current.id = line.slice(4);
        continue;
      }
      if (line.startsWith('event: ')) {
        current.event = line.slice(7);
        continue;
      }
      if (line.startsWith('data: ')) {
        current.data = line.slice(6);
        continue;
      }
      if (line.startsWith(':')) {
        continue;
      }
      if (line === '' && (current.id || current.event || current.data)) {
        const parsed: ParsedSseEvent = {
          id: current.id,
          event: current.event,
        };
        if (typeof current.data === 'string') {
          try {
            parsed.data = JSON.parse(current.data);
          } catch {
            parsed.data = current.data;
          }
        }
        pushEvent(parsed);
        current = {};
      }
    }
  };

  const connect = async () => {
    await new Promise<void>((resolve, reject) => {
      req = http.get(
        url,
        {
          headers: {
            Accept: 'text/event-stream',
            Connection: 'keep-alive',
          },
        },
        (incoming) => {
          res = incoming;
          incoming.setEncoding('utf8');
          incoming.on('data', (chunk) => parseChunk(String(chunk)));
          incoming.on('error', reject);
          resolve();
        },
      );
      req.on('error', reject);
    });
  };

  const nextEvent = (timeoutMs = 2500): Promise<ParsedSseEvent> => {
    if (queue.length > 0) {
      return Promise.resolve(queue.shift() as ParsedSseEvent);
    }

    return new Promise<ParsedSseEvent>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = waiters.indexOf(waiter);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for SSE event after ${timeoutMs}ms`));
      }, timeoutMs);

      const waiter = (evt: ParsedSseEvent) => {
        clearTimeout(timeout);
        resolve(evt);
      };
      waiters.push(waiter);
    });
  };

  const close = () => {
    req?.destroy();
    res?.destroy();
    req = null;
    res = null;
  };

  return { connect, nextEvent, close };
}

describe('A2A SSE reconnect/resume E2E (socket-backed)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use('/api/a2a', sseStreamRouter);

    server = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1');
      instance.on('listening', () => resolve(instance));
      instance.on('error', reject);
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    resetA2AEventBus();
  });

  it('reconnects and continues receiving new filtered events in order', async () => {
    const bus = getA2AEventBus();
    const streamA = createSseClient(`${baseUrl}/api/a2a/events/stream?types=${encodeURIComponent(A2AEventType.TaskCompleted)}`);
    await streamA.connect();

    const connectedA = await streamA.nextEvent();
    expect(connectedA.event).toBe('stream.connected');

    bus.publish({
      id: 'reconnect-1',
      type: A2AEventType.TaskCompleted,
      timestamp: new Date().toISOString(),
      data: { index: 1 },
    });
    const first = await streamA.nextEvent();
    expect(first.id).toBe('reconnect-1');
    expect(first.event).toBe(A2AEventType.TaskCompleted);
    streamA.close();

    const streamB = createSseClient(`${baseUrl}/api/a2a/events/stream?types=${encodeURIComponent(A2AEventType.TaskCompleted)}`);
    await streamB.connect();
    const connectedB = await streamB.nextEvent();
    expect(connectedB.event).toBe('stream.connected');

    bus.publish({
      id: 'reconnect-2',
      type: A2AEventType.TaskCompleted,
      timestamp: new Date().toISOString(),
      data: { index: 2 },
    });
    const second = await streamB.nextEvent();
    expect(second.id).toBe('reconnect-2');
    expect(second.event).toBe(A2AEventType.TaskCompleted);
    streamB.close();
  });

  it('preserves event ordering under burst load', async () => {
    const bus = getA2AEventBus();
    const stream = createSseClient(`${baseUrl}/api/a2a/events/stream`);
    await stream.connect();
    const connected = await stream.nextEvent();
    expect(connected.event).toBe('stream.connected');

    const burst = 25;
    for (let i = 1; i <= burst; i += 1) {
      bus.publish({
        id: `order-${i}`,
        type: A2AEventType.TaskStarted,
        timestamp: new Date().toISOString(),
        data: { seq: i },
      });
    }

    const received: ParsedSseEvent[] = [];
    for (let i = 0; i < burst; i += 1) {
      received.push(await stream.nextEvent());
    }

    expect(received.map((evt) => evt.id)).toEqual(
      Array.from({ length: burst }, (_, i) => `order-${i + 1}`),
    );
    expect(received.map((evt) => evt.event)).toEqual(
      Array.from({ length: burst }, () => A2AEventType.TaskStarted),
    );
    stream.close();
  });

  it('enforces type filters correctly under mixed burst load', async () => {
    const allowedTypes = [A2AEventType.TaskCompleted, A2AEventType.TaskFailed];
    const bus = getA2AEventBus();
    const stream = createSseClient(
      `${baseUrl}/api/a2a/events/stream?types=${encodeURIComponent(allowedTypes.join(','))}`,
    );
    await stream.connect();
    const connected = await stream.nextEvent();
    expect(connected.event).toBe('stream.connected');

    const mixed: Array<{ id: string; type: A2AEvent['type'] }> = [
      { id: 'mix-1', type: A2AEventType.TaskStarted },
      { id: 'mix-2', type: A2AEventType.TaskCompleted },
      { id: 'mix-3', type: A2AEventType.TaskInputRequired },
      { id: 'mix-4', type: A2AEventType.TaskFailed },
      { id: 'mix-5', type: A2AEventType.TaskCompleted },
      { id: 'mix-6', type: A2AEventType.TaskStarted },
      { id: 'mix-7', type: A2AEventType.TaskFailed },
    ];

    for (const evt of mixed) {
      bus.publish({
        id: evt.id,
        type: evt.type,
        timestamp: new Date().toISOString(),
        data: { id: evt.id },
      });
    }

    const expected = mixed.filter((evt) => allowedTypes.includes(evt.type));
    const received: ParsedSseEvent[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      received.push(await stream.nextEvent());
    }

    expect(received.map((evt) => evt.id)).toEqual(expected.map((evt) => evt.id));
    expect(received.every((evt) => allowedTypes.includes(evt.event as A2AEvent['type']))).toBe(true);
    stream.close();
  });
});
