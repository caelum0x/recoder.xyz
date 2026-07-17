/**
 * `TensorzeroTransportAdapter` — the delivery LADDER. Verifies: napi-first routing,
 * decline-and-fall-through to loopback, truthful `none` when no tier serves, REAL
 * token-granular streaming via the loopback SSE seam vs. the buffered single-delta
 * degrade, embeddings via loopback, and truthful tiered health.
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type {
  LlmGatewayPort,
  GatewayCompletionResult,
  GatewayEmbeddingResult,
  GatewayHealth,
} from '../llm-gateway-client.js';
import { TensorzeroTransportAdapter, type NapiTierPort } from './tensorzero-transport.adapter.js';
import { inferenceConfigSchema, type InferenceConfig } from '../config.js';
import type { StreamFetchLike, StreamResponse } from './gateway-stream.js';
import type { FeedbackRequest, FeedbackResult, InferenceRequest, InferenceResult, StreamDelta } from '../types.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

function config(over: Partial<InferenceConfig> = {}): InferenceConfig {
  return inferenceConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    gatewayEndpoint: 'http://127.0.0.1:3778',
    gatewayApiKeyPresent: false,
    gatewayApiKey: null,
    completePath: '/openai/v1/chat/completions',
    embedPath: '/openai/v1/embeddings',
    napiFirst: true,
    streamingEnabled: true,
    defaultModel: 'openai/gpt-4o-mini',
    requestTimeoutMs: 60_000,
    ...over,
  });
}

function fakeLoopback(over: Partial<{
  configured: boolean;
  endpoint: string | null;
  complete: GatewayCompletionResult;
  embed: GatewayEmbeddingResult;
  health: GatewayHealth;
}> = {}): LlmGatewayPort {
  const configured = over.configured ?? true;
  return {
    isConfigured: () => configured,
    endpoint: () => over.endpoint ?? (configured ? 'http://127.0.0.1:3778' : null),
    async complete(): Promise<GatewayCompletionResult> {
      return over.complete ?? { configured, routed: false, content: null, reason: 'loopback not routed' };
    },
    async embed(): Promise<GatewayEmbeddingResult> {
      return over.embed ?? { configured, routed: false, embeddings: null, reason: 'loopback not routed' };
    },
    async health(): Promise<GatewayHealth> {
      return over.health ?? { configured, endpoint: over.endpoint ?? null, reachable: configured };
    },
  };
}

function fakeNapi(
  available: boolean,
  result: InferenceResult | null,
  feedback?: (req: FeedbackRequest) => Promise<FeedbackResult | null>,
): NapiTierPort {
  return {
    available: () => available,
    complete: async () => result,
    ...(feedback ? { feedback } : {}),
  };
}

const REQ: InferenceRequest = { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] };

function sseFetch(tokens: string[]): StreamFetchLike {
  const body = {
    async *[Symbol.asyncIterator]() {
      for (const t of tokens) yield `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
      yield 'data: [DONE]\n\n';
    },
  };
  return async (): Promise<StreamResponse> => ({ ok: true, status: 200, text: async () => '', body });
}

describe('TensorzeroTransportAdapter.complete (ladder)', () => {
  it('routes through the napi tier first when preferred + bound', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback(),
      napi: fakeNapi(true, { routed: true, tier: 'napi', model: REQ.model, content: 'from-napi' }),
    });
    const result = await adapter.complete(REQ);
    expect(result.routed).toBe(true);
    expect(result.tier).toBe('napi');
    expect(result.content).toBe('from-napi');
  });

  it('falls through to loopback when the napi tier declines', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback({ complete: { configured: true, routed: true, content: 'from-loopback', usage: { inputTokens: 5, outputTokens: 2 } } }),
      napi: fakeNapi(true, null), // decline
    });
    const result = await adapter.complete(REQ);
    expect(result.tier).toBe('loopback');
    expect(result.content).toBe('from-loopback');
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2, totalTokens: 7 });
  });

  it('reports a truthful `none` when no tier serves', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback({ configured: false }),
      napi: fakeNapi(false, null),
    });
    const result = await adapter.complete(REQ);
    expect(result.routed).toBe(false);
    expect(result.tier).toBe('none');
    expect(result.reason).toBeTruthy();
  });
});

describe('TensorzeroTransportAdapter.completeStream', () => {
  it('delivers REAL token-granular SSE via the loopback tier', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback({ configured: true }),
      streamFetch: sseFetch(['Hel', 'lo']),
      napi: fakeNapi(false, null),
    });
    const deltas: StreamDelta[] = [];
    const result = await adapter.completeStream(REQ, (d) => deltas.push(d));
    expect(result.routed).toBe(true);
    expect(result.tier).toBe('loopback');
    expect(result.streamed).toBe(true);
    expect(result.tokenGranular).toBe(true);
    expect(result.content).toBe('Hello');
    // role delta first, then one content delta per token.
    expect(deltas[0]).toEqual({ role: 'assistant' });
    expect(deltas.filter((d) => d.content).map((d) => d.content)).toEqual(['Hel', 'lo']);
  });

  it('degrades to a buffered single-delta emit when streaming is disabled', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config({ streamingEnabled: false }),
      loopback: fakeLoopback({ complete: { configured: true, routed: true, content: 'buffered' } }),
      streamFetch: sseFetch(['unused']),
      napi: fakeNapi(false, null),
    });
    const deltas: StreamDelta[] = [];
    const result = await adapter.completeStream(REQ, (d) => deltas.push(d));
    expect(result.streamed).toBe(true);
    expect(result.tokenGranular).toBe(false); // buffered, not token-granular
    expect(result.content).toBe('buffered');
    expect(deltas).toEqual([{ role: 'assistant' }, { content: 'buffered' }]);
  });
});

describe('TensorzeroTransportAdapter.feedback', () => {
  const FEEDBACK: FeedbackRequest = { inferenceId: 'inf-1', metricName: 'task_success', value: true };

  it('routes feedback through a bound napi tier with a feedback seam', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback(),
      napi: fakeNapi(true, null, async (req) => ({
        routed: true,
        tier: 'napi',
        inferenceId: req.inferenceId,
        metricName: req.metricName,
        feedbackId: 'fb-9',
      })),
    });
    const result = await adapter.feedback(FEEDBACK);
    expect(result).toEqual({
      routed: true,
      tier: 'napi',
      inferenceId: 'inf-1',
      metricName: 'task_success',
      feedbackId: 'fb-9',
    });
  });

  it('reports a truthful not-routed when the napi tier is unbound', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback(),
      napi: fakeNapi(false, null),
    });
    const result = await adapter.feedback(FEEDBACK);
    expect(result.routed).toBe(false);
    expect(result.tier).toBe('none');
    expect(result.feedbackId).toBeUndefined(); // never fabricated
    expect(result.reason).toBeTruthy();
  });

  it('never throws across the seam when the napi feedback call throws', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback(),
      napi: fakeNapi(true, null, async () => {
        throw new Error('native boom');
      }),
    });
    const result = await adapter.feedback(FEEDBACK);
    expect(result.routed).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe('TensorzeroTransportAdapter.embed + health', () => {
  it('embeds via the loopback tier', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback({ embed: { configured: true, routed: true, embeddings: [[0.1, 0.2]], usage: { inputTokens: 3 } } }),
    });
    const result = await adapter.embed({ model: 'text-embedding-3-small', input: 'hi' });
    expect(result.routed).toBe(true);
    expect(result.tier).toBe('loopback');
    expect(result.embeddings).toEqual([[0.1, 0.2]]);
  });

  it('reports napi tier as up when bound', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config(),
      loopback: fakeLoopback({ configured: false }),
      napi: fakeNapi(true, null),
    });
    const health = await adapter.health();
    expect(health.tier).toBe('napi');
    expect(health.available).toBe(true);
    expect(health.napiBound).toBe(true);
  });

  it('reports down when napi unbound and loopback unconfigured', async () => {
    const adapter = new TensorzeroTransportAdapter({
      logger: log,
      config: config({ gatewayEndpoint: null }),
      loopback: fakeLoopback({ configured: false }),
      napi: fakeNapi(false, null),
    });
    const health = await adapter.health();
    expect(health.available).toBe(false);
    expect(health.tier).toBe('none');
    expect(health.reason).toBeTruthy();
  });
});
