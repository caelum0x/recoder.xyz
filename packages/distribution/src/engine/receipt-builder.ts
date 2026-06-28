import type { DeliveryReceipt, DeliveryRequest, DeliveryStatus } from '../domain/delivery';
import { DeliveryReceiptSchema } from '../domain/delivery';
import type { ChannelHealth } from '../domain/health-state';
import type { DistributionErrorCode } from '../errors/index';

/**
 * Build a validated `DeliveryReceipt`. The receipt carries the evidence that
 * makes a delivery auditable: `{ url, sha256, health, approvalRef }`. A receipt
 * is only `completed` when health is `ok` — the builder downgrades a claimed
 * completion to `failed` if health is not ok (no inferred success).
 */
export function buildReceipt(input: {
  request: DeliveryRequest;
  status: DeliveryStatus;
  health: ChannelHealth;
  url?: string;
  sha256?: string;
  approvalRef?: string;
  errorCode?: DistributionErrorCode;
  evidence?: Record<string, unknown>;
  now?: () => Date;
}): DeliveryReceipt {
  const now = input.now ?? (() => new Date());

  // Enforce truthful completion: cannot be `completed` with non-ok health.
  let status = input.status;
  if (status === 'completed' && input.health.status !== 'ok') {
    status = 'failed';
  }

  const receipt: DeliveryReceipt = {
    requestId: input.request.requestId,
    channel: input.request.channel,
    status,
    health: input.health,
    evidence: {
      idempotencyKey: input.request.idempotencyKey,
      artifactId: input.request.artifactId,
      ...(input.evidence ?? {}),
    },
    completedAt: now().toISOString(),
    ...(input.url ? { url: input.url } : {}),
    ...(input.sha256 ? { sha256: input.sha256 } : {}),
    ...(input.approvalRef ? { approvalRef: input.approvalRef } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  };

  return DeliveryReceiptSchema.parse(receipt);
}
