/**
 * Unit tests for the OpenAI wire-compatible gateway surface (RECODER-ENGINES E15).
 *
 * Exercises the pure `handleChatCompletion` mapping against a FAKE gateway
 * client (no network) plus a fake Express `res`:
 *   1. mapping  — OpenAI request → client.complete(...) call shape → OpenAI body.
 *   2. degrade  — not_configured => truthful 503, never a fabricated completion.
 *   3. validate — missing messages / model / stream:true => 400.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  handleChatCompletion,
  parseOpenAiMessages,
  type OpenAiCompatDeps,
} from './openai-compat.routes.js';
import type {
  LlmGatewayPort,
  GatewayCompletionResult,
  GatewayCompletionRequest,
} from './tensorzero-client.js';

/** Minimal fake Express res capturing status + json payload. */
function fakeRes() {
  const state: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  };
  return { res: res as unknown as import('express').Response, state };
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

  it('stream:true => truthful 400 (not implemented)', async () => {
    const { client, complete } = fakeClient(ROUTED);
    const { res, state } = fakeRes();
    await handleChatCompletion({ client }, {
      body: { model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true },
    } as import('express').Request, res);
    expect(state.status).toBe(400);
    expect((state.body as { error: { message: string } }).error.message).toContain('streaming not supported');
    expect(complete).not.toHaveBeenCalled();
  });
});
