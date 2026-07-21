/**
 * `InferenceRoutingService` run-inference sink (napi-provenance gate) — verifies
 * the RLHF-anchor correlation seam:
 *   - a `napi`-tier routed completion carrying a `correlationWorkspaceId` +
 *     `inferenceId` fires `runSink.record` EXACTLY ONCE (buffered + streamed),
 *   - a `loopback`- or `router`-tier result with an id is NOT emitted (the
 *     provenance gate: only napi ids are feedback-resolvable),
 *   - no `inferenceId` / no `correlationWorkspaceId` ⇒ no emission,
 *   - an absent sink ⇒ a truthful no-op,
 *   - a throwing sink NEVER fails the completion (fire-and-forget).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type { DeliveryOutcomeRepository, UsageLedgerRepository } from '../ports/usage-ledger.port.js';
import type { RunInferenceSinkPort } from '../ports/run-inference-sink.port.js';
import type { InferenceResult, ModelCatalogEntry } from '../types.js';
import { InferenceRoutingService } from './inference-routing.service.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

const ENTRY: ModelCatalogEntry = {
  modelId: 'openai/gpt-4o-mini',
  provider: 'openai',
  displayName: 'GPT-4o mini',
  contextWindow: 128000,
  inputMicroUsdPerMTok: 150_000,
  outputMicroUsdPerMTok: 600_000,
  supportsStreaming: true,
  enabled: true,
  updatedAt: new Date().toISOString(),
};

function catalog(entry: ModelCatalogEntry | null): ModelCatalogRepository {
  return {
    list: async () => (entry ? [entry] : []),
    get: async () => entry,
    upsert: async () => entry,
    setEnabled: async () => false,
    isDurable: () => true,
  };
}

function gatewayReturning(result: InferenceResult): InferenceGatewayPort {
  return {
    complete: async () => result,
    completeStream: async () => ({ ...result, streamed: true, tokenGranular: true }),
    embed: async () => ({ routed: false, tier: 'none', model: result.model, embeddings: null }),
    feedback: async (req) => ({ routed: false, tier: 'none', inferenceId: req.inferenceId, metricName: req.metricName }),
    health: async () => ({ tier: 'napi', available: true, napiBound: true, loopbackConfigured: false }),
  };
}

function serviceReturning(result: InferenceResult): {
  service: InferenceRoutingService;
  record: ReturnType<typeof vi.fn>;
  setSink: (sink?: RunInferenceSinkPort) => void;
} {
  const ledger = { append: vi.fn(async () => null), recentForUser: vi.fn(async () => []), totalsForUser: vi.fn(), isDurable: () => true } as unknown as UsageLedgerRepository;
  const outcomes = { append: vi.fn(async () => null), recentForUser: vi.fn(async () => []), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
  const service = new InferenceRoutingService({ logger: log, gateway: gatewayReturning(result), catalog: catalog(ENTRY), ledger, outcomes });
  const record = vi.fn(async () => undefined);
  const setSink = (sink?: RunInferenceSinkPort): void => service.setRunInferenceSink(sink ?? { record: record as never });
  return { service, record, setSink };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const NAPI_RESULT: InferenceResult = { routed: true, tier: 'napi', model: 'openai/gpt-4o-mini', content: 'ok', inferenceId: 'inf-napi-1' };

describe('InferenceRoutingService run-inference sink (napi-provenance gate)', () => {
  it('fires record ONCE for a napi-tier completion with a correlationWorkspaceId + inferenceId', async () => {
    const { service, record, setSink } = serviceReturning(NAPI_RESULT);
    setSink();

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1', correlationWorkspaceId: 'ws-1' });
    await flush();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({ workspaceId: 'ws-1', inferenceId: 'inf-napi-1', userId: 'u1' });
  });

  it('fires on the streamed path too (parity), userId null when unattributed', async () => {
    const { service, record, setSink } = serviceReturning(NAPI_RESULT);
    setSink();

    await service.completeStream(
      { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], correlationWorkspaceId: 'ws-2' },
      () => {},
    );
    await flush();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({ workspaceId: 'ws-2', inferenceId: 'inf-napi-1', userId: null });
  });

  it('does NOT fire for a loopback-tier id (provenance gate — non-napi id is unresolvable)', async () => {
    const { service, record, setSink } = serviceReturning({ routed: true, tier: 'loopback', model: 'openai/gpt-4o-mini', content: 'ok', inferenceId: 'inf-loop-1' });
    setSink();

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1', correlationWorkspaceId: 'ws-1' });
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('does NOT fire for a router-tier (rung-3 BYOK) id', async () => {
    const { service, record, setSink } = serviceReturning({ routed: true, tier: 'router', model: 'openai/gpt-4o-mini', content: 'ok', inferenceId: 'chatcmpl-abc' });
    setSink();

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1', correlationWorkspaceId: 'ws-1' });
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('does NOT fire without a correlationWorkspaceId (backend-internal / plain edge)', async () => {
    const { service, record, setSink } = serviceReturning(NAPI_RESULT);
    setSink();

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1' });
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('does NOT fire when the napi result carries no inferenceId', async () => {
    const { service, record, setSink } = serviceReturning({ routed: true, tier: 'napi', model: 'openai/gpt-4o-mini', content: 'ok' });
    setSink();

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1', correlationWorkspaceId: 'ws-1' });
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('absent sink ⇒ a truthful no-op (delivery unaffected)', async () => {
    const { service } = serviceReturning(NAPI_RESULT); // no setSink()

    const result = await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1', correlationWorkspaceId: 'ws-1' });
    await flush();

    expect(result.routed).toBe(true);
    expect(result.content).toBe('ok');
  });

  it('degrade-safe: a throwing sink NEVER fails the completion (fire-and-forget)', async () => {
    const { service } = serviceReturning(NAPI_RESULT);
    service.setRunInferenceSink({
      record: async () => {
        throw new Error('conductor down');
      },
    });

    const result = await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1', correlationWorkspaceId: 'ws-1' });
    await flush();

    expect(result.routed).toBe(true);
    expect(result.content).toBe('ok');
  });
});
