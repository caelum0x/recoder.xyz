/**
 * Entitlement computation + the idempotent webhook-apply path. The durable
 * Postgres row in `connect_entitlements` is the ONLY source of truth; any
 * client-side cache (desktop/web) is a read-through convenience with a TTL,
 * never authoritative — see `entitlementToken` below.
 */
import { eq } from 'drizzle-orm';
import { connectEntitlements, type ConnectPlanTier, type SubscriptionStatus } from '../db/schema.js';
import type { ConnectDb } from '../db/client.js';
import { planForProductId, statusForEventType, type DodoSubscriptionPayload } from './dodo.js';
import type { DodoProductMap } from '../env.js';

export interface Entitlement {
  readonly accountId: string;
  readonly plan: ConnectPlanTier;
  readonly status: SubscriptionStatus;
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: Date | null;
}

const FREE_ENTITLEMENT = (accountId: string): Entitlement => ({
  accountId,
  plan: 'free',
  status: 'active',
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
});

export async function getEntitlement(db: ConnectDb, accountId: string): Promise<Entitlement> {
  const [row] = await db
    .select()
    .from(connectEntitlements)
    .where(eq(connectEntitlements.accountId, accountId))
    .limit(1);
  if (!row) return FREE_ENTITLEMENT(accountId);
  return {
    accountId,
    plan: row.plan,
    status: row.status,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    currentPeriodEnd: row.currentPeriodEnd,
  };
}

/** Does this entitlement satisfy a feature gate that needs at least `need`? */
const PLAN_RANK: Record<ConnectPlanTier, number> = { free: 0, pro: 1, team: 2 };
export function satisfiesPlan(entitlement: Entitlement, need: ConnectPlanTier): boolean {
  if (entitlement.status !== 'active' && entitlement.status !== 'past_due') return need === 'free';
  return PLAN_RANK[entitlement.plan] >= PLAN_RANK[need];
}

/**
 * Applies a parsed+verified Dodo webhook to the durable entitlement row.
 * Upserts on `accountId` (one row per account). An unmapped event type is a
 * truthful no-op at the entitlement layer (the webhook-events inbox row is
 * still recorded by the caller for audit) — this function never guesses a
 * plan/status it cannot derive from the payload.
 */
export async function applyDodoEvent(
  db: ConnectDb,
  products: DodoProductMap,
  accountId: string,
  eventType: string,
  subscription: DodoSubscriptionPayload,
): Promise<Entitlement | null> {
  const status = statusForEventType(eventType);
  if (!status) return null;

  const plan = status === 'canceled' ? 'free' : planForProductId(products, subscription.product_id);
  const currentPeriodEnd = subscription.next_billing_date ? new Date(subscription.next_billing_date) : null;
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_next_billing_date);
  const dodoSubscriptionId = subscription.subscription_id ?? null;
  const dodoProductId = subscription.product_id ?? null;

  const existing = await db
    .select({ id: connectEntitlements.id })
    .from(connectEntitlements)
    .where(eq(connectEntitlements.accountId, accountId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(connectEntitlements).values({
      id: crypto.randomUUID(),
      accountId,
      plan,
      status,
      dodoSubscriptionId,
      dodoProductId,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(connectEntitlements)
      .set({ plan, status, dodoSubscriptionId, dodoProductId, currentPeriodEnd, cancelAtPeriodEnd, updatedAt: new Date() })
      .where(eq(connectEntitlements.accountId, accountId));
  }

  return { accountId, plan, status, cancelAtPeriodEnd, currentPeriodEnd };
}

/**
 * Offline-cacheable entitlement token for the desktop client: a short-TTL,
 * signed-by-nothing (not a security boundary — the server always re-verifies
 * on reconnect) convenience so the UI does not flash "free" on every cold
 * start before the network call resolves. `issuedAt`/`ttlSeconds` let the
 * client compute `isStale` itself without trusting the server clock blindly.
 */
export interface EntitlementToken {
  readonly entitlement: Entitlement;
  readonly issuedAt: string;
  readonly ttlSeconds: number;
}

export const ENTITLEMENT_CACHE_TTL_SECONDS = 15 * 60;

export function entitlementToken(entitlement: Entitlement): EntitlementToken {
  return { entitlement, issuedAt: new Date().toISOString(), ttlSeconds: ENTITLEMENT_CACHE_TTL_SECONDS };
}

export function isEntitlementTokenStale(token: EntitlementToken, now: Date = new Date()): boolean {
  const issuedAtMs = Date.parse(token.issuedAt);
  if (Number.isNaN(issuedAtMs)) return true;
  return now.getTime() - issuedAtMs > token.ttlSeconds * 1000;
}
