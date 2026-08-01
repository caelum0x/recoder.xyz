/**
 * `direct-provider.transport` (rung 3) — verifies the direct BYOK
 * multi-provider router: per-wire request mapping (OpenAI / Anthropic native /
 * Google), BYOK-before-platform key precedence, truthful declines (missing key,
 * unsupported provider, provider error) with NO silent reroute, and the
 * redaction law (key material never appears in reasons).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import { CircuitBreaker } from '../../../shared/outbound-resilience.js';
import type { ByokKeyResolver } from '../ports/byok-resolver.port.js';
import type { InferenceRequest } from '../types.js';
import {
  createDirectProviderTransport,
  redactSecret,
  type ProviderFetchLike,
} from './direct-provider.transport.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

const KEY = 'sk-byok-super-secret-123';

function fakeResolver(key: string | null, enabled = true): ByokKeyResolver & { markUsed: ReturnType<typeof vi.fn> } {
  return {
    enabled: () => enabled,
    resolve: vi.fn(async () => key),
    store: vi.fn(async () => ({ stored: false as const, reason: 'unused' })),
    remove: vi.fn(async () => false),
    markUsed: vi.fn(),
  };
}

interface Captured {
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function fetchReturning(json: unknown, status = 200): { fetch: ProviderFetchLike; captured: Captured } {
  const captured: Captured = {};
  const fetch: ProviderFetchLike = async (url, init) => {
    captured.url = url;
    captured.headers = init.headers;
    captured.body = JSON.parse(init.body);
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json) };
  };
  return { fetch, captured };
}

const REQ: InferenceRequest = {
  model: 'openai/gpt-4o-mini',
  messages: [
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'hi' },
  ],
  temperature: 0.2,
  maxTokens: 64,
  userId: 'u1',
};

describe('rung-3 direct router — OpenAI wire', () => {
  it('routes with the resolved BYOK bearer key and maps the response + usage', async () => {
    const resolver = fakeResolver(KEY);
    const { fetch, captured } = fetchReturning({
      id: 'chatcmpl-1',
      choices: [{ message: { role: 'assistant', content: 'hello' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const router = createDirectProviderTransport({ logger: log, resolver, fetch });

    const result = await router.complete(REQ);

    expect(result).toMatchObject({
      routed: true,
      tier: 'router',
      model: 'openai/gpt-4o-mini',
      content: 'hello',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      inferenceId: 'chatcmpl-1',
    });
    expect(captured.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(captured.headers?.authorization).toBe(`Bearer ${KEY}`);
    expect(captured.body).toMatchObject({ model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 64 });
    expect(resolver.markUsed).toHaveBeenCalledWith('u1', 'openai'); // BYOK audit stamp
  });

  it('falls back to the platform key when no BYOK key resolves (no markUsed)', async () => {
    const resolver = fakeResolver(null);
    const { fetch, captured } = fetchReturning({ choices: [{ message: { content: 'ok' } }] });
    const router = createDirectProviderTransport({
      logger: log,
      resolver,
      platformKeys: { openai: 'pk-platform' },
      fetch,
    });

    const result = await router.complete(REQ);
    expect(result.routed).toBe(true);
    expect(captured.headers?.authorization).toBe('Bearer pk-platform');
    expect(resolver.markUsed).not.toHaveBeenCalled();
  });
});

describe('rung-3 direct router — Anthropic native wire', () => {
  it('routes /v1/messages with x-api-key, extracted system, and text-block content', async () => {
    const resolver = fakeResolver(KEY);
    const { fetch, captured } = fetchReturning({
      id: 'msg-1',
      content: [{ type: 'text', text: 'hi ' }, { type: 'text', text: 'there' }],
      usage: { input_tokens: 7, output_tokens: 3 },
    });
    const router = createDirectProviderTransport({ logger: log, resolver, fetch });

    const result = await router.complete({ ...REQ, model: 'anthropic/claude-sonnet-4-5' });

    expect(result).toMatchObject({
      routed: true,
      tier: 'router',
      content: 'hi there',
      usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
    });
    expect(captured.url).toBe('https://api.anthropic.com/v1/messages');
    expect(captured.headers?.['x-api-key']).toBe(KEY);
    expect(captured.body).toMatchObject({
      model: 'claude-sonnet-4-5',
      system: 'be brief',
      max_tokens: 64,
      messages: [{ role: 'user', content: 'hi' }],
    });
  });
});

describe('rung-3 direct router — Google wire', () => {
  it('routes generateContent with x-goog-api-key and joins candidate parts', async () => {
    const resolver = fakeResolver(KEY);
    const { fetch, captured } = fetchReturning({
      candidates: [{ content: { parts: [{ text: 'gemini says hi' }] } }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
    });
    const router = createDirectProviderTransport({ logger: log, resolver, fetch });

    const result = await router.complete({ ...REQ, model: 'google/gemini-2.0-flash' });

    expect(result).toMatchObject({
      routed: true,
      tier: 'router',
      content: 'gemini says hi',
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
    });
    expect(captured.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    );
    expect(captured.headers?.['x-goog-api-key']).toBe(KEY);
  });
});

describe('rung-3 direct router — truthful declines', () => {
  it('declines with a truthful reason when no key is available (no silent reroute)', async () => {
    const resolver = fakeResolver(null);
    const fetchSpy = vi.fn();
    const router = createDirectProviderTransport({
      logger: log,
      resolver,
      fetch: fetchSpy as unknown as ProviderFetchLike,
    });

    const result = await router.complete(REQ);
    expect(result.routed).toBe(false);
    expect(result.tier).toBe('none');
    expect(result.reason).toContain('no openai API key available');
    expect(fetchSpy).not.toHaveBeenCalled(); // no call without a key
  });

  it('declines an unsupported provider and a prefixless model id', async () => {
    const router = createDirectProviderTransport({ logger: log, resolver: fakeResolver(KEY), fetch: vi.fn() as unknown as ProviderFetchLike });
    expect((await router.complete({ ...REQ, model: 'mystery/model-x' })).reason).toContain("'mystery' is not supported");
    expect((await router.complete({ ...REQ, model: 'noprefix' })).reason).toContain('no provider prefix');
  });

  it('declines a provider error with status only — never the body, never the key', async () => {
    const { fetch } = fetchReturning({ error: { message: `invalid key ${KEY}` } }, 401);
    const router = createDirectProviderTransport({ logger: log, resolver: fakeResolver(KEY), fetch });

    const result = await router.complete(REQ);
    expect(result.routed).toBe(false);
    expect(result.reason).toBe('direct openai call failed (status 401)');
    expect(result.reason).not.toContain(KEY); // redaction law
  });

  it('redacts the key when a transport error message echoes it', async () => {
    const fetch: ProviderFetchLike = async () => {
      throw new Error(`connect failed sending ${KEY} to upstream`);
    };
    const router = createDirectProviderTransport({ logger: log, resolver: fakeResolver(KEY), fetch });

    const result = await router.complete(REQ);
    expect(result.routed).toBe(false);
    expect(result.reason).toContain('[redacted]');
    expect(result.reason).not.toContain(KEY);
  });

  it('declines a malformed provider response truthfully', async () => {
    const { fetch } = fetchReturning({ unexpected: true });
    const router = createDirectProviderTransport({ logger: log, resolver: fakeResolver(KEY), fetch });
    const result = await router.complete(REQ);
    expect(result.routed).toBe(false);
    expect(result.reason).toContain('malformed response');
  });

  it('available() reflects the wired key sources truthfully', () => {
    const none = createDirectProviderTransport({ logger: log, resolver: fakeResolver(null, false) });
    expect(none.available()).toBe(false);
    const viaPlatform = createDirectProviderTransport({
      logger: log,
      resolver: fakeResolver(null, false),
      platformKeys: { openai: 'pk' },
    });
    expect(viaPlatform.available()).toBe(true);
    const viaByok = createDirectProviderTransport({ logger: log, resolver: fakeResolver(null, true) });
    expect(viaByok.available()).toBe(true);
  });
});

describe('rung-3 direct router — per-provider circuit breaker', () => {
  /** A fetch double that counts calls and serves a scripted status per URL. */
  function countingFetch(
    respond: (url: string) => { ok: boolean; status: number; body: unknown },
  ): { fetch: ProviderFetchLike; calls: () => number } {
    let calls = 0;
    const fetch: ProviderFetchLike = async (url) => {
      calls += 1;
      const r = respond(url);
      return { ok: r.ok, status: r.status, text: async () => JSON.stringify(r.body) };
    };
    return { fetch, calls: () => calls };
  }

  const OK_OPENAI = { ok: true, status: 200, body: { choices: [{ message: { content: 'ok' } }] } };
  const FAIL_500 = { ok: false, status: 500, body: {} };

  it('opens a provider circuit after the failure threshold, then fast-fails truthfully with NO further fetch', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000, now: () => now });
    const { fetch, calls } = countingFetch(() => FAIL_500);
    const router = createDirectProviderTransport({ logger: log, resolver: fakeResolver(KEY), fetch, breaker });

    const r1 = await router.complete(REQ);
    const r2 = await router.complete(REQ);
    expect(r1.routed).toBe(false);
    expect(r2.routed).toBe(false);
    // The non-idempotent POST is called EXACTLY ONCE per attempt — never retried.
    expect(calls()).toBe(2);

    // Circuit now OPEN: the next call fast-fails truthfully with no network call.
    const r3 = await router.complete(REQ);
    expect(r3.routed).toBe(false);
    expect(r3.tier).toBe('none');
    expect(r3.reason).toContain('circuit open');
    expect(calls()).toBe(2); // no additional egress while the circuit is open
  });

  it('isolates circuits per provider — a tripped provider never blocks a healthy one', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: () => now });
    const { fetch } = countingFetch((url) => (url.includes('openai') ? FAIL_500 : OK_OPENAI));
    const router = createDirectProviderTransport({ logger: log, resolver: fakeResolver(KEY), fetch, breaker });

    // Trip openai (threshold 1) — its circuit opens after the first failure.
    await router.complete(REQ);
    const openaiAgain = await router.complete(REQ);
    expect(openaiAgain.reason).toContain('circuit open');

    // openrouter (a different provider key, openai wire) is unaffected and routes.
    const other = await router.complete({ ...REQ, model: 'openrouter/some-model' });
    expect(other.routed).toBe(true);
  });

  it('recovers via a half-open probe after the cooldown and closes on success', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: () => now });
    let mode: 'fail' | 'ok' = 'fail';
    const { fetch } = countingFetch(() => (mode === 'fail' ? FAIL_500 : OK_OPENAI));
    const router = createDirectProviderTransport({ logger: log, resolver: fakeResolver(KEY), fetch, breaker });

    await router.complete(REQ); // fails → opens (threshold 1)
    expect((await router.complete(REQ)).reason).toContain('circuit open');

    now += 1_000; // cooldown elapsed → half-open probe permitted
    mode = 'ok';
    const probe = await router.complete(REQ);
    expect(probe.routed).toBe(true); // probe succeeds → circuit closes
    const after = await router.complete(REQ);
    expect(after.routed).toBe(true); // fully closed → normal routing resumes
  });

  it('a thrown transport error also feeds the breaker (opens after threshold)', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: () => now });
    const fetch: ProviderFetchLike = async () => {
      throw new Error('ECONNRESET');
    };
    const router = createDirectProviderTransport({ logger: log, resolver: fakeResolver(KEY), fetch, breaker });

    expect((await router.complete(REQ)).reason).toContain('errored');
    const open = await router.complete(REQ);
    expect(open.reason).toContain('circuit open');
  });
});

describe('redactSecret', () => {
  it('replaces every occurrence and tolerates a null secret', () => {
    expect(redactSecret(`a ${KEY} b ${KEY}`, KEY)).toBe('a [redacted] b [redacted]');
    expect(redactSecret('unchanged', null)).toBe('unchanged');
  });
});
