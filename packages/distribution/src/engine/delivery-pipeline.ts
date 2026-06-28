import type { DeliveryReceipt, DeliveryRequest } from '../domain/delivery';
import { DeliveryRequestSchema } from '../domain/delivery';
import { unhealthy } from '../domain/health-state';
import type { Plan } from '../domain/subscription-plan';
import type { EntitlementResolver } from '../channels/billing/entitlement-resolver';
import type { ApprovalPort } from '../ports/approval-port';
import type { EventBusPort } from '../ports/event-bus-port';
import type { ChannelPublisher } from './channel-publisher';
import { entitlementGate } from './entitlement-gate';
import { approvalGate } from './approval-gate';
import { buildReceipt } from './receipt-builder';
import { DistributionError, type DistributionErrorCode } from '../errors/index';

export interface DeliveryPipelineDeps {
  readonly resolver: EntitlementResolver;
  readonly approvals: ApprovalPort;
  readonly events?: EventBusPort;
  /** Resolve the actor's authoritative plan (from recoder.xyz/billing). */
  readonly resolveActorPlan: (req: DeliveryRequest) => Promise<Plan>;
  readonly now?: () => Date;
}

/** Tracks idempotency so a retried delivery never double-publishes. */
export interface IdempotencyStore {
  seen(key: string): boolean;
  remember(key: string, receipt: DeliveryReceipt): void;
  get(key: string): DeliveryReceipt | undefined;
}

export function createInMemoryIdempotencyStore(): IdempotencyStore {
  const map = new Map<string, DeliveryReceipt>();
  return {
    seen: (key) => map.has(key),
    remember: (key, receipt) => void map.set(key, receipt),
    get: (key) => map.get(key),
  };
}

/**
 * The canonical ordered delivery pipeline:
 *   entitlement-gate → approval-gate → idempotency → publish → verify
 *   → receipt → run-event (rollback/failed on any miss).
 *
 * Every off-nominal path resolves to a truthful receipt (denied / pending_
 * approval / failed) — never a faked completion.
 */
export async function runDeliveryPipeline(
  deps: DeliveryPipelineDeps,
  publisher: ChannelPublisher,
  idempotency: IdempotencyStore,
  rawReq: DeliveryRequest,
): Promise<DeliveryReceipt> {
  const now = deps.now ?? (() => new Date());
  const req = DeliveryRequestSchema.parse(rawReq);

  // Idempotency short-circuit: return the prior receipt, do not re-publish.
  const prior = idempotency.get(req.idempotencyKey);
  if (prior) return prior;

  const emit = async (receipt: DeliveryReceipt): Promise<DeliveryReceipt> => {
    if (deps.events) {
      await deps.events.emit({
        eventId: `dist-${req.requestId}`,
        taskId: req.taskId,
        type: receipt.status === 'completed' ? 'completed' : 'failed',
        createdAt: receipt.completedAt,
        message: `delivery ${receipt.status} on channel ${receipt.channel}`,
        data: {
          channel: receipt.channel,
          status: receipt.status,
          url: receipt.url,
          sha256: receipt.sha256,
          approvalRef: receipt.approvalRef,
          code: receipt.errorCode,
        },
      });
    }
    return receipt;
  };

  const fail = async (
    code: DistributionErrorCode,
    reason: string,
    approvalRef?: string,
    status: 'failed' | 'denied' | 'pending_approval' = 'failed',
  ): Promise<DeliveryReceipt> => {
    const receipt = buildReceipt({
      request: req,
      status,
      health: unhealthy(reason, { code }),
      errorCode: code,
      ...(approvalRef ? { approvalRef } : {}),
      evidence: { reason },
      now,
    });
    idempotency.remember(req.idempotencyKey, receipt);
    return emit(receipt);
  };

  // 1. Entitlement gate (fail safe: deny on miss).
  const actorPlan = await deps.resolveActorPlan(req);
  const ent = await entitlementGate(deps.resolver, req, actorPlan);
  if (!ent.allowed) {
    return fail('entitlement_denied', ent.reason ?? 'entitlement denied', undefined, 'denied');
  }

  // 2. Approval gate (fail closed: never self-approve).
  const appr = await approvalGate(deps.approvals, req);
  if (appr.outcome === 'pending') {
    return fail('approval_required', appr.reason, appr.approvalRef, 'pending_approval');
  }
  if (appr.outcome === 'rejected') {
    return fail('approval_rejected', appr.reason, appr.approvalRef, 'failed');
  }
  const approvalRef = appr.outcome === 'approved' ? appr.approvalRef : undefined;

  // 3. Publish + 4. verify (explicit health; no inferred success).
  try {
    const outcome = await publisher.publish(req);
    const health = await publisher.verify(req, outcome);
    if (health.status !== 'ok') {
      return fail('preview_unhealthy', health.reason ?? 'verification failed', approvalRef);
    }
    const receipt = buildReceipt({
      request: req,
      status: 'completed',
      health,
      url: outcome.url,
      ...(outcome.sha256 ? { sha256: outcome.sha256 } : {}),
      ...(approvalRef ? { approvalRef } : {}),
      ...(outcome.evidence ? { evidence: outcome.evidence } : {}),
      now,
    });
    idempotency.remember(req.idempotencyKey, receipt);
    return emit(receipt);
  } catch (e) {
    const code: DistributionErrorCode =
      e instanceof DistributionError ? e.code : 'publish_failed';
    return fail(code, e instanceof Error ? e.message : 'publish failed', approvalRef);
  }
}
