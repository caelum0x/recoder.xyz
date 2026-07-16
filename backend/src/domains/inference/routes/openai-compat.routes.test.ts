/**
 * `openai-compat.routes` (DEEPENED) — verifies the OpenAI wire mapping, REAL SSE
 * streaming (one `chat.completion.chunk` per token via the routing service's
 * `onDelta`), deferred SSE headers so a no-delta failure returns a truthful JSON
 * error (never a 200 over a failure), and buffered non-stream completions.
 */
import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { handleChatCompletion, parseOpenAiMessages, type InferenceOpenAiCompatDeps } from './openai-compat.routes.js';
import type { InferenceStreamResult, StreamDelta } from '../types.js';

interface CapturedRes {
  _status: number;
  _json: unknown;
  _writes: string[];
  _ended: boolean;
  _headers: Record<string, string>;
}

/** A fake express Response capturing status, headers, json, and SSE writes. */
function fakeRes(): Response & CapturedRes {
  const res: Partial<Response> & CapturedRes = {
    _status: 0,
    _json: undefined,
    _writes: [],
    _ended: false,
    _headers: {},
    status(code: number) {
      res._status = code;
      return res as Response;
    },
    json(body: unknown) {
      res._json = body;
      return res as Response;
    },
    setHeader(k: string, v: string) {
      res._headers[k] = String(v);
      return res as Response;
    },
    flushHeaders() {},
    write(chunk: string) {
      res._writes.push(chunk);
      return true;
    },
    end() {
      res._ended = true;
      return res as Response;
    },
  };
  return res as Response & CapturedRes;
}

function reqOf(body: unknown): Request {
  return { body, principal: { userId: 'u1' } } as unknown as Request;
}

const IDS: InferenceOpenAiCompatDeps['idFactory'] = () => 'chatcmpl-test';
const NOW: InferenceOpenAiCompatDeps['now'] = () => 1_700_000_000;

describe('parseOpenAiMessages', () => {
  it('maps developer→system and flattens content-part arrays', () => {
    const msgs = parseOpenAiMessages([
      { role: 'developer', content: 'sys' },
      { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    ]);
    expect(msgs).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'a\nb' },
    ]);
  });

  it('rejects an empty or malformed array', () => {
    expect(parseOpenAiMessages([])).toBeNull();
    expect(parseOpenAiMessages([{ role: 'nope', content: 'x' }])).toBeNull();
  });
});

describe('handleChatCompletion (buffered)', () => {
  it('returns an OpenAI chat.completion for a routed call', async () => {
    const deps: InferenceOpenAiCompatDeps = {
      routing: {
        complete: async () => ({ routed: true, tier: 'loopback', model: 'm', content: 'hello', usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 } }),
        completeStream: async () => ({ routed: true, tier: 'loopback', model: 'm', content: 'hello', streamed: true, tokenGranular: true }),
      },
      idFactory: IDS,
      now: NOW,
    };
    const res = fakeRes();
    await handleChatCompletion(deps, reqOf({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }), res);
    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      choices: [{ message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    });
  });

  it('maps a pre-dispatch quota refusal to a truthful 429 insufficient_quota', async () => {
    const deps: InferenceOpenAiCompatDeps = {
      routing: {
        complete: async () => ({ routed: false, tier: 'none', model: 'm', content: null, reason: 'token quota exhausted', denied: 'quota' }),
        completeStream: async () => ({ routed: false, tier: 'none', model: 'm', content: null, reason: 'token quota exhausted', denied: 'quota', streamed: false, tokenGranular: false }),
      },
      idFactory: IDS,
      now: NOW,
    };
    const res = fakeRes();
    await handleChatCompletion(deps, reqOf({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }), res);
    expect(res._status).toBe(429);
    expect(res._json).toMatchObject({ error: { type: 'insufficient_quota', message: 'token quota exhausted' } });
  });

  it('rejects a missing model with a 400', async () => {
    const deps = { routing: { complete: async () => { throw new Error('unreached'); }, completeStream: async () => { throw new Error('unreached'); } } } as unknown as InferenceOpenAiCompatDeps;
    const res = fakeRes();
    await handleChatCompletion(deps, reqOf({ messages: [{ role: 'user', content: 'hi' }] }), res);
    expect(res._status).toBe(400);
  });
});

describe('handleChatCompletion (real streaming)', () => {
  it('emits one chat.completion.chunk per token then a finish + [DONE]', async () => {
    const streamResult: InferenceStreamResult = { routed: true, tier: 'loopback', model: 'm', content: 'Hi!', usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 }, streamed: true, tokenGranular: true };
    const deps: InferenceOpenAiCompatDeps = {
      routing: {
        complete: async () => ({ routed: true, tier: 'loopback', model: 'm', content: 'Hi!' }),
        completeStream: async (_req, onDelta: (d: StreamDelta) => void) => {
          onDelta({ role: 'assistant' });
          onDelta({ content: 'Hi' });
          onDelta({ content: '!' });
          return streamResult;
        },
      },
      idFactory: IDS,
      now: NOW,
    };
    const res = fakeRes();
    await handleChatCompletion(deps, reqOf({ model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] }), res);

    expect(res._headers['Content-Type']).toBe('text/event-stream');
    // role chunk + 2 content chunks + finish chunk + [DONE]
    expect(res._writes.length).toBe(5);
    expect(res._writes[0]).toContain('"role":"assistant"');
    expect(res._writes[1]).toContain('"content":"Hi"');
    expect(res._writes[2]).toContain('"content":"!"');
    expect(res._writes[3]).toContain('"finish_reason":"stop"');
    expect(res._writes[3]).toContain('"total_tokens":4');
    expect(res._writes[4]).toBe('data: [DONE]\n\n');
    expect(res._ended).toBe(true);
  });

  it('returns a truthful JSON error (no 200) when a stream produces no deltas', async () => {
    const deps: InferenceOpenAiCompatDeps = {
      routing: {
        complete: async () => ({ routed: false, tier: 'none', model: 'm', content: null, reason: 'gateway unconfigured' }),
        completeStream: async () => ({ routed: false, tier: 'none', model: 'm', content: null, reason: 'gateway unconfigured', streamed: false, tokenGranular: false }),
      },
      idFactory: IDS,
      now: NOW,
    };
    const res = fakeRes();
    await handleChatCompletion(deps, reqOf({ model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] }), res);
    expect(res._status).toBe(503); // never a 200 over a failure
    expect(res._writes.length).toBe(0);
    expect(res._json).toMatchObject({ error: { type: 'gateway_error' } });
  });

  it('maps a pre-stream quota refusal to a truthful 429 (no fabricated stream)', async () => {
    const deps: InferenceOpenAiCompatDeps = {
      routing: {
        complete: async () => ({ routed: false, tier: 'none', model: 'm', content: null, reason: 'token quota exhausted', denied: 'quota' }),
        completeStream: async () => ({ routed: false, tier: 'none', model: 'm', content: null, reason: 'token quota exhausted', denied: 'quota', streamed: false, tokenGranular: false }),
      },
      idFactory: IDS,
      now: NOW,
    };
    const res = fakeRes();
    await handleChatCompletion(deps, reqOf({ model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] }), res);
    expect(res._status).toBe(429);
    expect(res._writes.length).toBe(0);
    expect(res._json).toMatchObject({ error: { type: 'insufficient_quota' } });
  });
});
