import { describe, expect, it } from 'vitest';
import { serializeTaskStreamEvent } from './task-stream-protocol.js';

describe('task-stream-protocol', () => {
  it('serializes SSE data line with event metadata', () => {
    const sse = serializeTaskStreamEvent({
      type: 'connected',
      taskId: 't1',
      status: 'queued',
    }, {
      id: 't1:1',
      retry: 2000,
    });
    expect(sse.includes('id: t1:1\n')).toBe(true);
    expect(sse.includes('event: connected\n')).toBe(true);
    expect(sse.includes('retry: 2000\n')).toBe(true);
    expect(sse.includes('data: ')).toBe(true);
    expect(sse.endsWith('\n\n')).toBe(true);
  });
});
