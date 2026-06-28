import type { RunEvent } from '@recoder/agent-os';
import {
  isActionableType,
  resolveSubjectId,
  type PolarWebhookEnvelope,
} from './webhook-event';

/** The direction an entitlement moved as a result of a webhook. */
export type EntitlementChangeKind = 'granted' | 'revoked' | 'updated' | 'ignored';

/**
 * The entitlement change a verified webhook implies. This is a DERIVED
 * statement, not an authority: the durable grant still lives in Polar. The
 * change is emitted as a `RunEvent` so the control plane can react (invalidate
 * an entitlement cache, re-resolve the subject) — distribution never writes the
 * grant itself.
 */
export interface EntitlementChange {
  readonly kind: EntitlementChangeKind;
  readonly subjectId: string | null;
  readonly polarType: string;
  /** The Polar product id, when the event carried one. */
  readonly productId?: string;
  readonly reason: string;
}

/** Map a Polar webhook type → the entitlement direction it implies. */
export function classifyChange(type: string): EntitlementChangeKind {
  switch (type) {
    case 'order.paid':
    case 'subscription.created':
    case 'subscription.active':
    case 'benefit_grant.created':
      return 'granted';
    case 'order.refunded':
    case 'subscription.canceled':
    case 'subscription.revoked':
    case 'benefit_grant.revoked':
      return 'revoked';
    case 'subscription.updated':
      return 'updated';
    default:
      return 'ignored';
  }
}

/**
 * Translate a verified Polar webhook envelope into an `EntitlementChange`. An
 * unactionable type yields `ignored` (acknowledged, no change). A type we act on
 * but cannot resolve a subject for yields `ignored` with a reason (we never
 * apply a change to an unknown subject — fail safe).
 */
export function webhookToEntitlementChange(env: PolarWebhookEnvelope): EntitlementChange {
  if (!isActionableType(env.type)) {
    return { kind: 'ignored', subjectId: null, polarType: env.type, reason: 'non-actionable type' };
  }
  const subjectId = resolveSubjectId(env);
  const kind = classifyChange(env.type);
  const productId = env.data.product_id ?? env.data.product?.id;

  if (!subjectId) {
    return {
      kind: 'ignored',
      subjectId: null,
      polarType: env.type,
      ...(productId ? { productId } : {}),
      reason: 'no resolvable recoder subject on the event',
    };
  }
  return {
    kind,
    subjectId,
    polarType: env.type,
    ...(productId ? { productId } : {}),
    reason: `mapped ${env.type} → ${kind}`,
  };
}

/**
 * Build the `RunEvent` that announces an entitlement change to the control
 * plane. `granted`/`updated` → a `verified`-style log; `revoked` → a `log` with
 * the revoke marker. (We do not emit `failed` — a revoke is a normal lifecycle
 * event, not an error.) Returns null for `ignored` (nothing to announce).
 */
export function entitlementChangeToRunEvent(
  change: EntitlementChange,
  input: { taskId: string; eventId: () => string; now?: () => Date },
): RunEvent | null {
  if (change.kind === 'ignored' || change.subjectId === null) return null;
  return {
    eventId: input.eventId(),
    type: 'log',
    taskId: input.taskId,
    message: `entitlement ${change.kind} for subject ${change.subjectId} (${change.polarType})`,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
    data: {
      entitlementChange: change.kind,
      subjectId: change.subjectId,
      polarType: change.polarType,
      ...(change.productId ? { productId: change.productId } : {}),
    },
  };
}
