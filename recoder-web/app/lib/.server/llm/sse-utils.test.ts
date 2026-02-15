import { describe, expect, it } from 'vitest';
import { SSEParser, extractChatCompletionDelta } from './sse-utils.js';

describe('SSEParser', () => {
  it('parses a frame split across chunk boundaries', () => {
    const frames: Array<{ data: string; event?: string }> = [];
    const parser = new SSEParser((frame) => {
      frames.push({ data: frame.data, event: frame.event });
    });

    parser.push('event: message\ndata: {"choices":[{"delta":{"cont');
    parser.push('ent":"hello"}}]}\n\n');
    parser.flush();

    expect(frames).toEqual([
      {
        event: 'message',
        data: '{"choices":[{"delta":{"content":"hello"}}]}',
      },
    ]);
  });

  it('joins multi-line data fields into a single frame payload', () => {
    const frames: Array<{ data: string }> = [];
    const parser = new SSEParser((frame) => {
      frames.push({ data: frame.data });
    });

    parser.push('data: line1\ndata: line2\n\n');
    parser.flush();

    expect(frames).toEqual([{ data: 'line1\nline2' }]);
  });
});

describe('extractChatCompletionDelta', () => {
  it('extracts content from OpenAI-compatible delta payload', () => {
    const data = '{"choices":[{"delta":{"content":"hello world"}}]}';
    expect(extractChatCompletionDelta(data)).toBe('hello world');
  });

  it('returns null for [DONE]', () => {
    expect(extractChatCompletionDelta('[DONE]')).toBeNull();
  });

  it('returns null for invalid JSON or non-content events', () => {
    expect(extractChatCompletionDelta('not-json')).toBeNull();
    expect(extractChatCompletionDelta('{"choices":[{"delta":{}}]}')).toBeNull();
  });
});
