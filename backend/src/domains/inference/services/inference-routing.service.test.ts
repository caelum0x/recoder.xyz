/**
 * `InferenceRoutingService` — verifies accounting: a routed completion appends a
 * priced usage-ledger row (cost from the catalog) + an `ok` delivery-outcome row;
 * a non-routed call records a `failed` outcome and charges nothing; a ledger
 * write failure never breaks delivery (accounting is best-effort); and feedback
 * is wired to delivery outcomes (audited, best-effort, truthful when declined).
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
    feedback: async (req) => ({ routed: false, tier: 'none', inferenceId: req.inferenceId, metricName: req.metricName, reason: 'no feedback tier in this fake' }),
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

describe('InferenceRoutingService token metering', () => {
  function serviceWithMeter(result: InferenceResult, record: (i: unknown) => Promise<{ inserted: boolean }>) {
    const ledger = { append: vi.fn(async () => null), recentForUser: vi.fn(async () => []), totalsForUser: vi.fn(), isDurable: () => true } as unknown as UsageLedgerRepository;
    const outcomes = { append: vi.fn(async () => null), recentForUser: vi.fn(async () => []), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
    const service = new InferenceRoutingService({ logger: log, gateway: gatewayReturning(result), catalog: catalog(ENTRY), ledger, outcomes });
    service.setUsageMeter({ record: record as never });
    return service;
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('meters prompt + completion tokens (totalTokens) on a routed completion, idempotent by inferenceId', async () => {
    const record = vi.fn(async () => ({ inserted: true as const }));
    const service = serviceWithMeter(
      { routed: true, tier: 'napi', model: 'openai/gpt-4o-mini', content: 'hi', inferenceId: 'inf-9', usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 } },
      record,
    );

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1' });
    await flush();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'u1', kind: 'token', quantity: 1500, engine: 'openai', idempotencyKey: 'token:inf-9' }),
    );
  });

  it('does NOT meter a non-routed completion (nothing to charge)', async () => {
    const record = vi.fn(async () => ({ inserted: true as const }));
    const service = serviceWithMeter({ routed: false, tier: 'none', model: 'openai/gpt-4o-mini', content: null, reason: 'unconfigured' }, record);

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1' });
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('does NOT meter when the request has no attributable userId', async () => {
    const record = vi.fn(async () => ({ inserted: true as const }));
    const service = serviceWithMeter(
      { routed: true, tier: 'napi', model: 'openai/gpt-4o-mini', content: 'hi', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      record,
    );

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('degrade-safe: a metering throw never breaks delivery', async () => {
    const record = vi.fn(async () => {
      throw new Error('billing down');
    });
    const service = serviceWithMeter(
      { routed: true, tier: 'napi', model: 'openai/gpt-4o-mini', content: 'ok', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      record as never,
    );

    const result = await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1' });
    await flush();

    expect(result.routed).toBe(true);
    expect(result.content).toBe('ok');
  });
});

describe('InferenceRoutingService.feedback', () => {
  function serviceWith(gateway: InferenceGatewayPort, outcomes: DeliveryOutcomeRepository) {
    const ledger = { append: vi.fn(async () => null), recentForUser: vi.fn(), totalsForUser: vi.fn(), isDurable: () => true } as unknown as UsageLedgerRepository;
    return new InferenceRoutingService({ logger: log, gateway, catalog: catalog(null), ledger, outcomes });
  }

  const FEEDBACK = { inferenceId: 'inf-1', metricName: 'task_success', value: true, userId: 'u1' } as const;

  it('forwards routed feedback and appends an ok delivery-outcome audit row', async () => {
    const outcomes = { append: vi.fn(async () => null), recentForUser: vi.fn(), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
    const gateway = {
      ...gatewayReturning({ routed: false, tier: 'none', model: 'm', content: null }),
      feedback: async () => ({ routed: true, tier: 'napi', inferenceId: 'inf-1', metricName: 'task_success', feedbackId: 'fb-1' }),
    } as InferenceGatewayPort;

    const result = await serviceWith(gateway, outcomes).feedback(FEEDBACK);

    expect(result).toEqual({ routed: true, tier: 'napi', inferenceId: 'inf-1', metricName: 'task_success', feedbackId: 'fb-1' });
    expect(outcomes.append).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        model: 'feedback:task_success',
        tier: 'napi',
        routed: true,
        status: 'ok',
        reason: 'feedback task_success on inf-1 (feedback_id fb-1)',
      }),
    );
  });

  it('returns the truthful not-routed result and audits a failed outcome', async () => {
    const outcomes = { append: vi.fn(async () => null), recentForUser: vi.fn(), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
    const result = await serviceWith(gatewayReturning({ routed: false, tier: 'none', model: 'm', content: null }), outcomes).feedback(FEEDBACK);

    expect(result.routed).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(outcomes.append).toHaveBeenCalledWith(expect.objectContaining({ routed: false, status: 'failed', tier: 'none' }));
  });

  it('never breaks the submission when the outcome audit write throws', async () => {
    const outcomes = { append: vi.fn(async () => { throw new Error('db down'); }), recentForUser: vi.fn(), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
    const gateway = {
      ...gatewayReturning({ routed: false, tier: 'none', model: 'm', content: null }),
      feedback: async () => ({ routed: true, tier: 'napi' as const, inferenceId: 'inf-1', metricName: 'task_success' }),
    } as InferenceGatewayPort;

    const result = await serviceWith(gateway, outcomes).feedback(FEEDBACK);
    expect(result.routed).toBe(true); // the audit is best-effort, never blocking
  });
});
