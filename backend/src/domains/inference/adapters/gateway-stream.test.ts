/**
 * `gateway-stream` — REAL per-token SSE parsing. Proves the streamer forwards one
 * `onDelta` per content token (token granularity, not a buffered single chunk),
 * tolerates chunk boundaries splitting SSE lines, captures terminal usage, and
 * degrades truthfully on a non-2xx status — never throwing across the seam.
 */
import { describe, it, expect } from 'vitest';
import { streamGatewayCompletion, type StreamFetchLike, type StreamResponse } from './gateway-stream.js';
import type { InferenceRequest } from '../types.js';

const REQ: InferenceRequest = {
  model: 'openai/gpt-4o-mini',
  messages: [{ role: 'user', content: 'hi' }],
};

/** Build an async-iterable body from a list of raw string chunks. */
function bodyOf(chunks: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

function fetchYielding(chunks: string[], ok = true, status = 200): StreamFetchLike {
  return async (): Promise<StreamResponse> => ({
    ok,
    status,
    text: async () => 'error-body',
    body: ok ? bodyOf(chunks) : null,
  });
}

function chunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

describe('streamGatewayCompletion', () => {
  it('forwards one delta per token and aggregates the content', async () => {
    const tokens: string[] = [];
    const result = await streamGatewayCompletion(
      { endpoint: 'http://127.0.0.1:3778', completePath: '/v1/chat/completions', fetch: fetchYielding([chunk('Hel'), chunk('lo'), chunk('!'), 'data: [DONE]\n\n']) },
      REQ,
      (t) => tokens.push(t),
    );
    expect(result.ok).toBe(true);
    expect(tokens).toEqual(['Hel', 'lo', '!']);
    expect(result.deltaCount).toBe(3); // token-granular, NOT one buffered chunk
    expect(result.content).toBe('Hello!');
  });

  it('tolerates SSE lines split across stream chunk boundaries', async () => {
    const full = chunk('AB') + chunk('CD') + 'data: [DONE]\n\n';
    // Split the byte stream at an arbitrary mid-line offset.
    const mid = Math.floor(full.length / 3);
    const tokens: string[] = [];
    const result = await streamGatewayCompletion(
      { endpoint: 'http://x', completePath: '/p', fetch: fetchYielding([full.slice(0, mid), full.slice(mid)]) },
      REQ,
      (t) => tokens.push(t),
    );
    expect(result.ok).toBe(true);
    expect(tokens).toEqual(['AB', 'CD']);
    expect(result.content).toBe('ABCD');
  });

  it('captures terminal usage + model from a usage chunk', async () => {
    const usageChunk = `data: ${JSON.stringify({ model: 'openai/gpt-4o-mini', usage: { prompt_tokens: 12, completion_tokens: 3 } })}\n\n`;
    const result = await streamGatewayCompletion(
      { endpoint: 'http://x', completePath: '/p', fetch: fetchYielding([chunk('hi'), usageChunk, 'data: [DONE]\n\n']) },
      REQ,
      () => {},
    );
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3, totalTokens: 15 });
    expect(result.model).toBe('openai/gpt-4o-mini');
  });

  it('degrades truthfully on a non-2xx status (never throws)', async () => {
    const result = await streamGatewayCompletion(
      { endpoint: 'http://x', completePath: '/p', fetch: fetchYielding([], false, 502) },
      REQ,
      () => {},
    );
    expect(result.ok).toBe(false);
    expect(result.deltaCount).toBe(0);
    expect(result.reason).toContain('not routed');
  });
});
