import { describe, expect, it } from 'vitest';
import {
  serializePublicTaskStreamEvent,
  parsePublicTaskStreamFrame,
  parsePublicTaskStreamEvent,
  type PublicTaskStreamEvent,
} from './public-task-stream';

describe('public-task-stream', () => {
  describe('serialize → parse round-trip', () => {
    it('connected event', () => {
      const event: PublicTaskStreamEvent = { type: 'connected', taskId: 't1', status: 'queued' };
      const sse = serializePublicTaskStreamEvent(event, { id: 't1:0' });
      const frame = parsePublicTaskStreamFrame(sse);
      expect(frame.data).toEqual(event);
      expect(frame.id).toBe('t1:0');
      expect(frame.event).toBe('connected');
    });

    it('data event', () => {
      const event: PublicTaskStreamEvent = {
        type: 'data',
        data: {
          task: {
            id: 't1',
            projectId: 'p1',
            status: 'running',
            createdAt: 1000,
            updatedAt: 2000,
          },
        },
      };
      const sse = serializePublicTaskStreamEvent(event);
      const frame = parsePublicTaskStreamFrame(sse);
      expect(frame.data).toEqual(event);
      expect(frame.event).toBe('data');
    });

    it('heartbeat event', () => {
      const event: PublicTaskStreamEvent = { type: 'heartbeat', at: Date.now() };
      const sse = serializePublicTaskStreamEvent(event);
      const frame = parsePublicTaskStreamFrame(sse);
      expect(frame.data).toEqual(event);
    });

    it('end event', () => {
      const event: PublicTaskStreamEvent = { type: 'end', status: 'completed' };
      const sse = serializePublicTaskStreamEvent(event);
      const frame = parsePublicTaskStreamFrame(sse);
      expect(frame.data).toEqual(event);
    });

    it('error event', () => {
      const event: PublicTaskStreamEvent = { type: 'error', message: 'something broke' };
      const sse = serializePublicTaskStreamEvent(event);
      const frame = parsePublicTaskStreamFrame(sse);
      expect(frame.data).toEqual(event);
    });
  });

  it('negative retry is ignored', () => {
    const event: PublicTaskStreamEvent = { type: 'heartbeat', at: 1 };
    const sse = serializePublicTaskStreamEvent(event, { retry: -1 });
    const frame = parsePublicTaskStreamFrame(sse);
    expect(frame.retry).toBeUndefined();
  });

  it('missing data line throws', () => {
    expect(() => parsePublicTaskStreamFrame('event: connected\n\n')).toThrow(
      'SSE frame missing data line',
    );
  });

  it('missing type field throws', () => {
    expect(() => parsePublicTaskStreamEvent(JSON.stringify({ noType: true }))).toThrow(
      'Invalid task stream event payload',
    );
  });

  it('non-object payload throws', () => {
    expect(() => parsePublicTaskStreamEvent('"just a string"')).toThrow(
      'Invalid task stream event payload',
    );
  });
});
