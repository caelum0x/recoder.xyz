/**
 * `engine-client-napi-tier` — the CONFLICT #8-safe bridge from the engines
 * `EngineClientPort` into the inference napi tier. Verifies: `ensureBooted` binds
 * only on `up` health, `complete` maps a TZ `inference` result, and a
 * `{ ok:false }` invoke declines (returns null) so the ladder falls to loopback.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { EngineHealth, InvokeResult } from '../../engines/types.js';
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
});
