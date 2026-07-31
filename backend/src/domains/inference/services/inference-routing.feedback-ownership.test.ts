/**
 * `InferenceRoutingService.feedback` — cross-tenant ownership guard (the shared
 * seam BOTH feedback surfaces route through: the HTTP `POST /inference/feedback`
 * route and the `inference.feedback` MCP tool).
 *
 * The vuln these close: feedback attached a caller-supplied `inferenceId` to the
 * RLHF/quality signal with NO check that the inference belongs to the caller, so
 * tenant B could poison tenant A's feedback signal. Ownership IS knowable — the
 * `inference_usage_ledger` records `inference_id` per `user_id` — so before
 * dispatching to the gateway we verify the id was produced by the caller. When it
 * was not (and the caller is not admin/internal/solo), we return a no-oracle
 * NOT_FOUND (`denied:'not_found'`) WITHOUT touching the gateway.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type { DeliveryOutcomeRepository, UsageLedgerRepository } from '../ports/usage-ledger.port.js';
import type { FeedbackRequest } from '../types.js';
import { InferenceRoutingService } from './inference-routing.service.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

function build(owns: (userId: string, inferenceId: string) => Promise<boolean>) {
  const gwFeedback = vi.fn(async (req: FeedbackRequest) => ({
    routed: true,
    tier: 'napi' as const,
    inferenceId: req.inferenceId,
    metricName: req.metricName,
    feedbackId: 'fb-1',
  }));
  const gateway = {
    complete: vi.fn(),
    completeStream: vi.fn(),
    embed: vi.fn(),
    feedback: gwFeedback,
    health: vi.fn(),
  } as unknown as InferenceGatewayPort;
  const ownsInference = vi.fn(owns);
  const ledger = {
    append: vi.fn(async () => null),
    recentForUser: vi.fn(),
    totalsForUser: vi.fn(),
    ownsInference,
    isDurable: () => true,
  } as unknown as UsageLedgerRepository;
  const outcomes = {
    append: vi.fn(async () => null),
    recentForUser: vi.fn(),
    isDurable: () => true,
  } as unknown as DeliveryOutcomeRepository;
  const catalog = {
    list: async () => [],
    get: async () => null,
    upsert: async () => null,
    setEnabled: async () => false,
    isDurable: () => true,
  } as unknown as ModelCatalogRepository;
  const service = new InferenceRoutingService({ logger: log, gateway, catalog, ledger, outcomes });
  return { service, gwFeedback, ownsInference };
}

describe('InferenceRoutingService.feedback ownership guard', () => {
  it('rejects tenant B feedback on tenant A inferenceId with a no-oracle NOT_FOUND and never touches the gateway', async () => {
    const { service, gwFeedback, ownsInference } = build(async () => false); // B owns nothing
    const result = await service.feedback({
      inferenceId: 'inf-owned-by-A',
      metricName: 'task_success',
      value: true,
      userId: 'tenant-B',
    });

    expect(ownsInference).toHaveBeenCalledWith('tenant-B', 'inf-owned-by-A');
    expect(result).toMatchObject({ routed: false, tier: 'none', inferenceId: 'inf-owned-by-A', denied: 'not_found' });
    expect(result.reason).toBeTruthy();
    // The poisoning signal must NEVER reach the gateway.
    expect(gwFeedback).not.toHaveBeenCalled();
  });

  it("forwards the owner's feedback on their own inferenceId to the gateway", async () => {
    const { service, gwFeedback, ownsInference } = build(async () => true); // owner owns it
    const result = await service.feedback({
      inferenceId: 'inf-1',
      metricName: 'task_success',
      value: true,
      userId: 'owner',
    });

    expect(ownsInference).toHaveBeenCalledWith('owner', 'inf-1');
    expect(result).toMatchObject({ routed: true, tier: 'napi', feedbackId: 'fb-1' });
    expect(gwFeedback).toHaveBeenCalledTimes(1);
  });

  it('BYPASS (admin/internal/solo): a bypassOwnershipCheck request forwards WITHOUT consulting ownership', async () => {
    const { service, gwFeedback, ownsInference } = build(async () => false);
    const req: FeedbackRequest = {
      inferenceId: 'inf-any',
      metricName: 'task_success',
      value: true,
      userId: 'operator',
      bypassOwnershipCheck: true,
    };
    const result = await service.feedback(req);

    expect(ownsInference).not.toHaveBeenCalled();
    expect(result).toMatchObject({ routed: true, tier: 'napi' });
    expect(gwFeedback).toHaveBeenCalledTimes(1);
  });

  it('does NOT scope an unattributed call (no userId ⇒ internal/direct path): forwards without an ownership query', async () => {
    const { service, gwFeedback, ownsInference } = build(async () => false);
    const result = await service.feedback({ inferenceId: 'inf-x', metricName: 'task_success', value: true });

    expect(ownsInference).not.toHaveBeenCalled();
    expect(result).toMatchObject({ routed: true });
    expect(gwFeedback).toHaveBeenCalledTimes(1);
  });

  it('fails CLOSED (rejects, no gateway) when the ownership read errors — a fault is never a poisoning oracle', async () => {
    const { service, gwFeedback } = build(async () => {
      throw new Error('ledger down');
    });
    const result = await service.feedback({
      inferenceId: 'inf-1',
      metricName: 'task_success',
      value: true,
      userId: 'tenant-B',
    });

    expect(result).toMatchObject({ routed: false, denied: 'not_found' });
    expect(gwFeedback).not.toHaveBeenCalled();
  });
});
