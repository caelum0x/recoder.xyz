/**
 * `MeteringRepository` — the durable data PORT (impl in persistence/).
 *
 * Backs the metering + entitlement services with the Postgres projections:
 * webhook-confirmed subscriptions, invoices, idempotent usage events, and the
 * materialized quota counters that make headroom checks fast and fail-safe.
 *
 * Access control is APP-LAYER only (`WHERE subject_id = :subjectId`) — no
 * Supabase RLS / `auth.uid()`. `isAvailable()` drives truthful health: when the
 * pool is down, the quota path denies (zero headroom) rather than allowing.
 */
import type {
  BillingProviderName,
  BillingSubscription,
  Invoice,
  PlanTier,
  SubscriptionStatus,
  UsageCounter,
  UsageKind,
  UsageRecord,
  WebhookEventRow,
} from '../types.js';

/** Fields for upserting a subscription projection from a webhook. */
export interface SubscriptionUpsert {
  readonly id: string;
  readonly subjectId: string;
  readonly subjectKind: 'user' | 'org';
  readonly plan: PlanTier;
  readonly provider: BillingProviderName;
  readonly providerCustomerId?: string | null;
  readonly providerSubId?: string | null;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd?: string | null;
  readonly cancelAtPeriodEnd: boolean;
}

/** Fields for recording a usage event (id + idempotencyKey required). */
export interface UsageEventInput {
  readonly id: string;
  readonly subjectId: string;
  readonly kind: UsageKind;
  readonly quantity: number;
  readonly runId?: string | null;
  readonly engine?: string | null;
  readonly idempotencyKey: string;
  readonly occurredAt?: string;
}

/** The result of an idempotent write: `inserted:false` ⇒ a duplicate no-op. */
export interface IdempotentWrite {
  readonly inserted: boolean;
}

/** Counter upsert (limit + window) — used to seed/reset a counter. */
export interface CounterUpsert {
  readonly subjectId: string;
  readonly kind: UsageKind;
  readonly windowStart: string;
  readonly usageLimit: number;
  readonly resetAt: string;
}

export interface MeteringRepository {
  // --- Subscriptions (webhook-confirmed projections) ---

  /** The active subscription for a subject (highest-precedence non-canceled), or null. */
  getActiveSubscription(subjectId: string): Promise<BillingSubscription | null>;
  /** Upsert a subscription projection (idempotent on `(provider, providerSubId)`). */
  upsertSubscription(sub: SubscriptionUpsert): Promise<void>;

  // --- Invoices ---

  listInvoices(subjectId: string, limit?: number): Promise<readonly Invoice[]>;
  upsertInvoice(invoice: Invoice): Promise<void>;

  // --- Usage events (durable, idempotent) ---

  /** Record a usage event; a repeated `idempotencyKey` is a no-op (`inserted:false`). */
  recordUsage(event: UsageEventInput): Promise<IdempotentWrite>;
  /** Sum quantity for a subject/kind since `since` (ISO) — the fail-safe headroom read. */
  usageSince(subjectId: string, kind: UsageKind, since: string): Promise<number>;
  /** Unflushed events for the meter batch loop (oldest first). */
  unflushedUsage(limit: number): Promise<readonly UsageRecord[]>;
  /** Mark events flushed after a successful provider meter push. */
  markFlushed(ids: readonly string[], flushedAt: string): Promise<number>;

  // --- Quota counters (materialized headroom) ---

  getCounter(subjectId: string, kind: UsageKind, windowStart: string): Promise<UsageCounter | null>;
  upsertCounter(counter: CounterUpsert): Promise<void>;
  /** Atomically add `delta` to `used`; returns the new `used` value. */
  incrementCounter(subjectId: string, kind: UsageKind, windowStart: string, delta: number): Promise<number>;

  // --- Webhook idempotency ---

  /** Record a received webhook; `inserted:false` ⇒ already seen (dedupe → no-op). */
  recordWebhookEvent(row: Omit<WebhookEventRow, 'receivedAt' | 'processedAt'>): Promise<IdempotentWrite>;
  /** Mark a webhook event processed (audit/reconcile completion). */
  markWebhookProcessed(provider: BillingProviderName, eventId: string, processedAt: string): Promise<void>;
  /**
   * True only when a webhook event was already FULLY processed (its projection
   * committed). This — not mere receipt — is the dedup gate: a prior delivery
   * that faulted mid-projection is left un-processed so a provider retry re-applies
   * it, instead of being permanently dropped.
   */
  wasWebhookProcessed(provider: BillingProviderName, eventId: string): Promise<boolean>;

  /** True when the underlying pool is connectable (drives truthful health). */
  isAvailable(): boolean;
}
