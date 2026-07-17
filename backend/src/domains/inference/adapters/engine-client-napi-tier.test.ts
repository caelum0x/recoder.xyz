/**
 * `engine-client-napi-tier` — the CONFLICT #8-safe bridge from the engines
 * `EngineClientPort` into the inference napi tier. Verifies: `ensureBooted` binds
 * only on `up` health, `complete` maps a TZ `inference` result, a `{ ok:false }`
 * invoke declines (returns null) so the ladder falls to loopback, `completeStream`
 * maps the TZ `inferenceStream` op to real per-chunk deltas (lazy role framing,
 * truthful decline on failure/empty stream), and `feedback` routes the TZ
 * `feedback` op (snake_case input, real feedback_id, never faked).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { EngineHealth, InvokeResult } from '../../engines/types.js';
import type { StreamDelta } from '../types.js';
import { createEngineClientNapiTier } from './engine-client-napi-tier.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

function fakeClient(over: {
  health?: EngineHealth['status'];
  invoke?: InvokeResult<unknown>;
}): EngineClientPort {
  return {
    id: 'tensorzero',
    transport: 'napi',
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    invoke: vi.fn(async () => over.invoke ?? { ok: false, reason: 'down' }),
    health: vi.fn(async () => ({
      engineId: 'tensorzero',
      transport: 'napi',
      status: over.health ?? 'down',
      checkedAt: new Date().toISOString(),
    })),
  };
}

const REQ = { model: 'openai/gpt-4o-mini', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('createEngineClientNapiTier', () => {
  it('binds only when the engine health is up', async () => {
    const up = createEngineClientNapiTier(fakeClient({ health: 'up' }), log);
    await up.ensureBooted!();
    expect(up.available()).toBe(true);

    const degraded = createEngineClientNapiTier(fakeClient({ health: 'degraded' }), log);
    await degraded.ensureBooted!();
    expect(degraded.available()).toBe(false); // version-only build is not a routing tier
  });

  it('maps a TensorZero inference result to a napi InferenceResult', async () => {
    const client = fakeClient({
      health: 'up',
      invoke: { ok: true, value: { content: [{ type: 'text', text: 'hello' }], usage: { input_tokens: 4, output_tokens: 2 }, inference_id: 'inf-1' } },
    });
    const tier = createEngineClientNapiTier(client, log);
    const result = await tier.complete(REQ);
    expect(result).toEqual({
      routed: true,
      tier: 'napi',
      model: 'openai/gpt-4o-mini',
      content: 'hello',
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      inferenceId: 'inf-1',
    });
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({ op: 'inference' }));
  });

  it('declines (null) on a failed invoke so the ladder continues', async () => {
    const tier = createEngineClientNapiTier(fakeClient({ health: 'up', invoke: { ok: false, reason: 'gateway down' } }), log);
    expect(await tier.complete(REQ)).toBeNull();
    expect(tier.available()).toBe(false);
  });

  it('streams TZ chunks as real deltas (lazy role framing) and maps the summary', async () => {
    // A client whose `inferenceStream` op drives the live onChunk sink like the
    // napi adapter does (chat text chunks, then a usage-only final chunk).
    const client = fakeClient({ health: 'up' });
    client.invoke = vi.fn(async (call) => {
      const onChunk = (call.input as { onChunk: (chunk: unknown) => void }).onChunk;
      onChunk({ inference_id: 'inf-s', content: [{ type: 'text', id: '0', text: 'hel' }] });
      onChunk({ inference_id: 'inf-s', content: [{ type: 'text', id: '0', text: 'lo' }] });
      onChunk({ inference_id: 'inf-s', content: [], usage: { input_tokens: 4, output_tokens: 2 } });
      return { ok: true, value: { inference_id: 'inf-s', content: 'hello', usage: { input_tokens: 4, output_tokens: 2 }, chunks: 3 } };
    });
    const tier = createEngineClientNapiTier(client, log);
    const deltas: StreamDelta[] = [];
    const result = await tier.completeStream!(REQ, (d) => deltas.push(d));
    expect(result).toEqual({
      routed: true,
      tier: 'napi',
      model: 'openai/gpt-4o-mini',
      content: 'hello',
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      inferenceId: 'inf-s',
      streamed: true,
      tokenGranular: true,
    });
    // Lazy role first, then one content delta per text chunk (the usage-only
    // final chunk emits nothing).
    expect(deltas).toEqual([{ role: 'assistant' }, { content: 'hel' }, { content: 'lo' }]);
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({ op: 'inferenceStream' }));
  });

  it('streams a JSON-function chunk via its incremental raw text', async () => {
    const client = fakeClient({ health: 'up' });
    client.invoke = vi.fn(async (call) => {
      const onChunk = (call.input as { onChunk: (chunk: unknown) => void }).onChunk;
      onChunk({ inference_id: 'inf-j', raw: '{"answer"' });
      onChunk({ inference_id: 'inf-j', raw: ':42}' });
      return { ok: true, value: { inference_id: 'inf-j', content: '{"answer":42}', chunks: 2 } };
    });
    const tier = createEngineClientNapiTier(client, log);
    const deltas: StreamDelta[] = [];
    const result = await tier.completeStream!(REQ, (d) => deltas.push(d));
    expect(result?.content).toBe('{"answer":42}');
    expect(deltas.filter((d) => d.content).map((d) => d.content)).toEqual(['{"answer"', ':42}']);
  });

  it('completeStream declines (null, zero deltas) on a failed invoke so the ladder continues', async () => {
    const tier = createEngineClientNapiTier(
      fakeClient({ health: 'up', invoke: { ok: false, reason: 'addon lacks the inferenceStream binding' } }),
      log,
    );
    const deltas: StreamDelta[] = [];
    expect(await tier.completeStream!(REQ, (d) => deltas.push(d))).toBeNull();
    expect(deltas).toEqual([]); // nothing emitted → safe fall-through to loopback SSE
  });

  it('completeStream never fakes a stream: a 0-content-delta success declines', async () => {
    // The invoke "succeeds" but no content chunk ever reached the sink.
    const tier = createEngineClientNapiTier(
      fakeClient({ health: 'up', invoke: { ok: true, value: { inference_id: 'inf-e', content: '', chunks: 0 } } }),
      log,
    );
    const deltas: StreamDelta[] = [];
    expect(await tier.completeStream!(REQ, (d) => deltas.push(d))).toBeNull();
    expect(deltas).toEqual([]);
  });

  it('routes feedback as the TZ feedback op and parses the real feedback_id', async () => {
    const client = fakeClient({ health: 'up', invoke: { ok: true, value: { feedback_id: 'fb-1' } } });
    const tier = createEngineClientNapiTier(client, log);
    const result = await tier.feedback!({ inferenceId: 'inf-1', metricName: 'task_success', value: true });
    expect(result).toEqual({
      routed: true,
      tier: 'napi',
      inferenceId: 'inf-1',
      metricName: 'task_success',
      feedbackId: 'fb-1',
    });
    expect(client.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'feedback',
        input: { inference_id: 'inf-1', metric_name: 'task_success', value: true },
      }),
    );
  });

  it('never fakes a feedback_id (accepted-without-id stays truthful; failure declines)', async () => {
    const noId = createEngineClientNapiTier(fakeClient({ health: 'up', invoke: { ok: true, value: {} } }), log);
    const accepted = await noId.feedback!({ inferenceId: 'inf-1', metricName: 'comment', value: 'nice' });
    expect(accepted).toEqual({ routed: true, tier: 'napi', inferenceId: 'inf-1', metricName: 'comment' });
    expect(accepted).not.toHaveProperty('feedbackId');

    const failing = createEngineClientNapiTier(fakeClient({ health: 'up', invoke: { ok: false, reason: 'gateway down' } }), log);
    expect(await failing.feedback!({ inferenceId: 'inf-1', metricName: 'task_success', value: false })).toBeNull();
  });
});
