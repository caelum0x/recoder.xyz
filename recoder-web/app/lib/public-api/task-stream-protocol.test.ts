import { describe, expect, it } from 'vitest';
import { parseTaskStreamEvent, parseTaskStreamFrame } from './task-stream-protocol';

describe('task-stream-protocol', () => {
  it('parses data event payload', () => {
    const event = parseTaskStreamEvent(JSON.stringify({
      type: 'data',
      data: {
        task: {
          id: 't1',
          projectId: 'p1',
          status: 'running',
          createdAt: 1,
          updatedAt: 2,
        },
      },
    }));

    expect(event.type).toBe('data');
    if (event.type === 'data') {
      expect(event.data.task.id).toBe('t1');
    }
  });

  it('parses SSE frame metadata and data payload', () => {
    const frame = [
      'id: task-1:123',
      'event: data',
      'retry: 2000',
      'data: {"type":"heartbeat","at":123}',
      '',
    ].join('\n');

    const parsed = parseTaskStreamFrame(frame);
    expect(parsed.id).toBe('task-1:123');
    expect(parsed.event).toBe('data');
    expect(parsed.retry).toBe(2000);
    expect(parsed.data.type).toBe('heartbeat');
  });
});
