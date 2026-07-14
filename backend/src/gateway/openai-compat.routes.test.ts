/**
 * Unit tests for the OpenAI wire-compatible gateway surface (RECODER-ENGINES E15).
 *
 * Exercises the pure `handleChatCompletion` mapping against a FAKE gateway
 * client (no network) plus a fake Express `res`:
 *   1. mapping  — OpenAI request → client.complete(...) call shape → OpenAI body.
 *   2. degrade  — not_configured => truthful 503, never a fabricated completion.
 *   3. validate — missing messages / model => 400.
 *   4. stream   — stream:true => valid chat.completion.chunk SSE (buffered v1),
 *      with pre-stream failures staying plain JSON (no SSE bytes written).
 */
import { describe, it, expect, vi } from 'vitest';

import {
  handleChatCompletion,
  parseOpenAiMessages,
  formatSseChunk,
  type OpenAiCompatDeps,
} from './openai-compat.routes.js';
import type {
  LlmGatewayPort,
  GatewayCompletionResult,
  GatewayCompletionRequest,
} from './tensorzero-client.js';

/** Minimal fake Express res capturing status, json payload, headers, and SSE writes. */
function fakeRes() {
  const state: {
    status: number;
    body: unknown;
    headers: Record<string, string>;
    writes: string[];
    flushed: boolean;
    ended: boolean;
  } = { status: 200, body: undefined, headers: {}, writes: [], flushed: false, ended: false };
  const res = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      state.headers = { ...state.headers, [name]: value };
      return res;
    },
    flushHeaders() {
      state.flushed = true;
    },
    write(chunk: string) {
      state.writes = [...state.writes, chunk];
      return true;
    },
    end() {
      state.ended = true;
    },
  };
  return { res: res as unknown as import('express').Response, state };
}

/** Parse the JSON payloads out of captured `data:` SSE writes (excludes [DONE]). */
function parseSseWrites(writes: string[]): unknown[] {
  return writes
    .filter((w) => w.startsWith('data: ') && !w.startsWith('data: [DONE]'))
    .map((w) => JSON.parse(w.slice('data: '.length)));
}

/** Build a fake gateway client whose complete() returns a fixed result + records the call. */
function fakeClient(result: GatewayCompletionResult) {
  const complete = vi.fn(async (_req: GatewayCompletionRequest) => result);
  const client: LlmGatewayPort = {
    complete,
    embed: vi.fn(async () => ({ configured: false, routed: false, embeddings: null })),
    health: vi.fn(async () => ({ configured: false, endpoint: null })),
    isConfigured: () => false,
    endpoint: () => null,
  };
  return { client, complete };
}

const ROUTED: GatewayCompletionResult = {
  configured: true,
  routed: true,
  content: 'hello from the gateway',
  usage: { inputTokens: 11, outputTokens: 4 },
};

describe('parseOpenAiMessages', () => {
  it('returns null for empty / non-array / bad-role input', () => {
    expect(parseOpenAiMessages(undefined)).toBeNull();
    expect(parseOpenAiMessages([])).toBeNull();
    expect(parseOpenAiMessages([{ role: 'nope', content: 'x' }])).toBeNull();
    expect(parseOpenAiMessages([{ role: 'user' }])).toBeNull();
  });

  it('maps roles (developer→system) and flattens content-part arrays', () => {
    const out = parseOpenAiMessages([
      { role: 'developer', content: 'be terse' },
      { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    ]);
    expect(out).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'a\nb' },
    ]);
  });
});

describe('handleChatCompletion — mapping (fake client)', () => {
  it('maps an OpenAI request onto client.complete and returns an OpenAI body', async () => {
    const { client, complete } = fakeClient(ROUTED);
    const deps: OpenAiCompatDeps = {
      client,
      idFactory: () => 'chatcmpl-test',
      now: () => 1_700_000_000,
    };
    const { res, state } = fakeRes();

    await handleChatCompletion(deps, {
      body: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.3,
        max_tokens: 128,
      },
    } as import('express').Request, res);

    // client.complete received the mapped shape (max_tokens → maxTokens).
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toEqual({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.3,
      maxTokens: 128,
    });

    // Response is OpenAI-shaped.
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1_700_000_000,
      model: 'gpt-4o-mini',
      choices: [
        { index: 0, message: { role: 'assistant', content: 'hello from the gateway' }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
    });
  });

  it('omits usage when the gateway reports none', async () => {
    const { client } = fakeClient({ configured: true, routed: true, content: 'ok' });
    const { res, state } = fakeRes();
    await handleChatCompletion({ client }, {
      body: { model: 'm', messages: [{ role: 'user', content: 'x' }] },
    } as import('express').Request, res);
    expect(state.status).toBe(200);
    expect((state.body as { usage?: unknown }).usage).toBeUndefined();
  });
});

describe('handleChatCompletion — degrade-safe (never fabricates)', () => {
  it('not_configured => truthful 503 OpenAI error, no completion', async () => {
    const { client } = fakeClient({
      configured: false,
      routed: false,
      content: null,
      reason: 'LLM gateway not configured — set TENSORZERO_URL',
    });
    const { res, state } = fakeRes();
    await handleChatCompletion({ client }, {
      body: { model: 'm', messages: [{ role: 'user', content: 'x' }] },
    } as import('express').Request, res);

    expect(state.status).toBe(503);
    expect(state.body).toMatchObject({
      error: { type: 'gateway_error', message: 'LLM gateway not configured — set TENSORZERO_URL' },
    });
    // No fabricated choices/content.
    expect((state.body as { choices?: unknown }).choices).toBeUndefined();
  });

  it('configured-but-failed upstream => 502 truthful error', async () => {
    const { client } = fakeClient({
      configured: true,
      routed: false,
      content: null,
      reason: 'gateway completion failed: ECONNREFUSED',
    });
    const { res, state } = fakeRes();
    await handleChatCompletion({ client }, {
      body: { model: 'm', messages: [{ role: 'user', content: 'x' }] },
    } as import('express').Request, res);
    expect(state.status).toBe(502);
    expect((state.body as { error: { message: string } }).error.message).toContain('ECONNREFUSED');
  });
});

describe('handleChatCompletion — validation (400)', () => {
  it('missing messages => 400', async () => {
    const { client, complete } = fakeClient(ROUTED);
    const { res, state } = fakeRes();
    await handleChatCompletion({ client }, {
      body: { model: 'm' },
    } as import('express').Request, res);
    expect(state.status).toBe(400);
    expect((state.body as { error: { message: string } }).error.message).toContain('messages');
    expect(complete).not.toHaveBeenCalled();
  });

  it('missing model => 400', async () => {
    const { client } = fakeClient(ROUTED);
    const { res, state } = fakeRes();
    await handleChatCompletion({ client }, {
      body: { messages: [{ role: 'user', content: 'x' }] },
    } as import('express').Request, res);
    expect(state.status).toBe(400);
    expect((state.body as { error: { message: string } }).error.message).toContain('model');
  });

});

describe('handleChatCompletion — stream:true (buffered single-chunk SSE)', () => {
  const streamDeps = (client: LlmGatewayPort): OpenAiCompatDeps => ({
    client,
    idFactory: () => 'chatcmpl-stream-test',
    now: () => 1_700_000_000,
  });

  it('happy path: SSE headers + role/content/finish chunks + [DONE]', async () => {
    const { client, complete } = fakeClient(ROUTED);
    const { res, state } = fakeRes();

    await handleChatCompletion(streamDeps(client), {
      body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], stream: true },
    } as import('express').Request, res);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(state.status).toBe(200);
    expect(state.headers['Content-Type']).toBe('text/event-stream');
    expect(state.headers['Cache-Control']).toBe('no-cache');
    expect(state.headers['Connection']).toBe('keep-alive');
    expect(state.flushed).toBe(true);
    expect(state.ended).toBe(true);
    // No JSON body — SSE only.
    expect(state.body).toBeUndefined();

    // 4 writes: role chunk, content chunk, finish chunk, [DONE].
    expect(state.writes).toHaveLength(4);
    expect(state.writes[3]).toBe('data: [DONE]\n\n');
    expect(state.writes.every((w) => w.endsWith('\n\n'))).toBe(true);

    const chunks = parseSseWrites(state.writes) as Array<{
      id: string;
      object: string;
      created: number;
      model: string;
      choices: Array<{ index: number; delta: Record<string, unknown>; finish_reason: string | null }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    }>;
    expect(chunks).toHaveLength(3);

    // Consistent envelope across all chunks.
    for (const chunk of chunks) {
      expect(chunk.id).toBe('chatcmpl-stream-test');
      expect(chunk.object).toBe('chat.completion.chunk');
      expect(chunk.created).toBe(1_700_000_000);
      expect(chunk.model).toBe('gpt-4o-mini');
      expect(chunk.choices[0].index).toBe(0);
    }

    // Role → content → finish sequence.
    expect(chunks[0].choices[0]).toMatchObject({ delta: { role: 'assistant' }, finish_reason: null });
    expect(chunks[1].choices[0]).toMatchObject({
      delta: { content: 'hello from the gateway' },
      finish_reason: null,
    });
    expect(chunks[2].choices[0]).toMatchObject({ delta: {}, finish_reason: 'stop' });

    // Usage rides on the finish chunk only, mirroring the non-stream mapping.
    expect(chunks[0].usage).toBeUndefined();
    expect(chunks[1].usage).toBeUndefined();
    expect(chunks[2].usage).toEqual({ prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 });
  });

  it('omits usage on the finish chunk when the gateway reports none', async () => {
    const { client } = fakeClient({ configured: true, routed: true, content: 'ok' });
    const { res, state } = fakeRes();
    await handleChatCompletion(streamDeps(client), {
      body: { model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true },
    } as import('express').Request, res);

    const chunks = parseSseWrites(state.writes) as Array<{ usage?: unknown }>;
    expect(chunks).toHaveLength(3);
    expect(chunks[2].usage).toBeUndefined();
  });

  it('not_configured => plain JSON 503, NO SSE bytes written', async () => {
    const { client } = fakeClient({
      configured: false,
      routed: false,
      content: null,
      reason: 'LLM gateway not configured — set TENSORZERO_URL',
    });
    const { res, state } = fakeRes();
    await handleChatCompletion(streamDeps(client), {
      body: { model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true },
    } as import('express').Request, res);

    expect(state.status).toBe(503);
    expect(state.body).toMatchObject({ error: { type: 'gateway_error' } });
    expect(state.writes).toHaveLength(0);
    expect(state.headers['Content-Type']).toBeUndefined();
  });

  it('upstream failure => plain JSON 502, NO SSE bytes written', async () => {
    const { client } = fakeClient({
      configured: true,
      routed: false,
      content: null,
      reason: 'gateway completion failed: ECONNREFUSED',
    });
    const { res, state } = fakeRes();
    await handleChatCompletion(streamDeps(client), {
      body: { model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true },
    } as import('express').Request, res);

    expect(state.status).toBe(502);
    expect(state.writes).toHaveLength(0);
  });

  it('validation failures still return plain 400 JSON with stream:true', async () => {
    const { client, complete } = fakeClient(ROUTED);
    const { res, state } = fakeRes();
    await handleChatCompletion({ client }, {
      body: { messages: [{ role: 'user', content: 'x' }], stream: true },
    } as import('express').Request, res);

    expect(state.status).toBe(400);
    expect((state.body as { error: { message: string } }).error.message).toContain('model');
    expect(state.writes).toHaveLength(0);
    expect(complete).not.toHaveBeenCalled();
  });

  it('stream:false path is unchanged (non-chunk JSON completion)', async () => {
    const { client } = fakeClient(ROUTED);
    const { res, state } = fakeRes();
    await handleChatCompletion(streamDeps(client), {
      body: { model: 'm', messages: [{ role: 'user', content: 'x' }], stream: false },
    } as import('express').Request, res);

    expect(state.status).toBe(200);
    expect((state.body as { object: string }).object).toBe('chat.completion');
    expect(state.writes).toHaveLength(0);
  });
});

describe('formatSseChunk', () => {
  it('frames a chat.completion.chunk as an SSE data event', () => {
    const line = formatSseChunk(
      { id: 'chatcmpl-x', created: 123, model: 'm' },
      { content: 'hi' },
      null,
    );
    expect(line.startsWith('data: ')).toBe(true);
    expect(line.endsWith('\n\n')).toBe(true);
    expect(JSON.parse(line.slice(6))).toEqual({
      id: 'chatcmpl-x',
      object: 'chat.completion.chunk',
      created: 123,
      model: 'm',
      choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
    });
  });

  it('attaches usage only when provided', () => {
    const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };
    const withUsage = JSON.parse(
      formatSseChunk({ id: 'i', created: 1, model: 'm' }, {}, 'stop', usage).slice(6),
    ) as { usage?: unknown };
    expect(withUsage.usage).toEqual(usage);
  });
});
