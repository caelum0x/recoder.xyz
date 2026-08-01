/**
 * `createTensorzeroGatewayClient` — the degrade-safe BYOK LLM gateway skin.
 *
 * Locks the mandated invariants: (1) DEGRADE-TRUTHFUL when no endpoint is
 * configured — every method resolves `{ configured:false, routed:false, ... }`
 * with a truthful reason, NEVER throws, NEVER fakes success (so callers fall back
 * to a direct provider); (2) a configured-but-failing call resolves
 * `{ configured:true, routed:false, reason }` — again never throwing; (3) the
 * optional bearer key travels ONLY on the wire (`Authorization` header) and is
 * NEVER surfaced by `health()` or embedded in any result; (4) endpoint
 * resolution precedence + trailing-slash trim; (5) OpenAI-compatible body
 * parsing (content/usage/embeddings).
 *
 * Pure unit: a fake `FetchLike` is injected + an explicit empty env, so no
 * network, subprocess, or process.env dependency.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createTensorzeroGatewayClient,
  resolveGatewayEndpoint,
  TENSORZERO_URL_ENV,
  TENSORZERO_GATEWAY_URL_ENV,
  TENSORZERO_GATEWAY_API_KEY_ENV,
  type FetchLike,
} from './llm-gateway-client.js';

/** A fetch double that records calls and replays a scripted response body. */
function fakeFetch(
  script: {
    ok?: boolean;
    status?: number;
    body?: unknown;
    throws?: Error;
  } = {},
): { fetch: FetchLike; calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> } {
  const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (script.throws) throw script.throws;
    return {
      ok: script.ok ?? true,
      status: script.status ?? 200,
      text: async () => (script.body === undefined ? '' : JSON.stringify(script.body)),
    };
  };
  return { fetch, calls };
}

const COMPLETION_BODY = {
  choices: [{ message: { role: 'assistant', content: 'hello from gateway' } }],
  usage: { prompt_tokens: 11, completion_tokens: 4 },
};

describe('resolveGatewayEndpoint', () => {
  it('prefers the explicit endpoint over env, trimming trailing slashes', () => {
    const env = { [TENSORZERO_URL_ENV]: 'http://env-url:3778' };
    expect(resolveGatewayEndpoint(env, 'http://explicit:9000///')).toBe('http://explicit:9000');
  });

  it('falls back to TENSORZERO_URL, then TENSORZERO_GATEWAY_URL', () => {
    expect(resolveGatewayEndpoint({ [TENSORZERO_URL_ENV]: 'http://primary:1' })).toBe('http://primary:1');
    expect(resolveGatewayEndpoint({ [TENSORZERO_GATEWAY_URL_ENV]: 'http://alt:2' })).toBe('http://alt:2');
    // Primary wins when BOTH are set.
    expect(
      resolveGatewayEndpoint({
        [TENSORZERO_URL_ENV]: 'http://primary:1',
        [TENSORZERO_GATEWAY_URL_ENV]: 'http://alt:2',
      }),
    ).toBe('http://primary:1');
  });

  it('returns null when nothing is configured (whitespace-only is unconfigured)', () => {
    expect(resolveGatewayEndpoint({})).toBeNull();
    expect(resolveGatewayEndpoint({ [TENSORZERO_URL_ENV]: '   ' })).toBeNull();
  });
});

describe('gateway client — DEGRADE-TRUTHFUL when unconfigured', () => {
  // Empty env + no explicit endpoint => the gateway is NOT configured.
  const client = () => createTensorzeroGatewayClient({ env: {}, fetch: fakeFetch().fetch });

  it('reports unconfigured synchronously without leaking a key', () => {
    const c = client();
    expect(c.isConfigured()).toBe(false);
    expect(c.endpoint()).toBeNull();
  });

  it('complete() resolves a truthful not-configured result (never throws, never fakes)', async () => {
    const result = await client().complete({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
    expect(result).toMatchObject({ configured: false, routed: false, content: null });
    expect(result.reason).toContain('not configured');
    expect(result.reason).toContain(TENSORZERO_URL_ENV);
  });

  it('embed() resolves a truthful not-configured result', async () => {
    const result = await client().embed({ model: 'text-embedding-3-small', input: 'hi' });
    expect(result).toMatchObject({ configured: false, routed: false, embeddings: null });
    expect(result.reason).toContain('not configured');
  });

  it('health() reports only { configured:false, endpoint:null } + a reason — no key', async () => {
    const health = await client().health();
    expect(health).toMatchObject({ configured: false, endpoint: null });
    expect(health.reachable).toBeUndefined();
    expect(health.reason).toBeTruthy();
  });

  it('the unconfigured path never issues a network call', async () => {
    const { fetch, calls } = fakeFetch();
    const c = createTensorzeroGatewayClient({ env: {}, fetch });
    await c.complete({ model: 'm', messages: [] });
    await c.embed({ model: 'm', input: 'x' });
    await c.health();
    expect(calls).toHaveLength(0);
  });
});

describe('gateway client — configured complete()', () => {
  it('routes a real completion and parses content + usage', async () => {
    const { fetch, calls } = fakeFetch({ body: COMPLETION_BODY });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const result = await c.complete({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.2,
      maxTokens: 128,
    });
    expect(result).toMatchObject({ configured: true, routed: true, content: 'hello from gateway' });
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 4 });
    // Body carries the OpenAI-compatible shape + optional params mapped to snake_case.
    const sent = JSON.parse(calls[0]!.init!.body as string);
    expect(sent).toMatchObject({ model: 'openai/gpt-4o-mini', temperature: 0.2, max_tokens: 128 });
    expect(calls[0]!.url).toBe('http://gw:3778/openai/v1/chat/completions');
  });

  it('resolves not-routed (never throws) when the fetch rejects', async () => {
    const { fetch } = fakeFetch({ throws: new Error('ECONNREFUSED') });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const result = await c.complete({ model: 'm', messages: [] });
    expect(result).toMatchObject({ configured: true, routed: false, content: null });
    expect(result.reason).toContain('gateway completion failed');
    expect(result.reason).toContain('ECONNREFUSED');
  });

  it('resolves not-routed with the upstream error message on a non-2xx', async () => {
    const { fetch } = fakeFetch({ ok: false, status: 429, body: { error: { message: 'rate limited' } } });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const result = await c.complete({ model: 'm', messages: [] });
    expect(result.routed).toBe(false);
    expect(result.reason).toContain('rate limited');
  });

  it('falls back to the HTTP status when a non-2xx has no error body', async () => {
    const { fetch } = fakeFetch({ ok: false, status: 503, body: {} });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const result = await c.complete({ model: 'm', messages: [] });
    expect(result.routed).toBe(false);
    expect(result.reason).toContain('HTTP 503');
  });

  it('declines truthfully when the gateway returns no completion content', async () => {
    const { fetch } = fakeFetch({ body: { choices: [] } });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const result = await c.complete({ model: 'm', messages: [] });
    expect(result).toMatchObject({ configured: true, routed: false, content: null });
    expect(result.reason).toContain('no completion content');
  });
});

describe('gateway client — configured embed()', () => {
  it('routes embeddings and reports input-token usage only', async () => {
    const { fetch } = fakeFetch({
      body: { data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { prompt_tokens: 7 } },
    });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const result = await c.embed({ model: 'text-embedding-3-small', input: 'hi' });
    expect(result).toMatchObject({ configured: true, routed: true, embeddings: [[0.1, 0.2, 0.3]] });
    expect(result.usage).toEqual({ inputTokens: 7 });
  });

  it('declines truthfully when the embeddings body is malformed', async () => {
    const { fetch } = fakeFetch({ body: { data: [{ embedding: ['not-a-number'] }] } });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const result = await c.embed({ model: 'm', input: 'x' });
    expect(result).toMatchObject({ configured: true, routed: false, embeddings: null });
    expect(result.reason).toContain('no embedding data');
  });
});

describe('gateway client — AUTH posture: the key travels only on the wire', () => {
  it('sends the bearer key as an Authorization header but never surfaces it in results', async () => {
    const { fetch, calls } = fakeFetch({ body: COMPLETION_BODY });
    const c = createTensorzeroGatewayClient({
      endpoint: 'http://gw:3778',
      apiKey: 'super-secret-token',
      env: {},
      fetch,
    });
    const result = await c.complete({ model: 'm', messages: [] });

    // On the wire: Authorization: Bearer <key>.
    expect(calls[0]!.init!.headers!.Authorization).toBe('Bearer super-secret-token');
    // Never surfaced in the returned result.
    expect(JSON.stringify(result)).not.toContain('super-secret-token');
  });

  it('health() returns only { configured, endpoint } — no key, even with reachability', async () => {
    const { fetch } = fakeFetch({ ok: true, status: 200 });
    const c = createTensorzeroGatewayClient({
      endpoint: 'http://gw:3778',
      apiKey: 'super-secret-token',
      env: {},
      fetch,
    });
    const health = await c.health();
    expect(health).toMatchObject({ configured: true, endpoint: 'http://gw:3778', reachable: true });
    expect(JSON.stringify(health)).not.toContain('super-secret-token');
  });

  it('resolves the key from env when not passed explicitly, still only on the wire', async () => {
    const { fetch, calls } = fakeFetch({ body: COMPLETION_BODY });
    const c = createTensorzeroGatewayClient({
      endpoint: 'http://gw:3778',
      env: { [TENSORZERO_GATEWAY_API_KEY_ENV]: 'env-token' },
      fetch,
    });
    await c.complete({ model: 'm', messages: [] });
    expect(calls[0]!.init!.headers!.Authorization).toBe('Bearer env-token');
  });

  it('omits the Authorization header entirely when no key is configured', async () => {
    const { fetch, calls } = fakeFetch({ body: COMPLETION_BODY });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    await c.complete({ model: 'm', messages: [] });
    expect(calls[0]!.init!.headers!.Authorization).toBeUndefined();
  });
});

describe('gateway client — configured health() reachability', () => {
  it('reports reachable:false with the HTTP status when the probe is non-2xx', async () => {
    const { fetch } = fakeFetch({ ok: false, status: 500 });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const health = await c.health();
    expect(health).toMatchObject({ configured: true, endpoint: 'http://gw:3778', reachable: false });
    expect(health.reason).toContain('HTTP 500');
  });

  it('reports reachable:false (never throws) when the probe rejects', async () => {
    const { fetch } = fakeFetch({ throws: new Error('network down') });
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch });
    const health = await c.health();
    expect(health).toMatchObject({ configured: true, reachable: false });
    expect(health.reason).toContain('network down');
  });

  it('probes GET /health on the configured endpoint', async () => {
    const probe = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    const c = createTensorzeroGatewayClient({ endpoint: 'http://gw:3778', env: {}, fetch: probe as unknown as FetchLike });
    await c.health();
    expect(probe).toHaveBeenCalledWith('http://gw:3778/health', expect.objectContaining({ method: 'GET' }));
  });
});

describe('gateway client — health() bounded retry (IDEMPOTENT GET only)', () => {
  it('retries a rejecting probe up to the bounded attempts, then degrades truthfully (never throws)', async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      throw new Error('network down');
    };
    const c = createTensorzeroGatewayClient({
      endpoint: 'http://gw:3778',
      env: {},
      fetch,
      healthRetry: { maxAttempts: 3, sleep, random: () => 0.5 },
    });

    const health = await c.health();
    expect(calls).toBe(3); // bounded retry: exactly 3 attempts
    expect(sleeps).toHaveLength(2); // slept BETWEEN attempts only, never after the last
    expect(health).toMatchObject({ configured: true, reachable: false });
    expect(health.reason).toContain('network down');
  });

  it('does not retry a healthy probe (single GET, no sleep)', async () => {
    let calls = 0;
    const sleep = vi.fn(async () => {});
    const fetch: FetchLike = async () => {
      calls += 1;
      return { ok: true, status: 200, text: async () => '' };
    };
    const c = createTensorzeroGatewayClient({
      endpoint: 'http://gw:3778',
      env: {},
      fetch,
      healthRetry: { maxAttempts: 3, sleep },
    });

    const health = await c.health();
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(health).toMatchObject({ configured: true, reachable: true });
  });

  it('retries a non-2xx probe then surfaces the HTTP status truthfully', async () => {
    const sleep = async (): Promise<void> => {};
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      return { ok: false, status: 503, text: async () => '' };
    };
    const c = createTensorzeroGatewayClient({
      endpoint: 'http://gw:3778',
      env: {},
      fetch,
      healthRetry: { maxAttempts: 2, sleep, random: () => 0 },
    });

    const health = await c.health();
    expect(calls).toBe(2);
    expect(health).toMatchObject({ configured: true, reachable: false });
    expect(health.reason).toContain('HTTP 503');
  });

  it('never retries the non-idempotent complete() POST (single call on failure)', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      return { ok: false, status: 500, text: async () => JSON.stringify({ error: { message: 'boom' } }) };
    };
    const c = createTensorzeroGatewayClient({
      endpoint: 'http://gw:3778',
      env: {},
      fetch,
      healthRetry: { maxAttempts: 5, sleep: async () => {} },
    });

    const result = await c.complete({ model: 'm', messages: [] });
    expect(calls).toBe(1); // the completion POST is NEVER retried
    expect(result.routed).toBe(false);
  });
});
