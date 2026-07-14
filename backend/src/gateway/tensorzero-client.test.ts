/**
 * Unit tests for the BYOK LLM Gateway client (RECODER-ENGINES E15).
 *
 * Covers the three mandatory paths with a fake fetch and no network/subprocess:
 *   1. configured   — complete/embed route through the gateway and parse the
 *                     OpenAI-compatible body.
 *   2. unconfigured — no endpoint => truthful "not configured", fetch untouched.
 *   3. failure      — endpoint set but the call rejects / returns non-2xx =>
 *                     `{ routed: false, reason }`, never throws.
 * Plus: the API key never leaks out of `health()` and only travels on the wire.
 */
import { describe, it, expect, vi, type Mock } from 'vitest';

import {
  createTensorzeroGatewayClient,
  resolveGatewayEndpoint,
  TENSORZERO_URL_ENV,
  TENSORZERO_GATEWAY_URL_ENV,
  type FetchLike,
} from './tensorzero-client.js';

/** Build a fake fetch that returns a fixed JSON body + status. */
function fakeFetch(body: unknown, status = 200): FetchLike {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }));
}

const EMPTY_ENV: NodeJS.ProcessEnv = {};

describe('resolveGatewayEndpoint', () => {
  it('returns null when no env is set', () => {
    expect(resolveGatewayEndpoint(EMPTY_ENV)).toBeNull();
  });

  it('prefers explicit over env and trims trailing slashes', () => {
    const env = { [TENSORZERO_URL_ENV]: 'http://env:3778/' } as NodeJS.ProcessEnv;
    expect(resolveGatewayEndpoint(env, 'http://explicit:9/')).toBe('http://explicit:9');
    expect(resolveGatewayEndpoint(env)).toBe('http://env:3778');
  });

  it('falls back to the alternate gateway url env', () => {
    const env = { [TENSORZERO_GATEWAY_URL_ENV]: 'http://alt:1234' } as NodeJS.ProcessEnv;
    expect(resolveGatewayEndpoint(env)).toBe('http://alt:1234');
  });
});

describe('LLM gateway client — configured', () => {
  const endpoint = 'http://127.0.0.1:3778';

  it('routes a completion and parses OpenAI-compatible content + usage', async () => {
    const fetch = fakeFetch({
      choices: [{ message: { role: 'assistant', content: 'hello world' } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });
    const client = createTensorzeroGatewayClient({ endpoint, fetch, env: EMPTY_ENV });

    const res = await client.complete({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.2,
      maxTokens: 64,
    });

    expect(res).toMatchObject({ configured: true, routed: true, content: 'hello world' });
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 3 });

    // Verify the wire call: correct URL + JSON body with mapped params.
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as Mock).mock.calls[0];
    expect(url).toBe(`${endpoint}/openai/v1/chat/completions`);
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toMatchObject({ model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 64 });
  });

  it('routes an embedding and parses the vectors', async () => {
    const fetch = fakeFetch({
      data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
      usage: { prompt_tokens: 5 },
    });
    const client = createTensorzeroGatewayClient({ endpoint, fetch, env: EMPTY_ENV });

    const res = await client.embed({ model: 'text-embedding-3-small', input: ['a', 'b'] });

    expect(res.configured).toBe(true);
    expect(res.routed).toBe(true);
    expect(res.embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    expect(res.usage).toEqual({ inputTokens: 5 });
  });

  it('reports not-routed when the body has no content/vectors', async () => {
    const client = createTensorzeroGatewayClient({ endpoint, fetch: fakeFetch({}), env: EMPTY_ENV });
    const c = await client.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(c).toMatchObject({ configured: true, routed: false, content: null });

    const e = await createTensorzeroGatewayClient({ endpoint, fetch: fakeFetch({}), env: EMPTY_ENV }).embed({
      model: 'm',
      input: 'x',
    });
    expect(e).toMatchObject({ configured: true, routed: false, embeddings: null });
  });

  it('sends the bearer key on the wire but never surfaces it in health()', async () => {
    const fetch = fakeFetch({ status: 'ok' });
    const client = createTensorzeroGatewayClient({
      endpoint,
      apiKey: 'super-secret-key',
      fetch,
      env: EMPTY_ENV,
    });

    const health = await client.health();
    expect(health).toMatchObject({ configured: true, endpoint, reachable: true });
    // The key must not appear anywhere in the surfaced health payload.
    expect(JSON.stringify(health)).not.toContain('super-secret-key');

    // But it IS sent on the wire as an Authorization header.
    const [, init] = (fetch as unknown as Mock).mock.calls[0];
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      'Bearer super-secret-key',
    );
  });
});

describe('LLM gateway client — unconfigured (degrade-safe)', () => {
  it('complete returns a truthful not-configured result without calling fetch', async () => {
    const fetch = fakeFetch({});
    const client = createTensorzeroGatewayClient({ fetch, env: EMPTY_ENV });

    expect(client.isConfigured()).toBe(false);
    expect(client.endpoint()).toBeNull();

    const res = await client.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(res).toMatchObject({ configured: false, routed: false, content: null });
    expect(res.reason).toContain(TENSORZERO_URL_ENV);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('embed returns a truthful not-configured result without calling fetch', async () => {
    const fetch = fakeFetch({});
    const client = createTensorzeroGatewayClient({ fetch, env: EMPTY_ENV });

    const res = await client.embed({ model: 'm', input: 'x' });
    expect(res).toMatchObject({ configured: false, routed: false, embeddings: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('health reports configured:false with a null endpoint', async () => {
    const client = createTensorzeroGatewayClient({ fetch: fakeFetch({}), env: EMPTY_ENV });
    const health = await client.health();
    expect(health).toMatchObject({ configured: false, endpoint: null });
    expect(health.reachable).toBeUndefined();
  });
});

describe('LLM gateway client — failure fallback (degrade-safe)', () => {
  const endpoint = 'http://127.0.0.1:3778';

  it('complete returns not-routed with a reason when fetch rejects', async () => {
    const fetch: FetchLike = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = createTensorzeroGatewayClient({ endpoint, fetch, env: EMPTY_ENV });

    const res = await client.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(res.configured).toBe(true);
    expect(res.routed).toBe(false);
    expect(res.content).toBeNull();
    expect(res.reason).toContain('ECONNREFUSED');
  });

  it('embed returns not-routed on a non-2xx response, surfacing the error body', async () => {
    const client = createTensorzeroGatewayClient({
      endpoint,
      fetch: fakeFetch({ error: 'model not found' }, 404),
      env: EMPTY_ENV,
    });

    const res = await client.embed({ model: 'nope', input: 'x' });
    expect(res.routed).toBe(false);
    expect(res.embeddings).toBeNull();
    expect(res.reason).toContain('model not found');
  });

  it('complete surfaces a nested { error: { message } } body', async () => {
    const client = createTensorzeroGatewayClient({
      endpoint,
      fetch: fakeFetch({ error: { message: 'rate limited' } }, 429),
      env: EMPTY_ENV,
    });
    const res = await client.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(res.routed).toBe(false);
    expect(res.reason).toContain('rate limited');
  });

  it('health reports reachable:false when the probe rejects (never throws)', async () => {
    const fetch: FetchLike = vi.fn(async () => {
      throw new Error('timeout');
    });
    const client = createTensorzeroGatewayClient({ endpoint, fetch, env: EMPTY_ENV });
    const health = await client.health();
    expect(health).toMatchObject({ configured: true, endpoint, reachable: false });
    expect(health.reason).toContain('timeout');
  });
});
