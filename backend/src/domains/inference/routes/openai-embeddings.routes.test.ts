/**
 * `openai-embeddings.routes` — verifies the OpenAI embeddings wire mapping over
 * the gateway embed seam: a routed call returns the OpenAI `list` body with
 * truthful usage, a degraded ladder returns an honest 503/502 error (never a
 * 200 over a failure, never fabricated vectors), and boundary input validation
 * rejects malformed requests with a 400 before touching the routing service.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  handleEmbeddings,
  parseEmbeddingInput,
  type InferenceEmbeddingsDeps,
} from './openai-embeddings.routes.js';
import type { EmbeddingResult } from '../types.js';

interface CapturedRes {
  _status: number;
  _json: unknown;
}

/** A fake express Response capturing status + json. */
function fakeRes(): Response & CapturedRes {
  const res: Partial<Response> & CapturedRes = {
    _status: 0,
    _json: undefined,
    status(code: number) {
      res._status = code;
      return res as Response;
    },
    json(body: unknown) {
      res._json = body;
      return res as Response;
    },
  };
  return res as Response & CapturedRes;
}

function reqOf(body: unknown): Request {
  return { body, principal: { userId: 'u1' } } as unknown as Request;
}

function depsOf(result: EmbeddingResult): InferenceEmbeddingsDeps & { embed: ReturnType<typeof vi.fn> } {
  const embed = vi.fn(async () => result);
  return { routing: { embed }, embed };
}

const ROUTED: EmbeddingResult = {
  routed: true,
  tier: 'loopback',
  model: 'text-embedding-3-small',
  embeddings: [
    [0.1, 0.2],
    [0.3, 0.4],
  ],
  usage: { inputTokens: 7 },
};

describe('parseEmbeddingInput', () => {
  it('accepts a non-empty string and a non-empty string array', () => {
    expect(parseEmbeddingInput('hello')).toBe('hello');
    expect(parseEmbeddingInput(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('rejects empty/whitespace strings, empty arrays, and non-string elements', () => {
    expect(parseEmbeddingInput('')).toBeNull();
    expect(parseEmbeddingInput('   ')).toBeNull();
    expect(parseEmbeddingInput([])).toBeNull();
    expect(parseEmbeddingInput(['a', ''])).toBeNull();
    expect(parseEmbeddingInput(['a', 42])).toBeNull();
    expect(parseEmbeddingInput(undefined)).toBeNull();
    expect(parseEmbeddingInput({ text: 'a' })).toBeNull();
  });
});

describe('handleEmbeddings (happy path)', () => {
  it('returns an OpenAI list body with indexed vectors + truthful usage', async () => {
    const deps = depsOf(ROUTED);
    const res = fakeRes();
    await handleEmbeddings(deps, reqOf({ model: 'text-embedding-3-small', input: ['a', 'b'] }), res);
    expect(res._status).toBe(200);
    expect(res._json).toEqual({
      object: 'list',
      data: [
        { object: 'embedding', index: 0, embedding: [0.1, 0.2] },
        { object: 'embedding', index: 1, embedding: [0.3, 0.4] },
      ],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 7, total_tokens: 7 },
    });
    expect(deps.embed).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['a', 'b'],
      userId: 'u1',
    });
  });

  it('omits usage (never fabricates zeros) when the gateway reported none', async () => {
    const deps = depsOf({ ...ROUTED, usage: undefined } as unknown as EmbeddingResult);
    const res = fakeRes();
    await handleEmbeddings(deps, reqOf({ model: 'm', input: 'hi' }), res);
    expect(res._status).toBe(200);
    expect(res._json).not.toHaveProperty('usage');
  });
});

describe('handleEmbeddings (truthful degrade)', () => {
  it('maps an unconfigured ladder to a 503 gateway_error with the real reason', async () => {
    const deps = depsOf({
      routed: false,
      tier: 'none',
      model: 'm',
      embeddings: null,
      reason: 'LLM gateway not configured — set TENSORZERO_URL to route embeddings (falling back to direct provider)',
    });
    const res = fakeRes();
    await handleEmbeddings(deps, reqOf({ model: 'm', input: 'hi' }), res);
    expect(res._status).toBe(503);
    expect(res._json).toMatchObject({
      error: { type: 'gateway_error', message: expect.stringContaining('not configured') },
    });
  });

  it('maps an upstream fault to a 502 (never a 200 over a failure)', async () => {
    const deps = depsOf({
      routed: false,
      tier: 'loopback',
      model: 'm',
      embeddings: null,
      reason: 'gateway embedding failed: boom',
    });
    const res = fakeRes();
    await handleEmbeddings(deps, reqOf({ model: 'm', input: 'hi' }), res);
    expect(res._status).toBe(502);
    expect(res._json).toMatchObject({ error: { type: 'gateway_error', message: 'gateway embedding failed: boom' } });
  });

  it('treats routed:true with null embeddings as a degrade, not a success', async () => {
    const deps = depsOf({ routed: true, tier: 'loopback', model: 'm', embeddings: null });
    const res = fakeRes();
    await handleEmbeddings(deps, reqOf({ model: 'm', input: 'hi' }), res);
    expect(res._status).toBe(502);
    expect(res._json).toMatchObject({ error: { type: 'gateway_error' } });
  });
});

describe('handleEmbeddings (input validation)', () => {
  it('rejects a missing model with a 400 and never calls the service', async () => {
    const deps = depsOf(ROUTED);
    const res = fakeRes();
    await handleEmbeddings(deps, reqOf({ input: 'hi' }), res);
    expect(res._status).toBe(400);
    expect(res._json).toMatchObject({ error: { type: 'invalid_request_error' } });
    expect(deps.embed).not.toHaveBeenCalled();
  });

  it('rejects a missing/empty/malformed input with a 400', async () => {
    for (const input of [undefined, '', [], ['ok', 3]]) {
      const deps = depsOf(ROUTED);
      const res = fakeRes();
      await handleEmbeddings(deps, reqOf({ model: 'm', input }), res);
      expect(res._status).toBe(400);
      expect(deps.embed).not.toHaveBeenCalled();
    }
  });

  it('refuses encoding_format base64 truthfully instead of returning floats', async () => {
    const deps = depsOf(ROUTED);
    const res = fakeRes();
    await handleEmbeddings(deps, reqOf({ model: 'm', input: 'hi', encoding_format: 'base64' }), res);
    expect(res._status).toBe(400);
    expect(res._json).toMatchObject({ error: { message: expect.stringContaining('float') } });
    expect(deps.embed).not.toHaveBeenCalled();
  });
});
