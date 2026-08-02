/**
 * `InferenceRoutingService` usage-ledger attribution — verifies every routed
 * completion carries its workspace/task identity into the ledger row:
 *   - `correlationWorkspaceId` (the workspace-scoped gateway edge) → `workspaceId`,
 *   - `routingHint.taskId` (the caller's task identity) → `taskId`,
 *   - absent context ⇒ explicit nulls (attribution is never fabricated),
 *   - streamed completions attribute identically to buffered ones.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type { DeliveryOutcomeRepository, UsageLedgerRepository } from '../ports/usage-ledger.port.js';
import type { InferenceResult } from '../types.js';
import { InferenceRoutingService } from './inference-routing.service.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

const RESULT: InferenceResult = {
  routed: true,
  tier: 'napi',
  model: 'openai/gpt-4o-mini',
  content: 'ok',
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  inferenceId: 'inf-1',
};

function gatewayReturning(result: InferenceResult): InferenceGatewayPort {
  return {
    complete: async () => result,
    completeStream: async () => ({ ...result, streamed: true, tokenGranular: true }),
    embed: async () => ({ routed: false, tier: 'none', model: result.model, embeddings: null }),
    feedback: async (req) => ({ routed: false, tier: 'none', inferenceId: req.inferenceId, metricName: req.metricName }),
    health: async () => ({ tier: 'napi', available: true, napiBound: true, loopbackConfigured: false }),
  };
}

const catalog = {
  list: async () => [],
  get: async () => null,
  upsert: async () => null,
  setEnabled: async () => false,
  isDurable: () => true,
} as unknown as ModelCatalogRepository;

function makeService(): { service: InferenceRoutingService; append: ReturnType<typeof vi.fn> } {
  const append = vi.fn(async () => null);
  const ledger = { append, recentForUser: vi.fn(async () => []), totalsForUser: vi.fn(), isDurable: () => true } as unknown as UsageLedgerRepository;
  const outcomes = { append: vi.fn(async () => null), recentForUser: vi.fn(async () => []), isDurable: () => true } as unknown as DeliveryOutcomeRepository;
  const service = new InferenceRoutingService({ logger: log, gateway: gatewayReturning(RESULT), catalog, ledger, outcomes });
  return { service, append };
}

describe('InferenceRoutingService usage-ledger workspace/task attribution', () => {
  it('threads correlationWorkspaceId + routingHint.taskId into the ledger row', async () => {
    const { service, append } = makeService();

    await service.complete({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      userId: 'u1',
      correlationWorkspaceId: 'ws-1',
      routingHint: { taskId: 'task-1' },
    });

    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1', taskId: 'task-1' }));
  });

  it('records explicit null attribution when no workspace/task context rides the request', async () => {
    const { service, append } = makeService();

    await service.complete({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], userId: 'u1' });

    expect(append).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: null, taskId: null }));
  });

  it('attributes streamed completions identically', async () => {
    const { service, append } = makeService();

    await service.completeStream(
      {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        userId: 'u1',
        correlationWorkspaceId: 'ws-2',
        routingHint: { taskId: 'task-2' },
      },
      () => {},
    );

    expect(append).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-2', taskId: 'task-2' }));
  });
});
