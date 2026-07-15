/**
 * `InferenceRoutingService` — verifies accounting: a routed completion appends a
 * priced usage-ledger row (cost from the catalog) + an `ok` delivery-outcome row;
 * a non-routed call records a `failed` outcome and charges nothing; and a ledger
 * write failure never breaks delivery (accounting is best-effort).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type { DeliveryOutcomeRepository, UsageLedgerRepository } from '../ports/usage-ledger.port.js';
import type { ModelCatalogEntry, InferenceResult } from '../types.js';
import { InferenceRoutingService } from './inference-routing.service.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

function catalog(entry: ModelCatalogEntry | null): ModelCatalogRepository {
  return {
    list: async () => (entry ? [entry] : []),
    get: async () => entry,
    upsert: async () => entry,
    setEnabled: async () => false,
    isDurable: () => true,
  };
}

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

function gatewayReturning(result: InferenceResult): InferenceGatewayPort {
  return {
    complete: async () => result,
    completeStream: async () => ({ ...result, streamed: true, tokenGranular: true }),
    embed: async () => ({ routed: false, tier: 'none', model: result.model, embeddings: null }),
    health: async () => ({ tier: 'loopback', available: true, napiBound: false, loopbackConfigured: true }),
  };
}

describe('InferenceRoutingService.complete accounting', () => {
  it('appends a priced usage row + an ok outcome for a routed call', async () => {
    const ledger = { append: vi.fn(async () => null), recentForUser: vi.fn(async () => []), totalsForUser: vi.fn(), isDurable: () => true } as unknown as UsageLedgerRepository;
    const outcomes = { append: vi.fn(async () => null), recentForUser: vi.fn(async () => []), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
    const service = new InferenceRoutingService({
      logger: log,
      gateway: gatewayReturning({ routed: true, tier: 'loopback', model: 'openai/gpt-4o-mini', content: 'hi', usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 } }),
      catalog: catalog(ENTRY),
      ledger,
      outcomes,
    });

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1' });

    expect(outcomes.append).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', tier: 'loopback', routed: true, userId: 'u1' }));
    expect(ledger.append).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4o-mini',
        provider: 'openai',
        tier: 'loopback',
        costMicroUsd: 450, // 1000*0.15 + 500*0.6 (per MTok)
        usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      }),
    );
  });

  it('records a failed outcome and charges nothing when not routed', async () => {
    const ledger = { append: vi.fn(async () => null), recentForUser: vi.fn(), totalsForUser: vi.fn(), isDurable: () => true } as unknown as UsageLedgerRepository;
    const outcomes = { append: vi.fn(async () => null), recentForUser: vi.fn(), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
    const service = new InferenceRoutingService({
      logger: log,
      gateway: gatewayReturning({ routed: false, tier: 'none', model: 'openai/gpt-4o-mini', content: null, reason: 'unconfigured' }),
      catalog: catalog(null),
      ledger,
      outcomes,
    });

    const result = await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.routed).toBe(false);
    expect(outcomes.append).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', routed: false }));
    expect(ledger.append).not.toHaveBeenCalled();
  });

  it('never breaks delivery when accounting throws', async () => {
    const ledger = { append: vi.fn(async () => { throw new Error('db down'); }), recentForUser: vi.fn(), totalsForUser: vi.fn(), isDurable: () => true } as unknown as UsageLedgerRepository;
    const outcomes = { append: vi.fn(async () => { throw new Error('db down'); }), recentForUser: vi.fn(), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
    const service = new InferenceRoutingService({
      logger: log,
      gateway: gatewayReturning({ routed: true, tier: 'napi', model: 'openai/gpt-4o-mini', content: 'ok' }),
      catalog: catalog(ENTRY),
      ledger,
      outcomes,
    });
    const result = await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.routed).toBe(true); // delivery survives accounting failure
    expect(result.content).toBe('ok');
  });
});
